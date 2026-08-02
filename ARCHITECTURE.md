# EV ADAS High-Level & Embedded Architecture

This document provides a technical breakdown of the firmware, communication protocols, and physics models implemented in the EV ADAS Dashboard project. It is intended for embedded systems developers, firmware engineers, and system architects.

---

## 1. High-Level Architecture

The system uses a Hardware-in-the-Loop (HIL) architecture where the safety critical controller runs on an emulated ARM Cortex-M3 core, and the user interface runs on a host PC. Communication is bidirectional and asynchronous over a simulated UART serial bus.

```mermaid
graph TD
    subgraph Inputs [Physical/Simulated Inputs]
        POT_ACC["PA0: Accelerator Potentiometer"]
        POT_BRK["PA1: Brake Potentiometer"]
        POT_TMP["PA3: Motor NTC Thermistor"]
        US_F["PB0/PB1: Echo/Trig Front HC-SR04"]
        US_L["PB2/PB3: Echo/Trig Left HC-SR04"]
        US_R["PB4/PB5: Echo/Trig Right HC-SR04"]
    end

    subgraph Controller [STM32F103C8 Controller Core]
        subgraph Drivers [Peripherals & Drivers]
            ADC["ADC1 Multi-channel"]
            TIM1["TIM1 Scheduler 100Hz"]
            TIM3["TIM3 Scheduler 10Hz"]
            TIM2["TIM2 Microsecond Counter"]
            TIM4["TIM4 Buzzer PWM Generator"]
            USART1["USART1 Telemetry & CLI Port"]
        end

        subgraph Modules [Application Logic]
            EV_Dyn["EV Dynamics Engine"]
            ADAS_Eng["ADAS Decision Engine"]
            Fault_Mgr["Diagnostic Fault Manager"]
            UART_Shell["Diagnostic Ring Buffer CLI"]
        end
    end

    subgraph Outputs [Safety & Alert Outputs]
        BUZZ["PB6: PWM Buzzer Output"]
        LED_C["PB8: Collision Indicator LED"]
        LED_L["PB9: Left BSD Alert LED"]
        LED_R["PB10: Right BSD Alert LED"]
        CONT["PB11: Safety Contactor / Fault LED"]
    end

    subgraph Host [Host Visualization PC]
        Ser["PySerial Reader Thread"]
        Queue["Telemetry Parser & State Cache"]
        GUI["Matplotlib Render Thread"]
    end

    %% Sensor to driver mappings
    POT_ACC & POT_BRK & POT_TMP -->|Analog Signal| ADC
    US_F & US_L & US_R -->|Echo Pulse Width| TIM2
    
    %% Drivers to firmware modules
    ADC -->|Raw Ingest| EV_Dyn
    TIM2 -->|Sensor Ranges| ADAS_Eng
    TIM1 & TIM3 -->|Rate Flags| EV_Dyn & ADAS_Eng
    
    %% Internal data pathways
    EV_Dyn -->|Speed, Torq| ADAS_Eng
    EV_Dyn & ADAS_Eng -->|Fault States| Fault_Mgr
    Fault_Mgr -->|Safety Shutdown Trigger| EV_Dyn
    
    %% Module outputs
    ADAS_Eng -->|Trigger Alerts| TIM4
    ADAS_Eng -->|Alert Lines| LED_C & LED_L & LED_R
    Fault_Mgr -->|Contactor Control| CONT
    
    %% Telemetry bridging
    EV_Dyn & ADAS_Eng & Fault_Mgr -->|ASCII Packets| USART1
    USART1 ====>|Virtual Serial Link 115200 8N1| Ser
    
    %% CLI Backchannel
    Ser -->|CLI Config Command bytes| USART1
    USART1 -->|Push to Buffer| UART_Shell
    UART_Shell -->|Override State parameters| EV_Dyn & ADAS_Eng
    
    %% Host Processing
    Ser --> Queue
    Queue --> GUI
```

---

## 2. Layered Architecture

The firmware is structured into standard automotive software layers to isolate hardware dependencies from the business logic:

| Layer | Files | Description |
|---|---|---|
| **Application Layer** | `ev_control.c`, `adas.c`, `fault.c` | Core logic for vehicle physics, hazard monitoring, and fault management. |
| **Communication Layer** | `uart_shell.c` | ASCII telemetry compiler and command parser. |
| **Drivers / Middleware** | `ultrasonic.c` | Hardware drivers for HC-SR04 sensors. |
| **HAL Layer** | `stm32f1xx_hal.c`, `stm32f1xx_hal_adc.c` | STMicroelectronics Hardware Abstraction Layer APIs. |
| **Hardware Layer** | `stm32f103c8tx` | Physical microcontroller registers and pins. |

---

## 3. Firmware Module Architecture

### `main.c`
The entry point of the firmware. It initializes clocks, configured peripherals, and variables. It hosts the cooperative multi-rate scheduler inside the infinite loop and defines Timer and UART interrupt callbacks.
- **Header Link**: [main.h](Core/Inc/main.h)
- **Source Link**: [main.c](Core/Src/main.c)

### `ev_control.c`
Implements the vehicle physics engine. It converts accelerator inputs to motor torque, integrates acceleration to update speed, calculates battery energy consumption, and runs the motor thermal model.
- **Header Link**: [ev_control.h](Core/Inc/ev_control.h)
- **Source Link**: [ev_control.c](Core/Src/ev_control.c)

### `adas.c`
Calculates Time-To-Collision (TTC) using ultrasonic inputs and vehicle speed, triggers blind-spot warnings based on left/right clearances, and evaluates overall alarm priorities.
- **Header Link**: [adas.h](Core/Inc/adas.h)
- **Source Link**: [adas.c](Core/Src/adas.c)

### `fault.c`
Monitors system parameters against safe operating limits. It sets active fault bits and forces the vehicle into a safe state if limits are exceeded.
- **Header Link**: [fault.h](Core/Inc/fault.h)
- **Source Link**: [fault.c](Core/Src/fault.c)

### `uart_shell.c`
Manages an interactive diagnostic shell. It processes commands char-by-char from a ring buffer, enabling parameter injection, fault simulation, and diagnostic reads.
- **Header Link**: [uart_shell.h](Core/Inc/uart_shell.h)
- **Source Link**: [uart_shell.c](Core/Src/uart_shell.c)

### `ultrasonic.c`
Handles raw HC-SR04 sensor interfaces. It sends a 10 $\mu\text{s}$ trigger pulse, measures the return echo duration using timer tick counts, and returns calculated distances.
- **Header Link**: [ultrasonic.h](Core/Inc/ultrasonic.h)
- **Source Link**: [ultrasonic.c](Core/Src/ultrasonic.c)

---

## 4. Scheduler Architecture

The system uses a rate-monotonic, cooperative multitasking scheduler powered by hardware timer interrupts. Two flags (`flag_ev` and `sensor_flag`) trigger execution loops at fixed intervals.

```mermaid
sequenceDiagram
    autonumber
    participant HW as "Microcontroller Timers"
    participant ISR as "Interrupt Services (IT)"
    participant Executive as "Main Background Loop"
    participant Dynamics as "EV Control Module"
    participant ADAS as "ADAS Safety Engine"
    participant Fault as "Fault Manager"
    participant Shell as "CLI Processor"

    %% 10ms Tick Loop
    Note over HW, Executive: Timer 1 triggers at 100 Hz (every 10ms)
    HW->>ISR: TIM1 Overflow Interrupt
    ISR->>Executive: Set flag_ev = 1
    activate Executive
    Executive->>Dynamics: EV_ReadADC() and EV_Update(dt = 0.01s)
    activate Dynamics
    Dynamics-->>Executive: Returns current Speed, SOC, Torque
    deactivate Dynamics
    Note over Executive: Every 10th loop (1s), calls Print_Status() to Tx UART
    deactivate Executive

    %% 100ms Tick Loop
    Note over HW, Executive: Timer 3 triggers at 10 Hz (every 100ms)
    HW->>ISR: TIM3 Overflow Interrupt
    ISR->>Executive: Set sensor_flag = 1
    activate Executive
    Executive->>HW: Trigger ultrasonic echoes
    HW-->>Executive: Echo widths measured
    Executive->>ADAS: ADAS_Update()
    activate ADAS
    ADAS-->>Executive: Returns Alerts, Warn levels, and TTC
    deactivate ADAS
    Executive->>Fault: Fault_Check()
    activate Fault
    Fault-->>Executive: Updates safety contactor state
    deactivate Fault
    Executive->>Shell: Shell_Process()
    activate Shell
    Shell-->>Executive: Parses and applies CLI modifications
    deactivate Shell
    deactivate Executive
```

---

## 5. Vehicle State Machine

The vehicle state machine manages operational modes and safety transitions:

```mermaid
stateDiagram-v2
    [*] --> STATE_PARKED : System Boot
    
    note right of STATE_PARKED
        Torque demand zeroed.
        Battery energy static.
    end note
    note right of STATE_READY
        Pre-charge contactors closed.
        Traction system enabled.
    end note
    note right of STATE_DRIVING
        Acceleration maps to positive torque.
    end note
    note right of STATE_REGEN
        Brake pedal maps to negative torque.
        Battery SOC recharges.
    end note
    note right of STATE_FAULT
        Contactor tripped (PB11 High).
        Traction torque locked at 0.
    end note

    STATE_PARKED --> STATE_READY : Accelerator Pedal Above 2%
    STATE_READY --> STATE_DRIVING : Auto Transition (Traction enabled)
    
    STATE_DRIVING --> STATE_REGEN : Brake Pedal Above 5%
    STATE_REGEN --> STATE_DRIVING : Brake Pedal Below or Equal 5%
    
    STATE_DRIVING --> STATE_FAULT : Thermal Event / Critical Low SOC / Critical Collision
    STATE_REGEN --> STATE_FAULT : Thermal Event / Critical Low SOC / Critical Collision
    STATE_READY --> STATE_FAULT : Critical Fault Detected
    STATE_PARKED --> STATE_FAULT : Critical Fault Detected
    
    STATE_FAULT --> STATE_PARKED : Fault Clear Command (Variables reset)
```

---

## 6. EV Dynamics Pipeline

The physics engine simulates the mechanical and electrical characteristics of an EV powertrain:

```mermaid
flowchart TD
    %% Inputs
    IN_A["PA0: Accelerator Position %"]
    IN_B["PA1: Brake Position %"]
    IN_M["Drive Mode Selection: ECO/NORMAL/SPORT"]
    
    %% Mechanical Path
    MAP_T["Drive Mode Torque Scale"]
    TRQ_D["Traction Torque Demand"]
    TRQ_R["Regenerative Torque Demand"]
    NET_F["Net Traction Force"]
    ACC_C["Euler Acceleration Integration"]
    VEL_C["Update Vehicle Speed"]
    
    %% Electrical Path
    MECH_P["Mechanical Power: T * w"]
    LOSS_P["Copper Loss Power: I^2R"]
    NET_E["Net Electrical Power"]
    SOC_I["SOC Energy Integration"]
    RNG_P["Range Prediction"]
    
    %% Connections Mechanical
    IN_A & IN_M --> MAP_T --> TRQ_D
    IN_B --> TRQ_R
    TRQ_D & TRQ_R --> NET_F
    NET_F --> ACC_C
    ACC_C --> VEL_C
    
    %% Connections Electrical
    VEL_C & NET_F --> MECH_P
    TRQ_D & TRQ_R --> LOSS_P
    MECH_P & LOSS_P --> NET_E
    NET_E --> SOC_I
    SOC_I & IN_M --> RNG_P
```

### Key Mathematical Equations

#### 1. Torque Demand ($T_{demand}$)
Traction torque is scaled by the active drive mode (ECO: 0.6x, NORMAL: 1.0x, SPORT: 1.3x):
$$T_{traction} = \left(\frac{Pedal\%}{100}\right) \times T_{max} \times S_{mode}$$
When the brake pedal is pressed past the 5% regeneration threshold:
$$T_{regen} = -\left(\frac{Brake\%}{100}\right) \times 0.70 \times T_{regen\_max}$$

#### 2. Speed Calculation ($v_{kmh}$)
Integrated at 100 Hz using Euler integration. Net torque is adjusted for drag force:
$$\text{Drag Torque } (T_{drag}) = v_{ms} \times C_d$$
$$\text{Acceleration } (a) = \frac{T_{net} - T_{drag}}{Mass}$$
$$v_{ms} = v_{ms} + a \times dt$$
$$v_{kmh} = v_{ms} \times 3.6$$

#### 3. Power Balance & Battery SOC ($SOC_{pct}$)
Instaneous electrical power includes mechanical load and copper losses ($I^2R$, modeled as proportional to torque squared):
$$P_{mech} = T_{net} \times v_{ms} \times 10^{-3} \quad (\text{kW})$$
$$P_{loss} = \left(\frac{T_{net}}{T_{max}}\right)^2 \times 5.0 \quad (\text{kW})$$
$$P_{total} = P_{mech} + P_{loss} \quad (\text{kW})$$
$$\Delta SOC = \frac{P_{total} \times dt}{Cap_{battery} \times 3600} \times 100 \times Scale_{simulation}$$

> [!NOTE]
> The simulation scale factor (`EV_SIM_SCALE = 500.0f`) accelerates SOC depletion and regeneration rates for laboratory testing.

---

## 7. ADAS Engine

The ADAS engine monitors safety thresholds and manages alerts:

```mermaid
flowchart TD
    %% Inputs
    IN_SPD["Vehicle Speed km/h"]
    IN_F["Front Sensor cm"]
    IN_L["Left Sensor cm"]
    IN_R["Right Sensor cm"]

    %% Calcs
    TTC_CALC["TTC Calculation: dist / speed"]
    
    %% Hazard Evaluators
    FCW_CHECK["FCW Warn/Crit Evaluator"]
    BSD_CHECK["BSD Left/Right Gate"]
    OVR_CHECK["Overspeed Evaluator"]
    
    %% Hysteresis
    FCW_HYST["FCW Alert Filter"]
    BSD_HYST["BSD Alert Filter"]
    OVR_HYST["Overspeed Filter"]
    
    %% Outputs
    ALARM_P["Determine Alarm Priority"]
    DRV_LED["Drive Alerts to LEDs & Pin Indicators"]

    %% Connectors
    IN_SPD & IN_F --> TTC_CALC
    TTC_CALC --> FCW_CHECK
    IN_L & IN_SPD --> BSD_CHECK
    IN_R & IN_SPD --> BSD_CHECK
    IN_SPD --> OVR_CHECK
    
    FCW_CHECK --> FCW_HYST
    BSD_CHECK --> BSD_HYST
    OVR_CHECK --> OVR_HYST
    
    FCW_HYST & BSD_HYST & OVR_HYST --> ALARM_P
    ALARM_P --> DRV_LED
```

### Collision Evaluation Logic
- **Time-to-Collision (TTC)**: Calculated only if relative speed exceeds 0.5 m/s and distance is under 2.0 meters:
  $$\text{TTC} = \frac{Distance_{front} \times 10^{-2}}{v_{ms}} \quad (\text{seconds})$$
- **Hysteresis Filtering**: Prevents alert flickering near threshold boundaries. When a condition triggers, the warning latch counter is set to 3. The alert remains active until the counter counts down to 0 over subsequent safe cycles.

---

## 8. Fault Manager

The Fault Manager protects system components. It operates as a latching safety monitor:

```mermaid
flowchart TD
    %% Monitors
    M_OT["Motor Temp >= 90 degC"]
    M_SOC["Battery SOC <= 2%"]
    M_COL["Critical Collision: Distance < 20cm OR TTC < 1.5s"]

    %% Latching
    FAULT_L["Set Fault Bitmask & Latch Active Status"]
    
    %% Safe State Actions
    SAFE_ST["Transition state to STATE_FAULT"]
    CON_TRIP["Assert Contactor Pin PB11 HIGH"]
    TRQ_LOCK["Force Motor Torque to 0"]
    
    %% Recovery Path
    CMD_CLR["CLI Command: fault clear"]
    REC_INIT["Execute Re-initialization & Reset parameters"]
    NORM_RET["Transition state to STATE_PARKED"]

    %% Flow
    M_OT & M_SOC & M_COL -->|Safety Event Trigger| FAULT_L
    FAULT_L --> SAFE_ST
    SAFE_ST --> CON_TRIP & TRQ_LOCK
    
    CMD_CLR --> REC_INIT
    REC_INIT --> NORM_RET
```

---

## 9. UART Communication & Diagnostics

Communication with the host PC is handled by USART1. The configuration is **115200 baud, 8 data bits, no parity, 1 stop bit (8N1)**.

### CLI Interactive Sequence

```mermaid
sequenceDiagram
    participant PC as "Python App / Serial Monitor"
    participant ISR as "STM32 UART Rx Interrupt"
    participant RB as "Ring Buffer"
    participant Shell as "Shell Command Module"
    participant Core as "Firmware Core State"

    PC->>ISR: Character Sent (e.g., 'm')
    ISR->>RB: Push character to _rb
    ISR->>ISR: Re-arm UART Rx Interrupt
    
    Note over RB, Shell: Main Loop executes Shell_Process()
    RB->>Shell: Pop characters from queue
    Shell->>PC: Echo character back (Console feedback)
    
    PC->>ISR: Carriage Return '\n'
    ISR->>RB: Push '\n'
    RB->>Shell: Pop '\n' (Trigger evaluation)
    
    Shell->>Shell: Parse buffer using sscanf()
    alt Command Valid (e.g., "mode sport")
        Shell->>Core: Update ev->drive_mode = DRIVE_MODE_SPORT
        Shell->>PC: Tx "OK\r\n> "
    else Command Invalid
        Shell->>PC: Tx "Unknown command. Type 'help'\r\n> "
    end
```

---

## 10. Python Dashboard Architecture

The dashboard is built with Python 3 and runs two threads:

```mermaid
flowchart TD
    subgraph Serial_Thread ["Serial Reader Thread"]
        RD_COM["Read Serial Stream"]
        RG_PAR["Regex Frame Extraction"]
        SH_STA["Write Shared State Dictionary"]
    end

    subgraph Render_Thread ["Matplotlib GUI Loop"]
        EV_REF["FuncAnimation 100ms Trigger"]
        RD_STA["Read Shared State Cache"]
        
        %% Render sub-functions
        DRW_S["Draw Speedometer gauge"]
        DRW_B["Draw Battery SOC status"]
        DRW_T["Draw Speed Trend line"]
        DRW_I["Draw Digital Metrics Panel"]
        DRW_A["Draw Bird-eye Obstacle view"]
        
        FLSH_B["Flash Background red on Alarm Crit"]
    end

    RD_COM --> RG_PAR --> SH_STA
    SH_STA -.->|Thread-Safe Read| RD_STA
    
    RD_STA --> EV_REF
    EV_REF --> DRW_S & DRW_B & DRW_T & DRW_I & DRW_A
    DRW_I & DRW_A --> FLSH_B
```

---

## 11. Timing Architecture

The cooperative scheduler timing is managed by three STM32 timers:

### Timer Configuration Formulas

#### 1. TIM1: 10ms Scheduler Base (100 Hz)
- **Input Clock**: APB2 Clock = 72 MHz
- **Prescaler (PSC)**: 71 (Divides clock by 72 -> 1 MHz timer clock)
- **Auto-Reload Register (ARR)**: 9999 (Counts 10,000 ticks)
$$\text{Update Frequency} = \frac{72,000,000}{(71 + 1) \times (9999 + 1)} = 100 \quad \text{Hz}$$

#### 2. TIM3: 100ms Sensor Base (10 Hz)
- **Input Clock**: APB1 Clock = 36 MHz (multiplied to 72 MHz internally for timers)
- **Prescaler (PSC)**: 7199 (Divides clock by 7200 -> 10 kHz timer clock)
- **Auto-Reload Register (ARR)**: 999 (Counts 1000 ticks)
$$\text{Update Frequency} = \frac{72,000,000}{(7199 + 1) \times (999 + 1)} = 10 \quad \text{Hz}$$

#### 3. TIM2: Ultrasonic Echo Timing (Microseconds)
- **Input Clock**: APB1 Clock = 36 MHz (multiplied to 72 MHz internally)
- **Prescaler (PSC)**: 0 (Timer runs at full 72 MHz resolution)
- **ARR**: 65535 (16-bit rollover)

> [!IMPORTANT]
> **TIM2 Microsecond Metric**:
> Because the prescaler is set to 0, TIM2 increments at 72 MHz. In `ultrasonic.c`, this timer is used for microsecond measurements:
> `pulse_us = echo_fall - echo_rise;`
> In this configuration, one increment of the counter represents 13.88 ns. When compiling measurements, ensure values are adjusted for this frequency.

---

## 12. Design Decisions

- **UART over CAN**: Selected to simplify host PC interface requirements. UART can be routed over a standard USB-to-TTL serial adapter, avoiding the need for dedicated CAN interface hardware.
- **STM32 HAL Library**: Used to improve code portability across STM32 microcontrollers.
- **Cooperative rate scheduler**: Chosen over a full RTOS (like FreeRTOS) to reduce CPU and memory overhead on the STM32F103C8T6. This approach avoids task context switching latency and fits within the device's flash memory.
- **PICSimLab**: Selected as the HIL simulation platform. It emulates MCU registers, analog input signals, and ultrasonic echo pulses, allowing testing without physical hardware.

---

## 13. Scalability & Path to Production

To transition this prototype into a production-grade automotive electronic control unit (ECU), implement the following modifications:

```mermaid
graph TD
    subgraph Prototype ["Simulated Prototype"]
        UART["UART Serial link"]
        Sched["Cooperative Scheduler"]
        Sim_S["Simulated Sensors"]
        Poll_A["Polled ADC & Serial"]
    end

    subgraph Production ["Production Grade ECU"]
        CAN["CAN / CAN-FD Bus"]
        OS["Preemptive RTOS (OSEK/VDX or FreeRTOS)"]
        Sens["Automotive Grade Sensors"]
        DMA["DMA-managed ADC & UART"]
    end

    UART -->|Upgrade to differential bus| CAN
    Sched -->|Upgrade to priority scheduling| OS
    Sim_S -->|Replace with robust transceivers| Sens
    Poll_A -->|Offload core CPU cycles| DMA
```

- **CAN Bus Migration**: Replace the UART bridge with a CAN-controller transceiver (e.g., MCP2515 or STM32 bxCAN peripheral) to broadcast vehicle parameters as CAN messages.
- **Real-Time OS Integration**: Migrate the cooperative scheduler to a preemptive operating system (such as OSEK/VDX or FreeRTOS) to enforce task priorities and meet strict timing constraints.
- **Automotive Grade Sensors**: Replace the simulated HC-SR04 sensors with LIN/CAN-based automotive ultrasonic sensors to improve environmental resilience and range accuracy.
- **DMA Offloading**: Configure DMA streams for ADC scans and UART transmissions. This reduces CPU utilization by transferring data directly to memory without processor intervention.
