import time
import threading
import logging
from .database import get_session_telemetry

logger = logging.getLogger("ReplayManager")

class ReplayManager:
    def __init__(self, session_id: int, on_replay_packet=None, on_replay_finished=None):
        self.session_id = session_id
        self.on_replay_packet = on_replay_packet
        self.on_replay_finished = on_replay_finished
        self.running = False
        self.is_paused = False
        self.playback_speed = 1.0
        self.thread = None
        self.current_index = 0
        self.rows = []

    def start(self) -> bool:
        # Fetch rows from sqlite DB
        self.rows = get_session_telemetry(self.session_id)
        if not self.rows:
            logger.error(f"Replay aborted: session #{self.session_id} has no records.")
            if self.on_replay_finished:
                self.on_replay_finished()
            return False

        self.running = True
        self.is_paused = False
        self.thread = threading.Thread(target=self._run, daemon=True)
        self.thread.start()
        logger.info(f"Replay started for session #{self.session_id} ({len(self.rows)} rows)")
        return True

    def pause(self):
        self.is_paused = True
        logger.info("Replay paused.")

    def resume(self):
        self.is_paused = False
        logger.info("Replay resumed.")

    def stop(self):
        self.running = False
        logger.info("Replay stopped.")

    def set_speed(self, speed: float):
        self.playback_speed = speed
        logger.info(f"Replay playback speed adjusted to {speed}x")

    def seek(self, percentage: float):
        """
        Jump to a relative timeline location (0.0 to 1.0)
        """
        if not self.rows:
            return
        target_idx = int(percentage * (len(self.rows) - 1))
        self.current_index = max(0, min(len(self.rows) - 1, target_idx))
        logger.info(f"Replay seeked to index {self.current_index}/{len(self.rows)} ({percentage*100:.1f}%)")

    def _run(self):
        total_rows = len(self.rows)
        self.current_index = 0

        while self.running and self.current_index < total_rows:
            # Replay Pause Loop
            while self.is_paused and self.running:
                time.sleep(0.05)

            if not self.running:
                break

            row = self.rows[self.current_index]
            
            # Format row data back into standard JSON broadcast structure
            packet = {
                "event": "telemetry",
                "data": {
                    "timestamp": row["timestamp"],
                    "speed": row["speed"],
                    "soc": row["soc"],
                    "torque": row["torque"],
                    "temp": row["temp"],
                    "range": row["range"],
                    "accel": row["accel"],
                    "brake": row["brake"],
                    "frontDist": row["front_dist"],
                    "leftDist": row["left_dist"],
                    "rightDist": row["right_dist"],
                    "ttc": row["ttc"],
                    "collisionWarn": row["collision_warn"],
                    "bsdLeft": row["bsd_left"],
                    "bsdRight": row["bsd_right"],
                    "alarmLevel": row["alarm_level"],
                    "faultFlags": row["fault_flags"],
                    "driveMode": row["drive_mode"]
                },
                "is_replay": True,
                "replay_index": self.current_index,
                "replay_total": total_rows
            }

            if self.on_replay_packet:
                self.on_replay_packet(packet)

            # Wait until next frame based on time differences
            if self.current_index < total_rows - 1:
                next_row = self.rows[self.current_index + 1]
                delta_ms = next_row["timestamp"] - row["timestamp"]
                sleep_duration = (delta_ms / 1000.0) / self.playback_speed

                # Sanity fallback clamp for timing gaps
                if sleep_duration <= 0 or sleep_duration > 5.0:
                    sleep_duration = 0.1

                # Sleep in brief increments to allow instant pause/kill responsiveness
                start_sleep = time.time()
                while time.time() - start_sleep < sleep_duration and self.running:
                    time.sleep(0.01)

            self.current_index += 1

        self.running = False
        logger.info("Replay finished execution.")
        if self.on_replay_finished:
            self.on_replay_finished()
