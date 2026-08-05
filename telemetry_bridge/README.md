# Telemetry Bridge Service (FastAPI Gateway)

The Telemetry Bridge is a Python FastAPI service that functions as a bidirectional gateway between the STM32 microcontroller's UART bus and the React dashboard client.

---

## 1. Features
* **Serial Connection Manager**: Manages physical/virtual UART ports with automated connection drops and re-connection threads.
* **Demo Simulator Mode**: Operates in a mock environment (`--demo`) with virtual simulation registers that dynamically react to sliders and overrides sent by the WebSocket interface.
* **SQLite WAL Database Logger**: Automatically logs all incoming telemetry data records at 10Hz into a local `telemetry.db` file using Write-Ahead Logging (WAL) to prevent lockouts during read queries.
* **FastAPI Web Server**: Serves static endpoints for exporting logged sessions as CSV downloads and hosts the WebSocket router.

---

## 2. Installation & Setup

### Prerequisites
* Python 3.10+
* Virtual serial port pairs (e.g. VSPE or com0com) if testing with PICSimLab on a single computer.

### Setup Instructions
1. Open your terminal in the `telemetry_bridge` folder:
   ```powershell
   cd telemetry_bridge
   ```
2. Create and activate a Python virtual environment:
   ```powershell
   python -m venv venv
   .\venv\Scripts\Activate.ps1
   ```
3. Install dependencies:
   ```powershell
   pip install -r requirements.txt
   ```

---

## 3. Running the Gateway

### A. Live Simulator / HIL Mode (Connected to COM Ports)
To link your physical STM32 board or a running PICSimLab instance:
```powershell
python bridge.py --port COM2 --baud 115200
```
*Note: Make sure PICSimLab is bound to the opposite side of the virtual port (e.g., `COM4`).*

### B. Interactive Demo Mode (No Hardware)
To run the dashboard in a completely virtual mock environment:
```powershell
python bridge.py --demo
```

---

## 4. API Endpoints

* **`GET /sessions`**: Retrieves the list of recorded driving logs from the SQLite database.
* **`GET /sessions/{id}/export`**: Streams the telemetry logs of a specific session as a downloadable `.csv` file.
* **`WS /ws`**: Primary WebSocket route for client telemetry streaming, diagnostic command relays, and playback seek commands.
