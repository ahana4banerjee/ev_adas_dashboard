import os
import io
import csv
import asyncio
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
import logging
from contextlib import asynccontextmanager
from .serial_mgr import SerialManager
from .replay_mgr import ReplayManager
from .database import init_db, create_session, log_telemetry, get_all_sessions, get_session_telemetry

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("TelemetryBridge")

class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"New dashboard client connected. Active: {len(self.active_connections)}")
        # Send connection status handshake
        await websocket.send_json({"event": "status", "data": {"connected": True, "source": "bridge"}})

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
            logger.info(f"Dashboard client disconnected. Active: {len(self.active_connections)}")

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception:
                pass

ws_manager = ConnectionManager()
serial_mgr = None
loop = None
current_session_id = None

def handle_serial_packet(packet: dict):
    """
    Thread-safe serial packet handler. Writes valid telemetry frames to the 
    SQLite database and broadcasts them to all connected browser clients.
    """
    global current_session_id
    if packet.get("valid") and packet.get("event") == "telemetry":
        # Log to SQLite
        if current_session_id is not None:
            log_telemetry(current_session_id, packet["data"])
            
    if loop and ws_manager.active_connections:
        asyncio.run_coroutine_threadsafe(ws_manager.broadcast(packet), loop)

@asynccontextmanager
async def lifespan(app: FastAPI):
    global serial_mgr, loop, current_session_id
    loop = asyncio.get_running_loop()

    # Configure SQLite database tables
    init_db()
    current_session_id = create_session()

    # Load parameters from environment variables
    port = os.environ.get("BRIDGE_PORT", "")
    baud = int(os.environ.get("BRIDGE_BAUD", 115200))
    demo = os.environ.get("BRIDGE_DEMO", "0") == "1"

    serial_mgr = SerialManager(
        port=port if port else None,
        baud=baud,
        demo_mode=demo,
        on_packet_received=handle_serial_packet
    )
    serial_mgr.start()

    yield

    # Clean shut down of thread resources
    if serial_mgr:
        serial_mgr.stop()

app = FastAPI(title="EV ADAS Telemetry Bridge", version="2.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {
        "status": "running",
        "version": "2.0.0",
        "serial_port": serial_mgr.port if serial_mgr else None,
        "demo_mode": serial_mgr.demo_mode if serial_mgr else False,
        "current_session": current_session_id
    }

@app.get("/sessions")
def get_sessions_list():
    """Returns a list of all recorded sessions."""
    return get_all_sessions()

@app.get("/sessions/{session_id}/export")
def export_session_csv(session_id: int):
    """Generates and returns a CSV file download of all session telemetry."""
    rows = get_session_telemetry(session_id)
    if not rows:
        return {"error": f"Session #{session_id} not found or empty."}

    output = io.StringIO()
    writer = csv.writer(output)

    # Column Headers
    writer.writerow([
        "Timestamp_MS", "Sequence", "Speed_KMH", "Battery_SOC", "Torque_Nm",
        "Temperature_C", "Range_KM", "Accel_Percent", "Brake_Percent",
        "Front_Dist_CM", "Left_Dist_CM", "Right_Dist_CM", "TTC_Sec",
        "Collision_Warn", "BSD_Left", "BSD_Right", "Alarm_Level",
        "Fault_Flags", "Drive_Mode"
    ])

    # Write telemetry rows
    for r in rows:
        writer.writerow([
            r["timestamp"], r["seq"], r["speed"], r["soc"], r["torque"],
            r["temp"], r["range"], r["accel"], r["brake"],
            r["front_dist"], r["left_dist"], r["right_dist"], r["ttc"],
            r["collision_warn"], r["bsd_left"], r["bsd_right"], r["alarm_level"],
            r["fault_flags"], r["drive_mode"]
        ])

    output.seek(0)
    headers = {"Content-Disposition": f"attachment; filename=session_{session_id}.csv"}
    return StreamingResponse(output, media_type="text/csv", headers=headers)

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await ws_manager.connect(websocket)
    replay_engine = None

    def on_replay_packet(packet):
        # Dispatch replay packets directly back to this specific websocket client
        if loop:
            asyncio.run_coroutine_threadsafe(websocket.send_json(packet), loop)

    def on_replay_finished():
        if loop:
            asyncio.run_coroutine_threadsafe(
                websocket.send_json({"event": "replay_finished"}), loop
            )

    try:
        while True:
            data = await websocket.receive_json()
            event = data.get("event")

            # 1. Diagnostic CLI command forwarding
            if event == "cli_command":
                cmd_payload = data.get("data", "")
                logger.info(f"CLI console sent shell command: {cmd_payload}")
                if serial_mgr:
                    success = serial_mgr.send_command(cmd_payload)
                    await websocket.send_json({
                        "event": "cmd_ack",
                        "data": {"command": cmd_payload, "success": success}
                    })

            # 2. Replay Initialization
            elif event == "start_replay":
                session_id = data.get("data", {}).get("session_id")
                logger.info(f"Initiating replay playback for session #{session_id}")
                
                # Stop any active replay first
                if replay_engine:
                    replay_engine.stop()

                # Start the replay client
                replay_engine = ReplayManager(
                    session_id=session_id,
                    on_replay_packet=on_replay_packet,
                    on_replay_finished=on_replay_finished
                )
                replay_engine.start()

            # 3. Playback controls (pause, resume, seek, speed)
            elif event == "replay_control":
                action = data.get("data")
                if replay_engine:
                    if action == "pause":
                        replay_engine.pause()
                    elif action == "resume":
                        replay_engine.resume()
                    elif action == "stop":
                        replay_engine.stop()
                    elif action == "speed":
                        speed_val = float(data.get("value", 1.0))
                        replay_engine.set_speed(speed_val)
                    elif action == "seek":
                        pct_val = float(data.get("value", 0.0))
                        replay_engine.seek(pct_val)

    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
        if replay_engine:
            replay_engine.stop()
    except Exception as e:
        logger.error(f"WebSocket client loop exception: {e}")
        ws_manager.disconnect(websocket)
        if replay_engine:
            replay_engine.stop()
