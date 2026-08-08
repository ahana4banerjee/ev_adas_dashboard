# Binary Telemetry Protocol Specification (v2.2)

---

## 1. Overview

The EV ADAS platform employs a **48-byte packed binary telemetry protocol** framed via the standard **Serial Line Internet Protocol (SLIP, RFC 1055)** with **CRC-16-CCITT** error detection. This protocol replaces verbose ASCII CSV strings, reducing serial bus bandwidth by over $68\%$ and eliminating floating-point string conversion latency on the microcontroller.

```text
[Telemetry Loop @ 20Hz]
         │
         ▼
[TelemetryPacket_t (48 Bytes)]
         │
         ▼
[Calculate CRC-16 (Bytes 0x00 - 0x2D)]
         │
         ▼
[SLIP Byte Escaping (0xC0 -> 0xDB 0xDC, 0xDB -> 0xDB 0xDD)]
         │
         ▼
[Frame Delimitation: 0xC0 ... [Escaped Bytes] ... 0xC0]
         │
         ▼
[USART1 Transmission @ 115200 Baud]
```

---

## 2. Frame Structure & Byte Layout

### Binary Struct Definition (`TelemetryPacket_t`)
All multi-byte integer and IEEE-754 single-precision floating-point fields are packed with **1-byte alignment** (`#pragma pack(push, 1)`) in **Little-Endian** byte order.

```c
#pragma pack(push, 1)
typedef struct {
    uint16_t magic;           /* 0x00: Sync word (0xAA55)                      (2B) */
    uint8_t  version;         /* 0x02: Protocol version (1)                    (1B) */
    uint8_t  type;            /* 0x03: Frame type ('D' = 0x44)                 (1B) */
    uint32_t timestamp;       /* 0x04: MCU uptime in milliseconds              (4B) */
    uint32_t seq_id;          /* 0x08: Monotonically increasing sequence counter(4B) */
    float    speed_kmh;       /* 0x0C: Vehicle speed (km/h)                    (4B) */
    float    soc_pct;         /* 0x10: Battery State of Charge (%)             (4B) */
    int16_t  motor_torque;    /* 0x14: Motor torque output (Nm)                (2B) */
    float    motor_temp_c;    /* 0x16: Motor temperature (°C)                  (4B) */
    uint16_t range_km;        /* 0x1A: Estimated remaining range (km)          (2B) */
    uint8_t  accel_pedal;     /* 0x1C: Accelerator pedal position (0 - 100%)   (1B) */
    uint8_t  brake_pedal;     /* 0x1D: Brake pedal position (0 - 100%)         (1B) */
    uint16_t front_cm;        /* 0x1E: Front ultrasonic distance (cm)          (2B) */
    uint16_t left_cm;         /* 0x20: Left ultrasonic distance (cm)           (2B) */
    uint16_t right_cm;        /* 0x22: Right ultrasonic distance (cm)          (2B) */
    float    ttc_sec;         /* 0x24: Time-to-Collision (seconds)             (4B) */
    uint8_t  collision_warn;  /* 0x28: FCW severity (0=Clear, 1=Warn, 2=Crit)  (1B) */
    uint8_t  blindspot_left;  /* 0x29: Left blind spot flag (0=Clear, 1=Alert) (1B) */
    uint8_t  blindspot_right; /* 0x2A: Right blind spot flag (0=Clear, 1=Alert)(1B) */
    uint8_t  alarm_priority;  /* 0x2B: Resolved alarm level (0=None, 1-3)      (1B) */
    uint8_t  fault_flags;     /* 0x2C: Active fault bitmask (0x01, 0x02, 0x04) (1B) */
    uint8_t  drive_mode;      /* 0x2D: Drive profile (0=ECO, 1=NORMAL, 2=SPORT)(1B) */
    uint16_t crc16;           /* 0x2E: CRC-16-CCITT checksum                   (2B) */
} TelemetryPacket_t;
#pragma pack(pop)
```

---

## 3. Field Specifications Table

| Offset | Field Name | Data Type | Bytes | Units | Valid Range | Description |
| :--- | :--- | :--- | :---: | :--- | :--- | :--- |
| `0x00` | `magic` | `uint16_t` | 2 | - | `0xAA55` | Fixed synchronization header |
| `0x02` | `version` | `uint8_t` | 1 | - | `1` | Protocol schema version |
| `0x03` | `type` | `uint8_t` | 1 | ASCII | `'D'` (`0x44`) | Frame identifier ('D'=Data) |
| `0x04` | `timestamp` | `uint32_t` | 4 | ms | $0 \text{ to } 2^{32}-1$ | System uptime (HAL_GetTick) |
| `0x08` | `seq_id` | `uint32_t` | 4 | - | $0 \text{ to } 2^{32}-1$ | Rolling frame sequence counter |
| `0x0C` | `speed_kmh` | `float` (IEEE-754) | 4 | km/h | $0.0 \text{ to } 160.0$ | Vehicle forward speed |
| `0x10` | `soc_pct` | `float` (IEEE-754) | 4 | % | $0.0 \text{ to } 100.0$ | Traction battery SOC |
| `0x14` | `motor_torque` | `int16_t` | 2 | Nm | $-150 \text{ to } +300$ | Motor output torque |
| `0x16` | `motor_temp_c` | `float` (IEEE-754) | 4 | °C | $0.0 \text{ to } 120.0$ | Motor winding temperature |
| `0x1A` | `range_km` | `uint16_t` | 2 | km | $0 \text{ to } 500$ | Computed range remaining |
| `0x1C` | `accel_pedal` | `uint8_t` | 1 | % | $0 \text{ to } 100$ | Throttle demand |
| `0x1D` | `brake_pedal` | `uint8_t` | 1 | % | $0 \text{ to } 100$ | Mechanical/Regen brake demand |
| `0x1E` | `front_cm` | `uint16_t` | 2 | cm | $2 \text{ to } 400$ | Front obstacle distance |
| `0x20` | `left_cm` | `uint16_t` | 2 | cm | $2 \text{ to } 400$ | Left lateral obstacle distance |
| `0x22` | `right_cm` | `uint16_t` | 2 | cm | $2 \text{ to } 400$ | Right lateral obstacle distance |
| `0x24` | `ttc_sec` | `float` (IEEE-754) | 4 | s | $0.0 \text{ to } 99.9$ | Computed Time-to-Collision |
| `0x28` | `collision_warn` | `uint8_t` | 1 | enum | `0, 1, 2` | FCW state (0=Clear, 1=Warn, 2=Crit)|
| `0x29` | `blindspot_left` | `uint8_t` | 1 | bool | `0, 1` | Left blind spot alert |
| `0x2A` | `blindspot_right`| `uint8_t` | 1 | bool | `0, 1` | Right blind spot alert |
| `0x2B` | `alarm_priority` | `uint8_t` | 1 | enum | `0, 1, 2, 3` | Active audio alarm priority |
| `0x2C` | `fault_flags` | `uint8_t` | 1 | mask | `0x00 - 0x07` | Latching faults (0x01=OT, 0x02=SOC, 0x04=COL) |
| `0x2D` | `drive_mode` | `uint8_t` | 1 | enum | `0, 1, 2` | Active mode (0=ECO, 1=NORM, 2=SPORT) |
| `0x2E` | `crc16` | `uint16_t` | 2 | hex | `0x0000 - 0xFFFF` | Checksum of bytes `0x00 - 0x2D` |

---

## 4. SLIP Framing & Byte Escaping

To guarantee safe binary transmission over byte-oriented serial links, the raw 48-byte packet is enclosed in **SLIP boundaries**:

### Constants
* `SLIP_END     = 0xC0` (Frame delimiter)
* `SLIP_ESC     = 0xDB` (Escape indicator)
* `SLIP_ESC_END = 0xDC` (Escaped representation of `0xC0`)
* `SLIP_ESC_ESC = 0xDD` (Escaped representation of `0xDB`)

### Encoding Rules
1. Transmit `SLIP_END` (`0xC0`) to signal frame start.
2. For each byte in the 48-byte binary packet:
   * If byte $== \text{0xC0}$, transmit $\text{0xDB followed by 0xDC}$.
   * If byte $== \text{0xDB}$, transmit $\text{0xDB followed by 0xDD}$.
   * Otherwise, transmit the raw byte unaltered.
3. Transmit `SLIP_END` (`0xC0`) to signal frame termination.

---

## 5. CRC-16 Checksum Algorithm

The checksum uses the standard **CRC-16-CCITT** polynomial (`0x1021`) initialized to `0xFFFF`:
* **Polynomial**: $x^{16} + x^{12} + x^5 + 1$ (`0x1021`)
* **Initial Value**: `0xFFFF`
* **Input Reflection**: False
* **Result Reflection**: False
* **Final XOR**: `0x0000`
* **Calculated Range**: Exactly 46 bytes (from `magic` at offset `0x00` through `drive_mode` at offset `0x2D`).

---

## 6. Python Gateway Decoding Implementation

The Python gateway unpacks incoming binary SLIP frames using the struct format string:
```python
BINARY_STRUCT_FMT = '<HBBIIffhfHBBHHHfBBBBBBH'
```

### Unpack Workflow
```python
def parse_binary_frame(raw_slip_frame: bytes):
    # 1. Strip boundary bytes
    stripped = raw_slip_frame.strip(b'\xC0')
    
    # 2. Unescape SLIP characters
    payload = decode_slip(stripped)
    if len(payload) != 48:
        return None
        
    # 3. Validate Magic & CRC-16
    magic = struct.unpack('<H', payload[0:2])[0]
    if magic != 0xAA55:
        return None
        
    crc_calc = crc16_ccitt(payload[:46])
    crc_rx = struct.unpack('<H', payload[46:48])[0]
    if crc_calc != crc_rx:
        return None # CRC mismatch
        
    # 4. Unpack 23 fields
    fields = struct.unpack('<HBBIIffhfHBBHHHfBBBBBBH', payload)
    return fields
```
