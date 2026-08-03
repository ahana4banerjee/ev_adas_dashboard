from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("TelemetryBridge")

app = FastAPI(title="EV ADAS Telemetry Bridge", version="2.0.0")

# Enable CORS for frontend requests during development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"New client connected. Active connections: {len(self.active_connections)}")
        # Send connection status handshake
        await websocket.send_json({"event": "status", "data": {"connected": True, "source": "bridge"}})

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
            logger.info(f"Client disconnected. Active connections: {len(self.active_connections)}")

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception as e:
                logger.error(f"Error broadcasting to client: {e}")

manager = ConnectionManager()

@app.get("/")
def read_root():
    return {"status": "running", "version": "2.0.0", "service": "EV ADAS Dashboard Serial-WebSocket Bridge"}

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            # Listen for command packets or configurations from React
            data = await websocket.receive_json()
            logger.info(f"Received WebSocket message: {data}")
            # Echo back to confirm receipt in Phase 1
            await websocket.send_json({"event": "ack", "data": {"message": "received", "payload": data}})
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        manager.disconnect(websocket)
