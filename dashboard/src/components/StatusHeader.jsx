import React from 'react'
import { Wifi, WifiOff, AlertTriangle, Cpu } from 'lucide-react'

function StatusHeader({ connectionStatus, activeAlarms, packetStats }) {
  const getAlarmBadgeClass = () => {
    if (activeAlarms.critical > 0) {
      return 'bg-danger/10 border-danger text-danger animate-pulse-red'
    } else if (activeAlarms.warning > 0) {
      return 'bg-warning/10 border-warning text-warning'
    }
    return 'bg-primary/10 border-primary text-primary'
  };

  const getAlarmText = () => {
    if (activeAlarms.critical > 0) return `${activeAlarms.critical} CRITICAL SAFETY FAULTS`
    if (activeAlarms.warning > 0) return `${activeAlarms.warning} ADAS WARNINGS ACTIVE`
    return 'ALL SYSTEMS NOMINAL'
  };

  return (
    <header className="w-full bg-card border-b border-border px-6 py-4 flex flex-col md:flex-row justify-between items-center gap-4">
      {/* Connection Section */}
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
          WS://127.0.0.1:8080/WS | COM4 @ 115200 BAUD
        </div>
      </div>

      {/* Safety Alert Center */}
      <div className={`px-4 py-1.5 border rounded-full text-xs font-mono font-bold flex items-center gap-2 ${getAlarmBadgeClass()}`}>
        <AlertTriangle size={14} />
        <span>{getAlarmText()}</span>
      </div>

      {/* Performance Statistics */}
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
