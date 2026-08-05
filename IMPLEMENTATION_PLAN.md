# Implementation Plan: Version 2 – Phase 2

This plan details the implementation steps required to complete **Version 2 – Phase 2 (Simulation-Based Embedded Platform)**. The features are organized into small, sequential development chunks to ensure modularity, easy debugging, and safe integration in the PICSimLab simulation environment.

---

## Feature 1: Driver Abstraction Layer (DAL)
*Goal: Decouple raw STM32 HAL register calls and peripheral hardware definitions from core physics and safety math.*

### Chunk 1.1: ADC Abstraction (`dal_adc`)
1.  **Create Headers & Sources**: Create `dal_adc.h` and `dal_adc.c`.
2.  **Define Interfaces**:
    *   `void DAL_ADC_Init(ADC_HandleTypeDef *hadc);`
    *   `void DAL_ADC_StartRead(void);`
    *   `float DAL_ADC_GetPercentage(uint32_t channel);` (maps PA0, PA1, PA3 to 0-100.0f).
3.  **Refactor core logic**: Replace direct `HAL_ADC_Start` and channel conversion calls in [ev_control.c](file:///d:/Projects/Internship/Emertxe/ev_dash/Core/Src/ev_control.c) with `DAL_ADC_GetPercentage()`.

*   **Dependencies**: STM32 HAL ADC libraries.
*   **Acceptance Criteria**:
    *   No direct calls to `HAL_ADC_Start`, `HAL_ADC_PollForConversion`, or `HAL_ADC_GetValue` are present in `ev_control.c`.
    *   Percentage calculations correctly translate 12-bit ADC ranges (0-4095) to float percentages (0.0f - 100.0f).
*   **Testing/Validation**: Adjust the accelerator/brake slide potentiometers in PICSimLab; verify that the serial diagnostic status printout shows smooth, proportional speed and brake updates matching the physical slider inputs.
*   **Possible Challenges**: Conversion latency if the ADC is polled synchronously. *Mitigation*: Configure the regular channels for continuous scanning or DMA injection inside `dal_adc.c`.

### Chunk 1.2: UART Transmit Abstraction (`dal_uart`)
1.  **Create Headers & Sources**: Create `dal_uart.h` and `dal_uart.c`.
2.  **Define Interfaces**:
    *   `void DAL_UART_Init(UART_HandleTypeDef *huart);`
    *   `void DAL_UART_SendAsync(const uint8_t *data, uint16_t len);` (encapsulates asynchronous transmit interrupts).
3.  **Refactor scheduler**: Replace direct `HAL_UART_Transmit` calls in [main.c](file:///d:/Projects/Internship/Emertxe/ev_dash/Core/Src/main.c) with the asynchronous DAL helper.

*   **Dependencies**: STM32 HAL UART libraries, Chunk 1.1.
*   **Acceptance Criteria**: Transmissions are processed via non-blocking interrupts (`HAL_UART_Transmit_IT`) or DMA, preventing CPU loop pauses during telemetry pushes.
*   **Testing/Validation**: Connect the serial bridge monitor and confirm that the transmission loop operates at a steady 10Hz frame rate without drops, while keeping other loops (like shell parsing) fully responsive.
*   **Possible Challenges**: Ring buffer overflow if multiple data segments are pushed faster than the baud rate can transmit. *Mitigation*: Add check conditions to verify that the transmit buffer is not busy before queuing fresh telemetry packets.

---

## Feature 2: Priority Alarm Manager
*Goal: Decouple alarm levels from multiple sensors and resolve their priority queue before driving the buzzer.*

### Chunk 2.1: Alarm Manager Module (`alarm_manager`)
1.  **Create Headers & Sources**: Create `alarm_manager.h` and `alarm_manager.c`.
2.  **Define Structures & Enums**:
    *   `typedef enum { ALERT_FAULT, ALERT_FCW, ALERT_BSD, ALERT_OVERSPEED } AlertSource_t;`
3.  **Define Interfaces**:
    *   `void AlarmManager_Init(void);`
    *   `void AlarmManager_SetAlert(AlertSource_t source, AlarmLevel_t level);`
    *   `void AlarmManager_ClearAlert(AlertSource_t source);`
    *   `void AlarmManager_Update(void);` (Ticked at 10ms to compare queue priority and update [buzzer.c](file:///d:/Projects/Internship/Emertxe/ev_dash/Core/Src/buzzer.c)).
4.  **Priority Rules**: `ALERT_FAULT` (Critical) > `ALERT_FCW` (Warning/Critical) > `ALERT_BSD` (Advisory) > `ALERT_OVERSPEED` (Advisory).

*   **Dependencies**: [buzzer.h](file:///d:/Projects/Internship/Emertxe/ev_dash/Core/Inc/buzzer.h).
*   **Acceptance Criteria**:
    *   The highest active alarm level in the queue determines the buzzer frequency.
    *   Setting multiple alarms results in the highest priority overriding lower ones.
*   **Testing/Validation**: Write a simple harness calling `AlarmManager_SetAlert()` with overlapping values (e.g. set BSD and Fault alerts). Confirm that the buzzer selects the Fault alert and sounds the $2.5\text{ kHz}$ critical siren.
*   **Possible Challenges**: State bouncing if alarms clear and reset rapidly. *Mitigation*: Enforce a lock timer in the alarm transitions to ensure alerts sound for at least 500ms before changing states.

### Chunk 2.2: Scheduler Hook Integration
1.  **Modify Scheduler**:
    *   Remove inline alarm resolution blocks in the main loop of `main.c`.
    *   Hook `AlarmManager_Update()` into the 10ms cooperative timer loop.
    *   Update [adas.c](file:///d:/Projects/Internship/Emertxe/ev_dash/Core/Src/adas.c) to feed warnings into `AlarmManager_SetAlert()`.

*   **Dependencies**: Chunk 2.1.
*   **Acceptance Criteria**: The main scheduler loop executes without inline checks. ADAS warning outputs are routed to the alarm manager.
*   **Testing/Validation**: Trigger collision warnings in PICSimLab by bringing the ultrasonic sensor target closer, and confirm that the alarm manager processes the hazard and starts the buzzer immediately.
*   **Possible Challenges**: Scheduler tick overruns if the update loop takes too long to execute. *Mitigation*: Keep `AlarmManager_Update` logic lightweight with direct index evaluations and no search loops.

---

## Feature 3: DTC & Freeze Frame Diagnostic Engine
*Goal: Record Diagnostic Trouble Codes (DTCs) and capture freeze-frame datasets (speed, SOC, temp) during system faults.*

### Chunk 3.1: DTC Registry Core (`dtc`)
1.  **Create Headers & Sources**: Create `dtc.h` and `dtc.c`.
2.  **Define Diagnostic Structures**:
    ```c
    typedef struct {
        uint32_t dtc_code;      // Mapped hex code (e.g. 0x0A80 for Overheat)
        float speed_snapshot;
        float soc_snapshot;
        float temp_snapshot;
        uint32_t timestamp;
    } FreezeFrame_t;
    ```
3.  **Define Interfaces**:
    *   `void DTC_Init(void);`
    *   `void DTC_Log(uint32_t code, float speed, float soc, float temp);` (appends record to log array).
    *   `DTC_Record_t* DTC_GetRecords(uint32_t *count);`
    *   `void DTC_ClearAll(void);`

*   **Dependencies**: None.
*   **Acceptance Criteria**:
    *   DTC logging creates correct entries in the RAM database array.
    *   Logging records the exact speed, SOC, and temp snap values at the moment of invocation.
*   **Testing/Validation**: Call `DTC_Log` with mock parameters in a debug configuration. Verify that the recorded metrics match the input arguments exactly.
*   **Possible Challenges**: Out-of-memory array limits if too many DTCs trigger. *Mitigation*: Limit the registry size to a fixed-size ring buffer of the latest 10 faults.

### Chunk 3.2: Fault Hook & Shell Query Commands
1.  **Hook Faults**: Update [fault.c](file:///d:/Projects/Internship/Emertxe/ev_dash/Core/Src/fault.c) to call `DTC_Log()` when limits are breached, passing snapshot metrics.
2.  **Query CLI command**: Add `dtc read` and `dtc clear` commands inside `uart_shell.c` to read DTC histories and freeze-frame snapshots over UART.

*   **Dependencies**: Chunk 3.1.
*   **Acceptance Criteria**:
    *   System overtemperature, low battery, or critical warnings automatically log respective DTC identifiers.
    *   The UART console parses `dtc read` and outputs the recorded freeze frames.
*   **Testing/Validation**: Run a thermal event simulation in PICSimLab (temp > 80°C). Confirm that the contactor trips, then type `dtc read` in the CLI terminal. Verify that it prints the motor overheat DTC and shows the temperature at which the fault occurred.
*   **Possible Challenges**: Concurrency collisions if a DTC registers while the UART shell is reading the array. *Mitigation*: Put array copy routines inside a short critical section (`__disable_irq()` / `__enable_irq()`).

---

## Feature 4: Persistent Configuration Manager
*Goal: Read and write ADAS warning parameters to simulated non-volatile storage (STM32 Flash page).*

### Chunk 4.1: Flash Page Write Interface (`dal_flash`)
1.  **Create Headers & Sources**: Create `dal_flash.h` and `dal_flash.c`.
2.  **Define Interfaces**:
    *   `uint8_t DAL_Flash_WritePage(uint32_t page_address, uint32_t *data, uint16_t length);` (unlocks flash, erases page, writes buffer, relocks).
    *   `void DAL_Flash_ReadPage(uint32_t page_address, uint32_t *dest, uint16_t length);`

*   **Dependencies**: STM32 HAL Flash libraries.
*   **Acceptance Criteria**: Writes/reads data buffer to target page address cleanly without affecting code execution.
*   **Testing/Validation**: Write a pattern block of bytes to the flash page in main, read it back, and verify equality.
*   **Possible Challenges**: Flash writes are slow and lock the CPU. *Mitigation*: Only write configuration parameters when they are updated by the user, not dynamically in scheduler loops.

### Chunk 4.2: Configuration Manager Module (`config_manager`)
1.  **Create Headers & Sources**: Create `config_manager.h` and `config_manager.c`.
2.  **Define Settings Structure**: Create a configuration struct containing parameters: `fcw_warn`, `fcw_crit`, `bsd_dist`, `overspeed`, `ttc_warn`, `ttc_crit`, and a validation signature.
3.  **Define Interfaces**:
    *   `void Config_Init(void);` (reads settings from page address `0x0800F800` (62KB offset). Restores defaults if signature mismatch is detected).
    *   `void Config_Save(void);` (packages parameters and writes to flash).
4.  **CLI Hook**: Link parameter command `set <param> <val>` inside `uart_shell.c` to write to the memory struct and call `Config_Save()`.

*   **Dependencies**: Chunk 4.1.
*   **Acceptance Criteria**:
    *   Changing variables via `set` commands saves them to flash.
    *   Rebooting the STM32 board retains the customized warning thresholds.
*   **Testing/Validation**: Change the FCW distance: `set fcw_warn 60`. Reset the PICSimLab simulator, trigger the status check, and verify that the active FCW threshold remains configured to `60` instead of the baseline default of `50`.
*   **Possible Challenges**: Flash wear during long testing sessions. *Mitigation*: Limit write triggers in the emulator code. The signature field ensures that we only update flash memory when a parameter check registers a difference.

---

## Feature 5: Binary Telemetry Protocol
*Goal: Package telematic streams into structured binary frames to reduce UART bandwidth.*

### Chunk 5.1: Packed Protocol Schema (`telemetry_protocol`)
1.  **Create Header**: Create `telemetry_protocol.h`.
2.  **Define Packed Data Payload**:
    ```c
    typedef struct __attribute__((packed)) {
        uint8_t start_marker;    // SLIP marker 0xC0
        uint32_t timestamp;
        uint32_t sequence;
        float speed;
        float soc;
        int16_t torque;
        float temp;
        uint16_t range;
        float front;
        float left;
        float right;
        float ttc;
        uint8_t alarm_level;
        uint8_t active_dtcs;
        uint16_t crc16;
        uint8_t end_marker;      // SLIP marker 0xC0
    } BinaryTelemetryPacket_t;
    ```

*   **Dependencies**: `common.h`.
*   **Acceptance Criteria**:
    *   The compiler forces zero padding inside the struct (sizeof matches exact sum of variable sizes = 40 bytes).
    *   Start and end bytes are wrapped with SLIP boundary markers (`0xC0`).
*   **Testing/Validation**: Run a test build in CubeIDE and assert `sizeof(BinaryTelemetryPacket_t) == 40` using a static compiler check (`_Static_assert`).
*   **Possible Challenges**: Compiler-specific packing syntax. *Mitigation*: Use the standard `__attribute__((packed))` macro for GCC compilation.

### Chunk 5.2: Binary Telemetry Encoder (`telemetry_encoder`)
1.  **Create Headers & Sources**: Create `telemetry_encoder.h` and `telemetry_encoder.c`.
2.  **Define Interfaces**:
    *   `uint16_t Telemetry_Pack(uint8_t *buffer, const TelemetryData_t *data);` (compiles variables, computes CRC-16, and packages structure into a serializable array).
3.  **Firmware Integration**: Modify the transmission tick inside `main.c` to call `Telemetry_Pack()` and transmit the array over USART.

*   **Dependencies**: Chunk 5.1.
*   **Acceptance Criteria**: Packets are built and transmitted correctly, with CRC-16 checksums appended.
*   **Testing/Validation**: View the UART serial data in raw hex output format using an external terminal, and confirm that the streams are consistently wrapped inside `C0` boundary markers.
*   **Possible Challenges**: Binary bytes matching the `0xC0` boundary character occurring inside the payload data fields. *Mitigation*: Implement standard SLIP escaping (`0xC0` $\rightarrow$ `0xDB 0xDC`, `0xDB` $\rightarrow$ `0xDB 0xDD`) during packaging.

### Chunk 5.3: Python Gateway Bridge Binary Decoder
1.  **Modify Python Bridge**: Update `telemetry_bridge/app/parser.py` or `serial_mgr.py` to:
    *   Monitor the serial stream for packet boundaries (`0xC0` byte markers).
    *   Extract raw bytes, verify the CRC-16 checksum, and unpack metrics matching the C struct sizes.
    *   Distribute the parsed parameters over local WebSockets in JSON format.

*   **Dependencies**: Chunk 5.2.
*   **Acceptance Criteria**:
    *   The bridge parses binary byte arrays, validates CRC-16, and decodes signals.
    *   The React Dashboard telemetry metrics update correctly.
*   **Testing/Validation**: Launch the bridge with `--port COM2`. Connect the PICSimLab simulator to the COM link. Move sensors and verify the dashboard gauges show smooth updates with zero packet drops.
*   **Possible Challenges**: Endianness mismatch between Python's struct unpack module and the STM32 memory layout. *Mitigation*: Specify the byte order character (`<` for Little-Endian) inside Python's `struct.unpack()` calls.
