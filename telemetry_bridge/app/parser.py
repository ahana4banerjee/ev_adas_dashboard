import logging
import struct
from .crc16 import crc16_ccitt

logger = logging.getLogger("TelemetryParser")

SLIP_END = 0xC0
SLIP_ESC = 0xDB
SLIP_ESC_END = 0xDC
SLIP_ESC_ESC = 0xDD

BINARY_STRUCT_FMT = '<HBBIIffhfHBBHHHfBBBBBBH'
BINARY_STRUCT_SIZE = struct.calcsize(BINARY_STRUCT_FMT) # 48 bytes

class TelemetryParser:
    def __init__(self):
        self.last_seq = None
        self.crc_errors = 0
        self.lost_packets = 0
        self.packet_count = 0

    def decode_slip(self, data: bytes) -> bytes:
        """Decodes SLIP-escaped byte stream into raw payload."""
        out = bytearray()
        i = 0
        while i < len(data):
            if data[i] == SLIP_ESC:
                if i + 1 < len(data):
                    if data[i+1] == SLIP_ESC_END:
                        out.append(SLIP_END)
                        i += 2
                        continue
                    elif data[i+1] == SLIP_ESC_ESC:
                        out.append(SLIP_ESC)
                        i += 2
                        continue
            out.append(data[i])
            i += 1
        return bytes(out)

    def parse_binary_frame(self, raw_bytes: bytes) -> dict | None:
        """
        Parses a SLIP-framed binary telemetry frame.
        """
        try:
            # Strip outer SLIP boundary markers
            stripped = raw_bytes.strip(bytes([SLIP_END]))
            if not stripped:
                return None

            payload = self.decode_slip(stripped)
            if len(payload) != BINARY_STRUCT_SIZE:
                return None

            # Verify magic header
            magic = struct.unpack('<H', payload[0:2])[0]
            if magic != 0xAA55:
                return None

            # Verify CRC-16
            crc_calc = crc16_ccitt(payload[:BINARY_STRUCT_SIZE - 2])
            crc_rx = struct.unpack('<H', payload[BINARY_STRUCT_SIZE - 2:BINARY_STRUCT_SIZE])[0]

            if crc_calc != crc_rx:
                self.crc_errors += 1
                logger.error(f"Binary CRC Mismatch! Calculated: 0x{crc_calc:04X}, Received: 0x{crc_rx:04X}")
                return {
                    "valid": False,
                    "event": "packet_error",
                    "error": "CRC_MISMATCH",
                    "stats": {
                        "crcErrors": self.crc_errors,
                        "lostPackets": self.lost_packets
                    }
                }

            unpacked = struct.unpack(BINARY_STRUCT_FMT, payload)

            magic_val       = unpacked[0]
            version         = unpacked[1]
            frame_type      = chr(unpacked[2])
            timestamp       = unpacked[3]
            seq             = unpacked[4]
            speed           = unpacked[5]
            soc             = unpacked[6]
            torque          = unpacked[7]
            temp            = unpacked[8]
            range_km        = unpacked[9]
            accel           = unpacked[10]
            brake           = unpacked[11]
            front_cm        = unpacked[12]
            left_cm         = unpacked[13]
            right_cm        = unpacked[14]
            ttc             = unpacked[15]
            collision_warn  = unpacked[16]
            bsd_l           = unpacked[17]
            bsd_r           = unpacked[18]
            alarm_priority  = unpacked[19]
            fault_flags     = unpacked[20]
            drive_mode_id   = unpacked[21]

            if self.last_seq is not None:
                if seq > self.last_seq + 1:
                    lost = seq - self.last_seq - 1
                    self.lost_packets += lost
                    logger.warning(f"Packet Loss Detected! Gap: {lost} packets")

            self.last_seq = seq
            self.packet_count += 1

            mode_map = {0: "ECO", 1: "NORMAL", 2: "SPORT"}
            drive_mode_str = mode_map.get(drive_mode_id, "NORMAL")

            return {
                "valid": True,
                "event": "telemetry",
                "data": {
                    "timestamp": timestamp,
                    "speed": round(float(speed), 1),
                    "soc": round(float(soc), 1),
                    "torque": int(torque),
                    "temp": round(float(temp), 1),
                    "range": int(range_km),
                    "accel": int(accel),
                    "brake": int(brake),
                    "frontDist": int(front_cm),
                    "leftDist": int(left_cm),
                    "rightDist": int(right_cm),
                    "ttc": round(float(ttc), 1),
                    "collisionWarn": int(collision_warn),
                    "bsdLeft": int(bsd_l),
                    "bsdRight": int(bsd_r),
                    "alarmLevel": int(alarm_priority),
                    "faultFlags": int(fault_flags),
                    "driveMode": drive_mode_str
                },
                "stats": {
                    "crcErrors": self.crc_errors,
                    "lostPackets": self.lost_packets
                }
            }
        except Exception as e:
            logger.error(f"Binary parsing error: {e}")
            return None

    def parse_frame(self, line: str | bytes) -> dict | None:
        """
        Parses either a binary SLIP frame or legacy ASCII CSV frame.
        """
        if isinstance(line, bytes):
            # Check for binary SLIP frame
            if bytes([SLIP_END]) in line:
                return self.parse_binary_frame(line)
            try:
                line = line.decode('ascii', errors='ignore').strip()
            except Exception:
                return None

        line = line.strip()
        if not line:
            return None

        # Binary frame passed as ASCII-decoded byte string
        if ord(line[0]) == SLIP_END or chr(SLIP_END) in line:
            return self.parse_binary_frame(line.encode('latin1'))

        # Legacy ASCII CSV frame: $[payload,CRC]*
        if line.startswith('$') and '*' in line:
            try:
                end_idx = line.find('*')
                content = line[1:end_idx]
                if ',' not in content:
                    return None

                last_comma = content.rfind(',')
                payload_str = content[:last_comma]
                parsed_crc_hex = content[last_comma+1:]

                calculated_crc = crc16_ccitt(payload_str.encode('ascii'))
                calculated_crc_hex = f"{calculated_crc:04X}"

                if calculated_crc_hex != parsed_crc_hex:
                    self.crc_errors += 1
                    return None

                fields = payload_str.split(',')
                if len(fields) < 20:
                    return None

                timestamp = int(fields[0])
                seq = int(fields[1])

                mode_id = int(fields[19])
                mode_map = {0: "ECO", 1: "NORMAL", 2: "SPORT"}
                drive_mode_str = mode_map.get(mode_id, "NORMAL")

                return {
                    "valid": True,
                    "event": "telemetry",
                    "data": {
                        "timestamp": timestamp,
                        "speed": float(fields[3]),
                        "soc": float(fields[4]),
                        "torque": int(float(fields[5])),
                        "temp": float(fields[6]),
                        "range": int(float(fields[7])),
                        "accel": int(float(fields[8])),
                        "brake": int(float(fields[9])),
                        "frontDist": int(float(fields[10])),
                        "leftDist": int(float(fields[11])),
                        "rightDist": int(float(fields[12])),
                        "ttc": float(fields[13]),
                        "collisionWarn": int(float(fields[14])),
                        "bsdLeft": int(float(fields[15])),
                        "bsdRight": int(float(fields[16])),
                        "alarmLevel": int(float(fields[17])),
                        "faultFlags": int(fields[18], 16),
                        "driveMode": drive_mode_str
                    },
                    "stats": {
                        "crcErrors": self.crc_errors,
                        "lostPackets": self.lost_packets
                    }
                }
            except Exception as e:
                logger.error(f"ASCII parse exception: {e}")
                return None

        return None
