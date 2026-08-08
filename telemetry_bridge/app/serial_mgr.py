import time
import threading
import serial
import logging
from .parser import TelemetryParser
from .crc16 import crc16_ccitt

logger = logging.getLogger("SerialManager")

class SerialManager:
    def __init__(self, port: str = None, baud: int = 115200, demo_mode: bool = False, on_packet_received=None):
        self.port = port
        self.baud = baud
        self.demo_mode = demo_mode
        self.on_packet_received = on_packet_received
        self.running = False
        self.thread = None
        self.parser = TelemetryParser()
        self.serial_conn = None

        # Demo simulation state parameters & overrides
        self.demo_temp_override = None
        self.demo_soc_override = None
        self.demo_col_override = None
        self.demo_obstacle_override = None
        self.demo_fault_flags = 0
        self.demo_drive_mode = 1 # 0: ECO, 1: NORMAL, 2: SPORT

    def start(self):
        self.running = True
        self.thread = threading.Thread(target=self._run, daemon=True)
        self.thread.start()
        logger.info(f"Serial Manager started. Mode: {'DEMO' if self.demo_mode else 'SERIAL (' + str(self.port) + ')'}")

    def stop(self):
        self.running = False
        if self.serial_conn and self.serial_conn.is_open:
            try:
                self.serial_conn.close()
            except Exception:
                pass
        logger.info("Serial Manager stopped.")

    def send_command(self, cmd: str):
        """
        Calculates the CRC-16 checksum of the command payload,
        packages it into the standard frame structure, and transmits it over serial.
        Format: $[timestamp,seq,C,command,value,CRC]*\n
        """
        if self.demo_mode:
            logger.info(f"[DEMO COMMAND] Intercepted CLI command: {cmd}")
            # Map parameters for demo simulation feedback
            if cmd == "fault inject motor":
                self.demo_temp_override = 95.0
                self.demo_fault_flags |= 0x01
            elif cmd == "fault inject soc":
                self.demo_soc_override = 1.0
                self.demo_fault_flags |= 0x02
            elif cmd == "fault inject col":
                self.demo_col_override = 2
                self.demo_fault_flags |= 0x04
            elif cmd == "fault clear":
                self.demo_temp_override = None
                self.demo_soc_override = None
                self.demo_col_override = None
                self.demo_obstacle_override = None
                self.demo_fault_flags = 0
            elif cmd.startswith("obstacle "):
                sub = cmd.split(None, 1)[1]
                if sub == "clear":
                    self.demo_obstacle_override = None
                else:
                    try:
                        self.demo_obstacle_override = float(sub)
                    except ValueError:
                        pass
            elif cmd.startswith("mode "):
                sub = cmd.split(None, 1)[1]
                if sub == "eco":
                    self.demo_drive_mode = 0
                elif sub == "normal":
                    self.demo_drive_mode = 1
                elif sub == "sport":
                    self.demo_drive_mode = 2
            elif cmd in ("dtc read", "dtc"):
                if self.on_packet_received:
                    self.on_packet_received({"event": "cli_log", "data": "===== DIAGNOSTIC TROUBLE CODES (DTC) ====="})
                    if self.demo_fault_flags != 0:
                        count = 1
                        if self.demo_fault_flags & 0x01:
                            self.on_packet_received({"event": "cli_log", "data": f" [{count}] Code: P0A80 (0x0A80) | State: ACTIVE | Time: {int(time.time()*1000)&0xFFFFFF}ms"})
                            self.on_packet_received({"event": "cli_log", "data": "     FreezeFrame: Spd=45.0km/h, SOC=85.0%, Temp=95.0C"})
                            self.on_packet_received({"event": "cli_log", "data": "     Desc: Motor temperature limit exceeded"})
                            count += 1
                        if self.demo_fault_flags & 0x02:
                            self.on_packet_received({"event": "cli_log", "data": f" [{count}] Code: P0210 (0x0210) | State: ACTIVE | Time: {int(time.time()*1000)&0xFFFFFF}ms"})
                            self.on_packet_received({"event": "cli_log", "data": "     FreezeFrame: Spd=20.0km/h, SOC=1.0%, Temp=35.0C"})
                            self.on_packet_received({"event": "cli_log", "data": "     Desc: Battery state of charge critically low"})
                            count += 1
                        if self.demo_fault_flags & 0x04:
                            self.on_packet_received({"event": "cli_log", "data": f" [{count}] Code: C1C00 (0x1C00) | State: ACTIVE | Time: {int(time.time()*1000)&0xFFFFFF}ms"})
                            self.on_packet_received({"event": "cli_log", "data": "     FreezeFrame: Spd=65.0km/h, SOC=78.0%, Temp=30.0C"})
                            self.on_packet_received({"event": "cli_log", "data": "     Desc: Critical front collision hazard"})
                            count += 1
                    else:
                        self.on_packet_received({"event": "cli_log", "data": " No stored DTC fault records. System clean."})
                    self.on_packet_received({"event": "cli_log", "data": "=========================================="})
            elif cmd == "dtc clear":
                if self.on_packet_received:
                    self.on_packet_received({"event": "cli_log", "data": "All DTC records cleared."})
            elif cmd in ("config read", "config"):
                if self.on_packet_received:
                    self.on_packet_received({"event": "cli_log", "data": "===== SYSTEM CONFIGURATION (NVM) ====="})
                    self.on_packet_received({"event": "cli_log", "data": " FCW Warning Distance  : 50.0 cm"})
                    self.on_packet_received({"event": "cli_log", "data": " FCW Critical Distance : 20.0 cm"})
                    self.on_packet_received({"event": "cli_log", "data": " TTC Warning Time      : 3.0 s"})
                    self.on_packet_received({"event": "cli_log", "data": " TTC Critical Time     : 1.5 s"})
                    self.on_packet_received({"event": "cli_log", "data": " BSD Range Threshold   : 30.0 cm"})
                    self.on_packet_received({"event": "cli_log", "data": " BSD Speed Gate        : 20.0 km/h"})
                    self.on_packet_received({"event": "cli_log", "data": " Overspeed Limit       : 120.0 km/h"})
                    self.on_packet_received({"event": "cli_log", "data": " Storage Flash Page    : 0x0800FC00 (CRC: 0x000012AB)"})
                    self.on_packet_received({"event": "cli_log", "data": "======================================"})
            elif cmd == "config reset":
                if self.on_packet_received:
                    self.on_packet_received({"event": "cli_log", "data": "Configuration reset to factory defaults and saved to NVM Flash."})
            elif cmd.startswith("set "):
                if self.on_packet_received:
                    self.on_packet_received({"event": "cli_log", "data": f"[NVM] Parameter updated and written to Flash Page 0x0800FC00."})
            return True

        if not self.serial_conn or not self.serial_conn.is_open:
            logger.error("Cannot write command: Serial link offline.")
            return False

        try:
            timestamp = int(time.time() * 1000) & 0xFFFFFFFF
            # Track command packet format: type is 'C' (Command)
            payload = f"{timestamp},0,C,{cmd}"
            crc = crc16_ccitt(payload.encode('ascii'))
            frame = f"${payload},{crc:04X}*\n"
            self.serial_conn.write(frame.encode('ascii'))
            logger.info(f"Sent serial command: {frame.strip()}")
            return True
        except Exception as e:
            logger.error(f"Error writing to serial interface: {e}")
            return False

    def _run(self):
        if self.demo_mode:
            self._run_demo()
        else:
            self._run_serial()

    def _run_demo(self):
        seq = 0
        speed = 0.0
        soc = 100.0
        torque = 0
        temp = 25.0
        accel = 0
        brake = 0
        
        while self.running:
            # Generate simulated driving telemetry variables at 10Hz
            timestamp = int(time.time() * 1000) & 0xFFFFFFFF
            t = time.time()
            drive_mode = self.demo_drive_mode
            
            # Simulate accelerator pedal oscillation cycles
            accel = int((t % 20) * 5) if (t % 40) < 20 else int((20 - (t % 20)) * 5)
            accel = max(0, min(100, accel))
            
            if accel > 0:
                torque = int(accel * 1.2)
                speed += (torque * 0.01 - speed * 0.05) * 0.1
                if self.demo_soc_override is not None:
                    soc = self.demo_soc_override
                else:
                    soc -= 0.005 # Slowly drain battery
            else:
                torque = 0
                speed -= speed * 0.05 * 0.1
                if self.demo_soc_override is not None:
                    soc = self.demo_soc_override
                
            speed = max(0.0, speed)
            soc = max(0.0, soc)
            
            if self.demo_temp_override is not None:
                temp = self.demo_temp_override
            else:
                temp = 25.0 + (speed * 0.3) + (t % 5)
            
            # Simulate ADAS sensor range approach cones (front target cycles in range)
            if self.demo_obstacle_override is not None:
                front_cm = self.demo_obstacle_override
            else:
                front_cm = int(400 - ((t * 15) % 380))
                
            left_cm = 400
            right_cm = 400
            
            # Simple Time-to-Collision (TTC) calculations
            relative_speed = speed / 3.6
            if relative_speed > 0.5 and front_cm < 250:
                ttc = (front_cm / 100.0) / relative_speed
            else:
                ttc = 99.9
                
            # Mapped warn states
            collision_warn = 0
            if self.demo_col_override is not None:
                collision_warn = self.demo_col_override
            else:
                if ttc < 1.5:
                    collision_warn = 2 # CRITICAL
                elif ttc < 3.0:
                    collision_warn = 1 # WARNING
                
            alarm_priority = 0
            if collision_warn == 2:
                alarm_priority = 3
            elif collision_warn == 1:
                alarm_priority = 2
                
            # Latch faults based on simulated limits
            fault_flags = self.demo_fault_flags
            if soc < 2.0:
                fault_flags |= 0x02
            if temp >= 90.0:
                fault_flags |= 0x01
            if front_cm < 20:
                fault_flags |= 0x04

            # Formulate the payload string
            payload = f"{timestamp},{seq},D,{speed:.1f},{soc:.1f},{torque},{temp:.1f},280,{accel},{brake},{front_cm},{left_cm},{right_cm},{ttc:.1f},{collision_warn},0,0,{alarm_priority},{fault_flags:02X},{drive_mode}"
            crc = crc16_ccitt(payload.encode('ascii'))
            frame = f"${payload},{crc:04X}*\n"
            
            parsed = self.parser.parse_frame(frame)
            if parsed and self.on_packet_received:
                parsed["raw"] = frame.strip()
                self.on_packet_received(parsed)
                
            seq += 1
            time.sleep(0.1)

    def _run_serial(self):
        rx_buf = bytearray()
        slip_end_byte = 0xC0

        while self.running:
            try:
                logger.info(f"Opening serial port {self.port} at {self.baud} baud...")
                self.serial_conn = serial.Serial(self.port, self.baud, timeout=0.1)
                logger.info(f"Serial port {self.port} opened successfully.")
                
                self.serial_conn.reset_input_buffer()
                self.serial_conn.reset_output_buffer()
                rx_buf.clear()

                while self.running and self.serial_conn.is_open:
                    if self.serial_conn.in_waiting > 0:
                        incoming = self.serial_conn.read(self.serial_conn.in_waiting)
                        rx_buf.extend(incoming)

                        # Process SLIP binary packets delimited by 0xC0
                        while slip_end_byte in rx_buf:
                            start_idx = rx_buf.find(slip_end_byte)
                            # Route any leading text chunk before SLIP start to CLI console
                            if start_idx > 0:
                                text_chunk = bytes(rx_buf[:start_idx])
                                rx_buf = rx_buf[start_idx:]
                                try:
                                    text_line = text_chunk.decode('ascii', errors='ignore').strip()
                                    if text_line and self.on_packet_received:
                                        self.on_packet_received({"event": "cli_log", "data": text_line})
                                except Exception:
                                    pass

                            # Drop consecutive 0xC0 boundary bytes
                            while len(rx_buf) > 1 and rx_buf[1] == slip_end_byte:
                                rx_buf.pop(0)

                            end_idx = rx_buf.find(slip_end_byte, 1)
                            if end_idx != -1:
                                packet_bytes = bytes(rx_buf[:end_idx + 1])
                                rx_buf = rx_buf[end_idx + 1:]

                                parsed = self.parser.parse_binary_frame(packet_bytes)
                                if parsed and self.on_packet_received:
                                    parsed["raw"] = f"<SLIP {len(packet_bytes)}B>"
                                    self.on_packet_received(parsed)
                            else:
                                # Partial frame, wait for next serial bytes
                                break

                        # Process any trailing ASCII text lines if no binary SLIP is pending
                        if b'\n' in rx_buf and slip_end_byte not in rx_buf:
                            newline_idx = rx_buf.find(b'\n')
                            line_bytes = bytes(rx_buf[:newline_idx + 1])
                            rx_buf = rx_buf[newline_idx + 1:]
                            try:
                                line = line_bytes.decode('ascii', errors='ignore').strip()
                                if line and self.on_packet_received:
                                    parsed = self.parser.parse_frame(line)
                                    if parsed:
                                        parsed["raw"] = line
                                        self.on_packet_received(parsed)
                                    else:
                                        self.on_packet_received({"event": "cli_log", "data": line})
                            except Exception:
                                pass
                    else:
                        time.sleep(0.005)
                        
            except serial.SerialException as se:
                logger.error(f"Serial interface error: {se}. Re-scanning in 2 seconds...")
                if self.serial_conn:
                    try:
                        self.serial_conn.close()
                    except Exception:
                        pass
                time.sleep(2.0)
            except Exception as e:
                logger.error(f"Unexpected connection drop: {e}. Reconnecting...")
                time.sleep(2.0)
