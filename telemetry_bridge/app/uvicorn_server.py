import os
import asyncio
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import logging
from contextlib import asynccontextmanager
from .serial_mgr import SerialManager

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

def handle_serial_packet(packet: dict):
    """
    Thread-safe packet callback. Resolves thread barriers by dispatching 
    the WebSocket broadcast coroutine onto the main event loop.
    """
    if loop and ws_manager.active_connections:
        asyncio.run_coroutine_threadsafe(ws_manager.broadcast(packet), loop)

@asynccontextmanager
async def lifespan(app: FastAPI):
    global serial_mgr, loop
    loop = asyncio.get_running_loop()

    # Load parameters from environment variables compiled in bridge.py
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
        "demo_mode": serial_mgr.demo_mode if serial_mgr else False
    }

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await ws_manager.connect(websocket)
    try:
        while True:
            # Listen for CLI commands sent from the dashboard
            data = await websocket.receive_json()
            if data.get("event") == "cli_command":
                cmd_payload = data.get("data", "")
                logger.info(f"CLI console sent shell command: {cmd_payload}")
                if serial_mgr:
                    success = serial_mgr.send_command(cmd_payload)
                    await websocket.send_json({
                        "event": "cmd_ack",
                        "data": {"command": cmd_payload, "success": success}
                    })
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"WebSocket endpoint exception: {e}")
        ws_manager.disconnect(websocket)
