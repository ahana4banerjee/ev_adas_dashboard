import uvicorn
import os
import argparse

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="EV ADAS Telemetry Bridge Daemon")
    parser.add_argument("--port", type=str, default=None, help="Virtual COM serial port (e.g. COM4 or /dev/ttyUSB0)")
    parser.add_argument("--baud", type=int, default=115200, help="Baud rate (default: 115200)")
    parser.add_argument("--demo", action="store_true", help="Run in mock telemetry demo mode")
    args = parser.parse_args()

    # Pass configuration parameters to environment variables for FastAPI setup
    os.environ["BRIDGE_PORT"] = args.port if args.port else ""
    os.environ["BRIDGE_BAUD"] = str(args.baud)
    os.environ["BRIDGE_DEMO"] = "1" if args.demo or not args.port else "0"

    port_web = int(os.environ.get("PORT", 8080))
    host_web = os.environ.get("HOST", "0.0.0.0")
    print(f"Starting EV ADAS Telemetry Bridge on {host_web}:{port_web}...")
    print(f"Serial Configuration: Port={args.port}, Baud={args.baud}, Demo={args.demo or not args.port}")
    
    # Run the Uvicorn application
    uvicorn.run("app.uvicorn_server:app", host=host_web, port=port_web, log_level="info")
