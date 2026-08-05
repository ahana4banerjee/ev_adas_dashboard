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
        while self.running:
            try:
                logger.info(f"Opening serial port {self.port} at {self.baud} baud...")
                self.serial_conn = serial.Serial(self.port, self.baud, timeout=1.0)
                logger.info(f"Serial port {self.port} opened successfully.")
                
                self.serial_conn.reset_input_buffer()
                self.serial_conn.reset_output_buffer()

                while self.running and self.serial_conn.is_open:
                    if self.serial_conn.in_waiting > 0:
                        line_bytes = self.serial_conn.readline()
                        try:
                            line = line_bytes.decode('ascii', errors='ignore').strip()
                            if line:
                                parsed = self.parser.parse_frame(line)
                                if parsed:
                                    parsed["raw"] = line
                                    if self.on_packet_received:
                                        self.on_packet_received(parsed)
                        except Exception as parse_ex:
                            logger.error(f"Error decoding raw bytes: {parse_ex}")
                    else:
                        time.sleep(0.01)
                        
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
