import React from 'react'
import { Wifi, WifiOff, AlertTriangle, Cpu } from 'lucide-react'

function StatusHeader({ connectionStatus, metrics, packetStats }) {
  // Decode specific faults and warnings from real-time metrics
  const getAlarmState = () => {
    if (!metrics) {
      return { severity: 'nominal', text: 'ALL SYSTEMS NOMINAL' }
    }

    const faultFlags = metrics.faultFlags || 0
    const faults = []
    if (faultFlags & 0x01) faults.push('OVERHEAT')
    if (faultFlags & 0x02) faults.push('LOW SOC')
    if (faultFlags & 0x04) faults.push('COLLISION FAULT')

    if (faults.length > 0) {
      return { severity: 'critical', text: `FAULT: ${faults.join(' | ')}` }
    }

    const warnings = []
    if (metrics.collisionWarn === 2) {
      warnings.push('COLLISION ALERT')
    } else if (metrics.collisionWarn === 1) {
      warnings.push('COLLISION WARN')
    }

    if (metrics.bsdLeft) warnings.push('BSD LEFT')
    if (metrics.bsdRight) warnings.push('BSD RIGHT')
    if (metrics.temp >= 75.0 && metrics.temp < 90.0) {
      warnings.push('MOTOR TEMP HIGH')
    }

    if (warnings.length > 0) {
      return { severity: 'warning', text: `WARN: ${warnings.join(' | ')}` }
    }

    return { severity: 'nominal', text: 'ALL SYSTEMS NOMINAL' }
  }

  const alarm = getAlarmState()

  const getAlarmBadgeClass = () => {
    if (alarm.severity === 'critical') {
      return 'bg-danger/10 border-danger text-danger animate-pulse-red'
    } else if (alarm.severity === 'warning') {
      return 'bg-warning/10 border-warning text-warning'
    }
    return 'bg-primary/10 border-primary text-primary'
  }

  return (
    <header className="w-full bg-card border-b border-border px-6 py-4 flex flex-col md:flex-row justify-between items-center gap-4">
      {/* Connection Status */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          {connectionStatus === 'CONNECTED' ? (
            <div className="flex items-center gap-1.5 text-primary">
              <Wifi size={16} />
              <span className="text-xs font-mono font-bold uppercase tracking-wider">Bridge Online</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-danger">
              <WifiOff size={16} />
              <span className="text-xs font-mono font-bold uppercase tracking-wider">Bridge Offline</span>
            </div>
          )}
        </div>
        <div className="text-[10px] font-mono text-muted bg-background px-2.5 py-1 rounded border border-border/50">
          WS://127.0.0.1:8080/WS | VIRTUAL TELEMETRY LINK
        </div>
      </div>

      {/* Safety Alert Center */}
      <div className={`px-4 py-1.5 border rounded-full text-xs font-mono font-bold flex items-center gap-2 transition-colors ${getAlarmBadgeClass()}`}>
        <AlertTriangle size={14} className={alarm.severity === 'critical' ? 'animate-pulse' : ''} />
        <span>{alarm.text}</span>
      </div>

      {/* Packet / Network Performance Stats */}
      <div className="flex items-center gap-6 text-xs font-mono">
        <div className="flex items-center gap-2">
          <Cpu size={14} className="text-secondary" />
          <span className="text-muted">RATE:</span>
          <span className="text-white font-bold">{packetStats.rate} Hz</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted">CRC ERRORS:</span>
          <span className={`font-bold ${packetStats.crcErrors > 0 ? 'text-danger' : 'text-gray-400'}`}>
            {packetStats.crcErrors}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted">LOST:</span>
          <span className={`font-bold ${packetStats.lostPackets > 0 ? 'text-warning' : 'text-gray-400'}`}>
            {packetStats.lostPackets}
          </span>
        </div>
      </div>
    </header>
  )
}

export default StatusHeader
