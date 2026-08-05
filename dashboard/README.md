# React Dashboard Client (Vite + Tailwind CSS)

The EV ADAS Dashboard is a premium web client designed to monitor real-time vehicle telematics, adjust safety parameter registers, trigger diagnostic fault overrides, and replay logged driving sessions.

---

## 1. Features
* **Traction Cockpit**: Custom-rendered SVG dial gauges tracking speed and motor torque.
* **ADAS Obstacle Radar**: HTML5 Canvas rendering a bird's-eye view lane layout with animated lane markers, blind spot sectors, and detailed vector sports car graphics.
* **Telemetry Scrolling Charts**: Recharts line graphics plotting Speed, Torque, and Motor Temperature histories.
* **Fault Center & Diagnostics**: Interactive buttons to inject virtual faults (Motor Overheat, Low SOC, Collision Alerts) and sliders to override ultrasonic obstacle readings.
* **Session Replay Manager**: Timeline Scrubbers to seek, speed-up ($0.5x$ to $4.0x$), and review database logs.
* **Audible Alert Toggle**: Mute/Unmute buttons driving a virtual Web Audio API hazard sound matching active alarms.

---

## 2. Installation & Run Instructions

### Setup Instructions
1. Open your terminal in the `dashboard` folder:
   ```powershell
   cd dashboard
   ```
2. Install npm node modules:
   ```powershell
   npm install
   ```
3. Run the development server:
   ```powershell
   npm run dev
   ```
4. Open your browser and navigate to `http://localhost:5173/`.

### Building for Production
To output optimized CSS/HTML files:
```powershell
npm run build
```
The compiled build output will be stored in `dist/`.
