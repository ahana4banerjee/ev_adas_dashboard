import logging
from .crc16 import crc16_ccitt

logger = logging.getLogger("TelemetryParser")

class TelemetryParser:
    def __init__(self):
        self.last_seq = None
        self.crc_errors = 0
        self.lost_packets = 0
        self.packet_count = 0

    def parse_frame(self, line: str) -> dict | None:
        """
        Parses a raw serial line string, validates the CRC-16 checksum, and extracts variables.
        Expected Frame format: $[timestamp,seq,D,speed,soc,torque,temp,range,accel,brake,front,left,right,ttc,warn,bsd_l,bsd_r,alarm,faults,mode,CRC]*
        """
        line = line.strip()
        if not line.startswith('$') or '*' not in line:
            return None

        try:
            # Extract content between '$' and '*'
            end_idx = line.find('*')
            content = line[1:end_idx]

            # Split payload data from the appended CRC-16 checksum
            if ',' not in content:
                return None
            
            last_comma = content.rfind(',')
            payload_str = content[:last_comma]
            parsed_crc_hex = content[last_comma+1:]

            # Verify the CRC-16-CCITT checksum of the payload bytes
            calculated_crc = crc16_ccitt(payload_str.encode('ascii'))
            calculated_crc_hex = f"{calculated_crc:04X}"

            if calculated_crc_hex != parsed_crc_hex:
                self.crc_errors += 1
                logger.error(f"CRC Mismatch! Calculated: {calculated_crc_hex}, Parsed: {parsed_crc_hex} for payload: {payload_str}")
                return {
                    "valid": False,
                    "event": "packet_error",
                    "error": "CRC_MISMATCH",
                    "stats": {
                        "crcErrors": self.crc_errors,
                        "lostPackets": self.lost_packets
                    }
                }

            # If the CRC is valid, parse CSV fields
            fields = payload_str.split(',')
            if len(fields) < 20:
                logger.error(f"Payload has insufficient fields ({len(fields)}): {payload_str}")
                return None

            timestamp = int(fields[0])
            seq = int(fields[1])
            frame_type = fields[2]

            # Evaluate package sequence gap to track packet loss
            if self.last_seq is not None:
                if seq > self.last_seq + 1:
                    lost = seq - self.last_seq - 1
                    self.lost_packets += lost
                    logger.warning(f"Packet Loss Detected! Gap: {lost} packets (Last Seq: {self.last_seq}, Current Seq: {seq})")
            
            self.last_seq = seq
            self.packet_count += 1

            # Map the drive mode enum to standard string formats
            mode_id = int(fields[19])
            mode_map = {0: "ECO", 1: "NORMAL", 2: "SPORT"}
            drive_mode_str = mode_map.get(mode_id, "NORMAL")

            # Return the parsed data fields and packet stats
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
                    "faultFlags": int(fields[18], 16), # Parsed from hex
                    "driveMode": drive_mode_str
                },
                "stats": {
                    "crcErrors": self.crc_errors,
                    "lostPackets": self.lost_packets
                }
            }

        except Exception as e:
            logger.error(f"Parsing exception: {e} for line: {line}")
            return None
