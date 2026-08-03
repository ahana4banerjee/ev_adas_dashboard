import uvicorn
import os

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    print(f"Starting EV ADAS Telemetry Bridge on port {port}...")
    uvicorn.run("app.uvicorn_server:app", host="127.0.0.1", port=port, log_level="info")
