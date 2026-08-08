import React, { useState, useEffect, useRef } from 'react'
import DashboardLayout from './components/DashboardLayout'
import StatusHeader from './components/StatusHeader'
import { Play, Pause, RotateCcw, ShieldCheck, Terminal, ShieldAlert, Cpu, AlertTriangle } from 'lucide-react'
import MetricGauge from './components/MetricGauge'
import AdasCanvas from './components/AdasCanvas'
import TelemetryChart from './components/TelemetryChart'

function App() {
  const [activeView, setActiveView] = useState('live')
  const [connectionStatus, setConnectionStatus] = useState('DISCONNECTED')
  const [messages, setMessages] = useState([])
  const [ws, setWs] = useState(null)
  
  // Real-time parsed vehicle metrics (default mock values for layout display)
  const [metrics, setMetrics] = useState({
    speed: 0.0,
    soc: 80.0,
    torque: 0,
    temp: 25.0,
    range: 280,
    accel: 0,
    brake: 0,
    frontDist: 400,
    leftDist: 400,
    rightDist: 400,
    ttc: 99.9,
    collisionWarn: 0, // 0=None, 1=Warn, 2=Crit
    bsdLeft: 0,
    bsdRight: 0,
    alarmLevel: 0, // 0=None, 1=Advisory, 2=Warning, 3=Critical
    faultFlags: 0x00, // 0x00=Clean
    driveMode: 'NORMAL'
  })

  const [packetStats, setPacketStats] = useState({
    rate: 10,
    crcErrors: 0,
    lostPackets: 0
  })

  // Telemetry rolling chart history
  const [chartHistory, setChartHistory] = useState([
    { time: '0', speed: 0, temp: 25 },
    { time: '5', speed: 20, temp: 25.5 },
    { time: '10', speed: 45, temp: 26.2 },
    { time: '15', speed: 72.5, temp: 27.1 }
  ])

  // Replay playback states
  const [sessions, setSessions] = useState([])
  const [selectedSessionId, setSelectedSessionId] = useState('')
  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0)
  const [replayIndex, setReplayIndex] = useState(0)
  const [replayTotal, setReplayTotal] = useState(0)
  const [replayProgress, setReplayProgress] = useState(0)

  // Simulated Web CLI Terminal inputs
  const [terminalInput, setTerminalInput] = useState('')
  const [terminalLogs, setTerminalLogs] = useState([
    '[SYSTEM] EV ADAS NOC Cockpit initialized.',
    '[SYSTEM] Listening for local websocket bridge streams on port 8080...'
  ])

  // Threshold Configuration states
  const [thresholds, setThresholds] = useState({
    fcwWarn: 50,
    fcwCrit: 20,
    bsdDist: 30,
    overspeed: 120,
    ttcWarn: 3.0,
    ttcCrit: 1.5
  })
  const thresholdsRef = useRef(thresholds)
  useEffect(() => {
    thresholdsRef.current = thresholds
  }, [thresholds])

  // Diagnostic Trouble Codes (DTC) parsed records
  const [dtcRecords, setDtcRecords] = useState([])

  const terminalEndRef = useRef(null)

  // Auto-scroll Diagnostic Console to bottom on new messages
  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [terminalLogs])

  // Establish WebSocket connection to backend daemon
  useEffect(() => {
    const socket = new WebSocket('ws://localhost:8080/ws')

    socket.onopen = () => {
      setConnectionStatus('CONNECTED')
      setTerminalLogs(prev => [...prev, '[BRIDGE] Telemetry socket bridge connection established.'])
    }

    socket.onclose = () => {
      setConnectionStatus('DISCONNECTED')
      setTerminalLogs(prev => [...prev, '[BRIDGE] Telemetry socket bridge connection dropped. Reconnecting...'])
    }

    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        // Store incoming raw message in the array log
        setMessages(prev => [JSON.stringify(msg), ...prev].slice(0, 100))
        
        // If it's live telemetry, map it to dashboard states
        if (msg.event === 'telemetry') {
          setMetrics(msg.data)
          
          if (msg.is_replay) {
            setReplayIndex(msg.replay_index)
            setReplayTotal(msg.replay_total)
            setReplayProgress(msg.replay_index / (msg.replay_total - 1 || 1))
          } else {
            setPacketStats(msg.stats || { rate: 10, crcErrors: 0, lostPackets: 0 })
            // Capture timestamp and update the line chart buffer (avoiding duplicates)
            const timeSec = (msg.data.timestamp / 1000).toFixed(0)
            setChartHistory(prev => {
              if (prev.length > 0 && prev[prev.length - 1].time === timeSec) {
                return prev
              }
              const newPoint = {
                time: timeSec,
                speed: msg.data.speed,
                temp: msg.data.temp
              }
              return [...prev, newPoint].slice(-45) // Keep a rolling window of 45 seconds
            })
          }
        } else if (msg.event === 'replay_finished') {
          setIsPlaying(false)
          setTerminalLogs(prev => [...prev, '[REPLAY] Drive playback finished.'])
        } else if (msg.event === 'cmd_ack') {
          setTerminalLogs(prev => [...prev, `[ACK] Command "${msg.data.command}" success: ${msg.data.success}`])
        } else if (msg.event === 'cli_log') {
          setTerminalLogs(prev => [...prev, msg.data])
          parseDtcLogLine(msg.data)
        }
      } catch (err) {
        console.error('Error parsing packet data:', err)
      }
    }

    setWs(socket)

    return () => {
      socket.close()
    }
  }, [])

  // Fetch recorded sessions when swapping to replay view
  useEffect(() => {
    if (activeView === 'replay') {
      fetch('http://localhost:8080/sessions')
        .then(res => res.json())
        .then(data => {
          setSessions(data)
          if (data.length > 0 && !selectedSessionId) {
            setSelectedSessionId(data[0].id.toString())
          }
        })
        .catch(err => console.error('Error loading sessions:', err))
    }
  }, [activeView])

  const handlePlayReplay = () => {
    if (!selectedSessionId) return
    if (ws && ws.readyState === WebSocket.OPEN) {
      if (!isPlaying) {
        if (replayIndex > 0 && replayIndex < replayTotal - 1) {
          ws.send(JSON.stringify({ event: 'replay_control', data: 'resume' }))
        } else {
          ws.send(JSON.stringify({ event: 'start_replay', data: { session_id: parseInt(selectedSessionId) } }))
        }
        setIsPlaying(true)
      }
    }
  }

  const handlePauseReplay = () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ event: 'replay_control', data: 'pause' }))
      setIsPlaying(false)
    }
  }

  const handleStopReplay = () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ event: 'replay_control', data: 'stop' }))
      setIsPlaying(false)
      setReplayIndex(0)
      setReplayProgress(0)
    }
  }

  const handleSpeedChange = (newSpeed) => {
    setPlaybackSpeed(newSpeed)
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ event: 'replay_control', data: 'speed', value: parseFloat(newSpeed) }))
    }
  }

  const handleTimelineClick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const pct = Math.max(0.0, Math.min(1.0, x / rect.width))
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ event: 'replay_control', data: 'seek', value: pct }))
    }
  }

  const handleExportCSV = () => {
    if (!selectedSessionId) return
    window.open(`http://localhost:8080/sessions/${selectedSessionId}/export`, '_blank')
  }

  const handleApplyLimits = () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ event: 'cli_command', data: `set fcw_warn ${thresholds.fcwWarn}` }))
      ws.send(JSON.stringify({ event: 'cli_command', data: `set fcw_crit ${thresholds.fcwCrit}` }))
      ws.send(JSON.stringify({ event: 'cli_command', data: `set bsd_dist ${thresholds.bsdDist}` }))
      ws.send(JSON.stringify({ event: 'cli_command', data: `set overspeed ${thresholds.overspeed}` }))
      ws.send(JSON.stringify({ event: 'cli_command', data: `set ttc_warn ${thresholds.ttcWarn}` }))
      ws.send(JSON.stringify({ event: 'cli_command', data: `set ttc_crit ${thresholds.ttcCrit}` }))
      setTerminalLogs(prev => [...prev, '[CONFIG] Sent parameters to vehicle controller & committed to Flash NVM.'])
    } else {
      setTerminalLogs(prev => [...prev, '[CONFIG] Sync failed: Serial bridge link offline.'])
    }
  }

  const handleSetDriveMode = (mode) => {
    setMetrics(prev => ({ ...prev, driveMode: mode.toUpperCase() }))
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ event: 'cli_command', data: `mode ${mode.toLowerCase()}` }))
      setTerminalLogs(prev => [...prev, `[COMMAND] Setting drive mode: ${mode.toUpperCase()}`])
    } else {
      setTerminalLogs(prev => [...prev, '[COMMAND] Mode switch failed: Serial bridge link offline.'])
    }
  }

  // Helper to parse incoming DTC lines from microcontroller / bridge
  const parseDtcLogLine = (line) => {
    if (!line) return

    if (line.includes('No stored DTC') || line.includes('All DTC records cleared')) {
      setDtcRecords([])
      return
    }

    const headerMatch = line.match(/\[DTC\s*#?(\d+)\]\s*([A-Z0-9]+)\s*\((0x[0-9A-Fa-f]+)\)\s*\|\s*([A-Z]+)\s*\|\s*(\d+ms|\d+)/i) ||
                        line.match(/\[(\d+)\]\s*Code:\s*([A-Z0-9]+)\s*\((0x[0-9A-Fa-f]+)\)\s*\|\s*State:\s*([A-Z]+)\s*\|\s*Time:\s*(\d+ms|\d+)/i)
    if (headerMatch) {
      const id = parseInt(headerMatch[1])
      const code = headerMatch[2]
      const hex = headerMatch[3]
      const state = headerMatch[4]
      const time = headerMatch[5]

      setDtcRecords(prev => {
        const filtered = prev.filter(r => r.id !== id && r.code !== code)
        return [...filtered, {
          id,
          code,
          hex,
          state,
          time: time.endsWith('ms') ? time : `${time}ms`,
          speed: '--',
          soc: '--',
          temp: '--',
          desc: 'Diagnostic trouble event'
        }]
      })
      return
    }

    const snapMatch = line.match(/FreezeFrame:\s*Speed=([^,]+),\s*SOC=([^,]+),\s*Temp=([^\s\r\n]+)/i) ||
                      line.match(/FreezeFrame:\s*Spd=([^,]+),\s*SOC=([^,]+),\s*Temp=([^\s\r\n]+)/i)
    if (snapMatch) {
      setDtcRecords(prev => {
        if (prev.length === 0) return prev
        const last = { ...prev[prev.length - 1] }
        last.speed = snapMatch[1].trim()
        last.soc = snapMatch[2].trim()
        last.temp = snapMatch[3].trim()
        return [...prev.slice(0, -1), last]
      })
      return
    }

    const descMatch = line.match(/Detail:\s*(.+)/i) || line.match(/Desc:\s*(.+)/i)
    if (descMatch) {
      setDtcRecords(prev => {
        if (prev.length === 0) return prev
        const last = { ...prev[prev.length - 1] }
        last.desc = descMatch[1].trim()
        return [...prev.slice(0, -1), last]
      })
      return
    }
  }

  const handleInjectFault = (type) => {
    // 1. Optimistic immediate state update
    if (type === 'motor') {
      setMetrics(prev => ({ ...prev, temp: 95.0, faultFlags: (prev.faultFlags | 0x01), alarmLevel: 3 }))
      setDtcRecords(prev => {
        const filtered = prev.filter(r => r.code !== 'P0A80')
        return [...filtered, {
          id: filtered.length + 1,
          code: 'P0A80',
          hex: '0x0A80',
          state: 'ACTIVE',
          time: '10ms',
          speed: `${metrics.speed.toFixed(1)} km/h`,
          soc: `${metrics.soc.toFixed(1)}%`,
          temp: '95.0 °C',
          desc: 'Motor temperature limit exceeded'
        }]
      })
    } else if (type === 'soc') {
      setMetrics(prev => ({ ...prev, soc: 1.0, faultFlags: (prev.faultFlags | 0x02), alarmLevel: 3 }))
      setDtcRecords(prev => {
        const filtered = prev.filter(r => r.code !== 'P0210')
        return [...filtered, {
          id: filtered.length + 1,
          code: 'P0210',
          hex: '0x0210',
          state: 'ACTIVE',
          time: '10ms',
          speed: `${metrics.speed.toFixed(1)} km/h`,
          soc: '1.0%',
          temp: `${metrics.temp.toFixed(1)} °C`,
          desc: 'Battery state of charge critically low'
        }]
      })
    } else if (type === 'col') {
      setMetrics(prev => ({ ...prev, collisionWarn: 2, frontDist: 15, faultFlags: (prev.faultFlags | 0x04), alarmLevel: 3 }))
      setDtcRecords(prev => {
        const filtered = prev.filter(r => r.code !== 'C1C00')
        return [...filtered, {
          id: filtered.length + 1,
          code: 'C1C00',
          hex: '0x1C00',
          state: 'ACTIVE',
          time: '10ms',
          speed: `${metrics.speed.toFixed(1)} km/h`,
          soc: `${metrics.soc.toFixed(1)}%`,
          temp: `${metrics.temp.toFixed(1)} °C`,
          desc: 'Critical front collision hazard'
        }]
      })
    }

    // 2. Dispatch command to backend bridge and MCU
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ event: 'cli_command', data: `fault inject ${type}` }))
      setTerminalLogs(prev => [...prev, `[FAULT] Triggered virtual override: ${type.toUpperCase()}`])
      setTimeout(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ event: 'cli_command', data: 'dtc read' }))
        }
      }, 250)
    } else {
      setTerminalLogs(prev => [...prev, '[FAULT] Injection failed: Serial bridge link offline.'])
    }
  }

  const handleClearFaults = () => {
    // Optimistically reset UI state to safe nominal
    setMetrics(prev => ({
      ...prev,
      temp: 25.0,
      soc: 80.0,
      collisionWarn: 0,
      frontDist: 400,
      faultFlags: 0x00,
      alarmLevel: 0
    }))
    setDtcRecords([])

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ event: 'cli_command', data: 'fault clear' }))
      setTerminalLogs(prev => [...prev, '[FAULT] Cleared fault registers. Controller returning to NORMAL.'])
      setTimeout(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ event: 'cli_command', data: 'dtc read' }))
        }
      }, 250)
    } else {
      setTerminalLogs(prev => [...prev, '[FAULT] Reset failed: Serial bridge link offline.'])
    }
  }

  const handleReadDTCs = () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ event: 'cli_command', data: 'dtc read' }))
      setTerminalLogs(prev => [...prev, '[DTC] Querying Diagnostic Trouble Codes & Freeze Frames...'])
    } else {
      setTerminalLogs(prev => [...prev, '[DTC] Query failed: Serial bridge link offline.'])
    }
  }

  const handleClearDTCs = () => {
    setDtcRecords([])
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ event: 'cli_command', data: 'dtc clear' }))
      setTerminalLogs(prev => [...prev, '[DTC] Cleared stored Diagnostic Trouble Codes.'])
    } else {
      setTerminalLogs(prev => [...prev, '[DTC] Clear failed: Serial bridge link offline.'])
    }
  }

  const handleObstacleOverride = (val) => {
    // Optimistic state update for immediate slider feedback
    setMetrics(prev => ({ ...prev, frontDist: val }))
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ event: 'cli_command', data: `obstacle ${val}` }))
    }
  }

  const handleObstacleClear = () => {
    setMetrics(prev => ({ ...prev, frontDist: 400 }))
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ event: 'cli_command', data: 'obstacle clear' }))
      setTerminalLogs(prev => [...prev, '[OVERRIDE] Obstacle override cleared. Real-time range tracking restored.'])
    } else {
      setTerminalLogs(prev => [...prev, '[OVERRIDE] Reset failed: Serial bridge link offline.'])
    }
  }

  const executeCommand = (cmdStr) => {
    const trimmed = cmdStr.trim()
    if (!trimmed) return
    setTerminalLogs(prev => [...prev, `> ${trimmed}`])

    const setMatch = trimmed.match(/^set\s+([a-zA-Z_]+)\s+([0-9.]+)/i)
    if (setMatch) {
      const param = setMatch[1].toLowerCase()
      const val = parseFloat(setMatch[2])
      if (param === 'fcw_warn') {
        thresholdsRef.current.fcwWarn = val
        setThresholds(prev => ({ ...prev, fcwWarn: val }))
      } else if (param === 'fcw_crit') {
        thresholdsRef.current.fcwCrit = val
        setThresholds(prev => ({ ...prev, fcwCrit: val }))
      } else if (param === 'bsd_dist') {
        thresholdsRef.current.bsdDist = val
        setThresholds(prev => ({ ...prev, bsdDist: val }))
      } else if (param === 'overspeed') {
        thresholdsRef.current.overspeed = val
        setThresholds(prev => ({ ...prev, overspeed: val }))
      } else if (param === 'ttc_warn') {
        thresholdsRef.current.ttcWarn = val
        setThresholds(prev => ({ ...prev, ttcWarn: val }))
      } else if (param === 'ttc_crit') {
        thresholdsRef.current.ttcCrit = val
        setThresholds(prev => ({ ...prev, ttcCrit: val }))
      }
    }

    const lower = trimmed.toLowerCase()
    if (lower === 'config reset') {
      const defs = { fcwWarn: 50, fcwCrit: 20, bsdDist: 30, overspeed: 120, ttcWarn: 3.0, ttcCrit: 1.5 }
      thresholdsRef.current = defs
      setThresholds(defs)
    } else if (lower === 'config' || lower === 'config read') {
      const curr = thresholdsRef.current
      setTerminalLogs(prev => [
        ...prev,
        '===== SYSTEM CONFIGURATION (NVM) =====',
        ` FCW Warning Distance  : ${curr.fcwWarn.toFixed(1)} cm`,
        ` FCW Critical Distance : ${curr.fcwCrit.toFixed(1)} cm`,
        ` TTC Warning Time      : ${curr.ttcWarn.toFixed(1)} s`,
        ` TTC Critical Time     : ${curr.ttcCrit.toFixed(1)} s`,
        ` BSD Range Threshold   : ${curr.bsdDist.toFixed(1)} cm`,
        ` BSD Speed Gate        : 20.0 km/h`,
        ` Overspeed Limit       : ${curr.overspeed.toFixed(1)} km/h`,
        ' Storage Flash Page    : 0x0800FC00 (NVM Protected)',
        '======================================'
      ])
    } else if (lower === 'help' || lower === '?') {
      setTerminalLogs(prev => [
        ...prev,
        'Commands:',
        '  mode <eco|normal|sport>',
        '  speed set <kmh>',
        '  soc set <pct>',
        '  temp set <degC>',
        '  obstacle <cm>',
        '  obstacle clear',
        '  fault inject <motor|soc|col>',
        '  fault clear',
        '  dtc [read|clear]',
        '  config [read|reset]',
        '  set <fcw_warn|fcw_crit|bsd_dist|bsd_speed|overspeed|ttc_warn|ttc_crit> <val>',
        '  status',
        '  reset'
      ])
    }
    
    // If ws is active, send it to microcontroller via bridge
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ event: 'cli_command', data: trimmed }))
    } else {
      setTerminalLogs(prev => [...prev, '[ERROR] Cannot transmit: Serial bridge link offline.'])
    }
    setTerminalInput('')
  }

  // Active alarms helper
  const getActiveAlarms = () => {
    return {
      critical: metrics.faultFlags !== 0 ? 1 : 0,
      warning: metrics.collisionWarn > 0 ? 1 : 0
    }
  }

  return (
    <DashboardLayout
      activeView={activeView}
      onViewChange={setActiveView}
      statusHeader={
        <StatusHeader
          connectionStatus={connectionStatus}
          metrics={metrics}
          packetStats={packetStats}
        />
      }
    >
      {/* 1. Dashboard View (Used for both Live Diagnostics and Session Replays) */}
      {(activeView === 'live' || activeView === 'replay') && (
        <div className="flex flex-col gap-6">
          
          {/* Replay Control Bar (Visible only during Replay Mode) */}
          {activeView === 'replay' && (
            <div className="bg-card border border-border rounded-xl p-4 flex flex-col md:flex-row gap-4 items-center justify-between shadow-lg">
              <div className="flex flex-col">
                <span className="text-xs font-mono font-bold text-white uppercase tracking-wider">Drive Session Replay Manager</span>
                <span className="text-[10px] text-muted">Replaying database logs. Dials and canvases are driven by recorded metrics.</span>
              </div>
              
              <div className="flex flex-wrap items-center gap-4 w-full md:w-auto justify-end">
                {/* Session Selector */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-muted uppercase">Session:</span>
                  <select 
                    value={selectedSessionId}
                    onChange={(e) => {
                      setSelectedSessionId(e.target.value)
                      handleStopReplay()
                    }}
                    className="bg-background border border-border rounded px-2 py-1 text-xs text-white focus:outline-none cursor-pointer"
                  >
                    {sessions.length === 0 ? (
                      <option value="">No sessions found</option>
                    ) : (
                      sessions.map(s => (
                        <option key={s.id} value={s.id}>{s.name} (#{s.id})</option>
                      ))
                    )}
                  </select>
                </div>

                {/* CSV Export */}
                <button 
                  onClick={handleExportCSV}
                  disabled={!selectedSessionId}
                  className="bg-secondary/20 border border-secondary/40 text-secondary text-[10px] disabled:opacity-40 disabled:cursor-not-allowed font-bold font-mono uppercase px-3 py-1.5 rounded hover:bg-secondary/30 transition-colors"
                >
                  Export CSV
                </button>

                {/* Reset Play Pause Timeline Controls */}
                <div className="flex items-center gap-2 border-l border-border/20 pl-4">
                  <button 
                    onClick={handleStopReplay}
                    title="Reset Replay"
                    className="p-2 bg-background border border-border rounded-full text-muted hover:text-white transition-colors"
                  >
                    <RotateCcw size={13} />
                  </button>
                  
                  {!isPlaying ? (
                    <button 
                      onClick={handlePlayReplay}
                      disabled={!selectedSessionId}
                      className="p-2 bg-primary/10 border border-primary/30 text-primary rounded-full hover:bg-primary/20 transition-colors disabled:opacity-40"
                    >
                      <Play size={13} className="fill-primary" />
                    </button>
                  ) : (
                    <button 
                      onClick={handlePauseReplay}
                      className="p-2 bg-warning/10 border border-warning/30 text-warning rounded-full hover:bg-warning/20 transition-colors"
                    >
                      <Pause size={13} className="fill-warning" />
                    </button>
                  )}

                  {/* Playback speed selection */}
                  <div className="flex items-center gap-1 font-mono text-[10px] border border-border bg-background/50 px-2 py-1 rounded">
                    <span>SPEED:</span>
                    <select 
                      value={playbackSpeed}
                      onChange={(e) => handleSpeedChange(e.target.value)}
                      className="bg-transparent text-secondary font-bold focus:outline-none cursor-pointer"
                    >
                      <option value="0.5">0.5x</option>
                      <option value="1.0">1.0x</option>
                      <option value="2.0">2.0x</option>
                      <option value="4.0">4.0x</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Timeline scrubber bar */}
              <div className="w-full border-t border-border/20 pt-3 mt-1">
                <div className="flex justify-between text-[9px] font-mono text-muted mb-1.5">
                  <span>TIMELINE PROGRESS</span>
                  <span>RECORD INDEX: {replayIndex + 1} / {replayTotal || 1}</span>
                </div>
                <div 
                  onClick={handleTimelineClick}
                  className="w-full h-2.5 bg-background rounded-full relative overflow-hidden cursor-pointer border border-border p-0.5"
                >
                  <div 
                    className="h-full bg-secondary rounded-full transition-all duration-100" 
                    style={{ width: `${replayProgress * 100}%` }}
                  ></div>
                </div>
              </div>
            </div>
          )}

          {/* Real-time Dials, ADAS View, and Metrics Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Card 1: Dials Display (Speed & Torque) */}
            <div className="bg-card border border-border rounded-xl p-6 flex flex-col justify-between">
              <div className="text-xs font-mono font-bold text-gray-400 mb-2 uppercase tracking-wider">Traction Cockpit</div>
              <div className="flex-1 flex flex-col justify-center items-center">
                {/* Dynamic SVG Speed & Torque Gauges */}
                <div className="flex flex-row justify-around items-center w-full">
                  <MetricGauge value={metrics.speed} min={0} max={120} title="Speedometer" unit="km/h" color="#10b981" />
                  <MetricGauge value={metrics.torque} min={0} max={100} title="Motor Torque" unit="Nm" color="#3b82f6" />
                </div>
                
                <div className="w-full flex flex-col items-center px-4 border-t border-border/40 pt-3 mt-2">
                  <div className="text-[9px] font-mono text-muted uppercase tracking-wider mb-2">Drive Mode Control</div>
                  <div className="flex gap-2 w-full justify-center">
                    {['ECO', 'NORMAL', 'SPORT'].map((m) => {
                      const isActive = (metrics.driveMode || '').toUpperCase() === m
                      return (
                        <button
                          key={m}
                          onClick={() => handleSetDriveMode(m)}
                          className={`flex-1 py-1.5 px-3 rounded text-xs font-mono font-bold transition-all cursor-pointer ${
                            isActive
                              ? m === 'ECO'
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50 shadow-sm shadow-emerald-500/20'
                                : m === 'SPORT'
                                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/50 shadow-sm shadow-amber-500/20'
                                : 'bg-primary/20 text-primary border border-primary/50 shadow-sm shadow-primary/20'
                              : 'bg-background/40 text-gray-400 border border-border/60 hover:bg-border/40 hover:text-white'
                          }`}
                        >
                          {m}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Card 2: ADAS Radar / Visualizer */}
            <div className="bg-card border border-border rounded-xl p-6 lg:col-span-2 flex flex-col justify-between">
              <div className="flex justify-between items-center mb-4">
                <div className="text-xs font-mono font-bold text-gray-400 uppercase tracking-wider">ADAS Obstacle Radar</div>
                <div className="text-[10px] font-mono text-warning bg-warning/10 border border-warning/20 px-2.5 py-0.5 rounded">
                  TTC: {metrics.ttc}s
                </div>
              </div>
              
              {/* HTML5 Canvas Radar View */}
              <div className="flex-1 min-h-[220px] flex items-center justify-center">
                <AdasCanvas 
                  frontDist={metrics.frontDist} 
                  leftDist={metrics.leftDist} 
                  rightDist={metrics.rightDist} 
                  collisionWarn={metrics.collisionWarn} 
                  bsdLeft={metrics.bsdLeft} 
                  bsdRight={metrics.bsdRight} 
                  speed={metrics.speed} 
                />
              </div>
            </div>

            {/* Card 3: Energy & Thermal Status */}
            <div className="bg-card border border-border rounded-xl p-6">
              <div className="text-xs font-mono font-bold text-gray-400 mb-4 uppercase tracking-wider">Battery & Thermal Log</div>
              <div className="flex flex-col gap-6 py-2">
                {/* Battery SOC */}
                <div>
                  <div className="flex justify-between text-xs font-mono text-gray-300 mb-2">
                    <span>PACK SOC STATUS</span>
                    <span className="text-primary font-bold">{metrics.soc}%</span>
                  </div>
                  <div className="w-full h-3 bg-background border border-border rounded-full overflow-hidden">
                    <div className="h-full bg-primary" style={{ width: `${metrics.soc}%` }}></div>
                  </div>
                </div>

                {/* Range & Temperature */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-background/40 border border-border/60 rounded-lg p-3">
                    <div className="text-[9px] font-mono text-muted uppercase">EST. Range</div>
                    <div className="text-xl font-extrabold text-white mt-1">{metrics.range} km</div>
                  </div>
                  <div className="bg-background/40 border border-border/60 rounded-lg p-3">
                    <div className="text-[9px] font-mono text-muted uppercase">Motor Temperature</div>
                    <div className="text-xl font-extrabold text-warning mt-1">{metrics.temp} °C</div>
                  </div>
                </div>

                {/* Pedals bar */}
                <div>
                  <div className="flex justify-between text-[10px] font-mono text-muted mb-1.5 uppercase">
                    <span>Pedal Input Log</span>
                    <span>ACC: {metrics.accel}% | BRK: {metrics.brake}%</span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-mono text-muted w-8">ACCEL</span>
                      <div className="flex-1 h-1.5 bg-background rounded-full overflow-hidden">
                        <div className="h-full bg-secondary" style={{ width: `${metrics.accel}%` }}></div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-mono text-muted w-8">BRAKE</span>
                      <div className="flex-1 h-1.5 bg-background rounded-full overflow-hidden">
                        <div className="h-full bg-danger" style={{ width: `${metrics.brake}%` }}></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Card 4: Scrolling Historical Charts */}
            <div className="bg-card border border-border rounded-xl p-6 lg:col-span-2 flex flex-col justify-between">
              <div className="text-xs font-mono font-bold text-gray-400 mb-4 uppercase tracking-wider">Real-time Telemetry Trend (60s)</div>
              <div className="flex-grow">
                <TelemetryChart data={chartHistory} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. Safety Parameter & Fault Injection View */}
      {activeView === 'config' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 w-full max-w-5xl mx-auto text-left">
          {/* Left Column: Safety Parameter Configuration */}
          <div className="bg-card border border-border rounded-xl p-6 flex flex-col justify-between">
            <div>
              <h2 className="text-base font-mono font-bold text-white mb-1 uppercase tracking-wider">ADAS Safety Parameters</h2>
              <p className="text-[10px] text-muted mb-4">Modify vehicle safety alarms and sync them to microcontroller registers.</p>

              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-background/40 border border-border rounded-lg p-3">
                    <label className="block text-[9px] font-mono text-muted uppercase mb-1">FCW Warning (cm)</label>
                    <input 
                      type="number" 
                      value={thresholds.fcwWarn}
                      onChange={(e) => setThresholds({...thresholds, fcwWarn: parseInt(e.target.value) || 0})}
                      className="w-full bg-card border border-border rounded px-2.5 py-1 text-xs text-white font-mono focus:outline-none"
                    />
                  </div>
                  <div className="bg-background/40 border border-border rounded-lg p-3">
                    <label className="block text-[9px] font-mono text-muted uppercase mb-1">FCW Critical (cm)</label>
                    <input 
                      type="number" 
                      value={thresholds.fcwCrit}
                      onChange={(e) => setThresholds({...thresholds, fcwCrit: parseInt(e.target.value) || 0})}
                      className="w-full bg-card border border-border rounded px-2.5 py-1 text-xs text-white font-mono focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-background/40 border border-border rounded-lg p-3">
                    <label className="block text-[9px] font-mono text-muted uppercase mb-1">BSD Alert Distance (cm)</label>
                    <input 
                      type="number" 
                      value={thresholds.bsdDist}
                      onChange={(e) => setThresholds({...thresholds, bsdDist: parseInt(e.target.value) || 0})}
                      className="w-full bg-card border border-border rounded px-2.5 py-1 text-xs text-white font-mono focus:outline-none"
                    />
                  </div>
                  <div className="bg-background/40 border border-border rounded-lg p-3">
                    <label className="block text-[9px] font-mono text-muted uppercase mb-1">Overspeed Limit (km/h)</label>
                    <input 
                      type="number" 
                      value={thresholds.overspeed}
                      onChange={(e) => setThresholds({...thresholds, overspeed: parseInt(e.target.value) || 0})}
                      className="w-full bg-card border border-border rounded px-2.5 py-1 text-xs text-white font-mono focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-background/40 border border-border rounded-lg p-3">
                    <label className="block text-[9px] font-mono text-muted uppercase mb-1">TTC Warning (s)</label>
                    <input 
                      type="number" 
                      step="0.1"
                      value={thresholds.ttcWarn}
                      onChange={(e) => setThresholds({...thresholds, ttcWarn: parseFloat(e.target.value) || 0})}
                      className="w-full bg-card border border-border rounded px-2.5 py-1 text-xs text-white font-mono focus:outline-none"
                    />
                  </div>
                  <div className="bg-background/40 border border-border rounded-lg p-3">
                    <label className="block text-[9px] font-mono text-muted uppercase mb-1">TTC Critical (s)</label>
                    <input 
                      type="number" 
                      step="0.1"
                      value={thresholds.ttcCrit}
                      onChange={(e) => setThresholds({...thresholds, ttcCrit: parseFloat(e.target.value) || 0})}
                      className="w-full bg-card border border-border rounded px-2.5 py-1 text-xs text-white font-mono focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-2 justify-end mt-4 border-t border-border/20 pt-4">
              <button 
                onClick={() => {
                  setThresholds({
                    fcwWarn: 50,
                    fcwCrit: 20,
                    bsdDist: 30,
                    overspeed: 120,
                    ttcWarn: 3.0,
                    ttcCrit: 1.5
                  });
                  if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ event: 'cli_command', data: 'config reset' }));
                  }
                  setTerminalLogs(prev => [...prev, '[CONFIG] Restored factory default thresholds to Flash NVM.']);
                }}
                className="bg-card border border-border text-gray-300 text-[10px] font-bold font-mono uppercase px-4 py-2 rounded hover:bg-border/40 transition-colors"
              >
                Reset Default
              </button>
              <button 
                onClick={handleApplyLimits}
                className="bg-primary text-background text-[10px] font-extrabold font-mono uppercase px-4 py-2 rounded hover:bg-primary/95 transition-colors"
              >
                Sync Registers
              </button>
            </div>
          </div>

          {/* Right Column: Virtual Fault Injection Console */}
          <div className="bg-card border border-border rounded-xl p-6 flex flex-col justify-between">
            <div>
              <h2 className="text-base font-mono font-bold text-white mb-1 uppercase tracking-wider">Fault Injection Console</h2>
              <p className="text-[10px] text-muted mb-4">Simulate hardware anomalies, sensor failures, and trigger critical overrides.</p>

              <div className="flex flex-col gap-4">
                {/* Fault Buttons Grid */}
                <div className="grid grid-cols-2 gap-3">
                  <button 
                    onClick={() => handleInjectFault('motor')}
                    className="flex flex-col items-center justify-center p-3 bg-danger/15 border border-danger/30 rounded-lg hover:bg-danger/25 text-danger transition-all cursor-pointer"
                  >
                    <span className="text-xs font-bold font-mono uppercase">Inject Overheat</span>
                    <span className="text-[8px] opacity-75 font-mono mt-0.5">Force Motor Temp 95°C</span>
                  </button>

                  <button 
                    onClick={() => handleInjectFault('soc')}
                    className="flex flex-col items-center justify-center p-3 bg-danger/15 border border-danger/30 rounded-lg hover:bg-danger/25 text-danger transition-all cursor-pointer"
                  >
                    <span className="text-xs font-bold font-mono uppercase">Inject Low SOC</span>
                    <span className="text-[8px] opacity-75 font-mono mt-0.5">Force Battery SOC 1%</span>
                  </button>
                  
                  <button 
                    onClick={() => handleInjectFault('col')}
                    className="flex flex-col items-center justify-center p-3 bg-danger/15 border border-danger/30 rounded-lg hover:bg-danger/25 text-danger transition-all cursor-pointer"
                  >
                    <span className="text-xs font-bold font-mono uppercase">Inject Collision</span>
                    <span className="text-[8px] opacity-75 font-mono mt-0.5">Trigger Critical Warn</span>
                  </button>

                  <button 
                    onClick={handleClearFaults}
                    className="flex flex-col items-center justify-center p-3 bg-primary/15 border border-primary/30 rounded-lg hover:bg-primary/25 text-primary transition-all font-bold cursor-pointer"
                  >
                    <span className="text-xs font-bold font-mono uppercase">Clear System Faults</span>
                    <span className="text-[8px] opacity-75 font-mono mt-0.5">Restore normal states</span>
                  </button>
                </div>

                {/* DTC Diagnostic Actions */}
                <div className="grid grid-cols-2 gap-3 mt-1">
                  <button
                    onClick={handleReadDTCs}
                    className="flex flex-col items-center justify-center p-2.5 bg-secondary/15 border border-secondary/30 rounded-lg hover:bg-secondary/25 text-secondary transition-all font-bold cursor-pointer"
                  >
                    <span className="text-xs font-bold font-mono uppercase">Read DTC Logs</span>
                    <span className="text-[8px] opacity-75 font-mono mt-0.5">Dump Freeze Frames</span>
                  </button>
                  <button
                    onClick={handleClearDTCs}
                    className="flex flex-col items-center justify-center p-2.5 bg-card border border-border rounded-lg hover:bg-border/40 text-gray-300 transition-all font-bold cursor-pointer"
                  >
                    <span className="text-xs font-bold font-mono uppercase">Clear DTC Memory</span>
                    <span className="text-[8px] opacity-75 font-mono mt-0.5">Wipe Fault Registry</span>
                  </button>
                </div>

                {/* Drive Mode Quick Switcher */}
                <div className="bg-background/40 border border-border rounded-lg p-3 mt-1 flex flex-col gap-2">
                  <div className="flex justify-between items-center text-[10px] font-mono text-muted uppercase">
                    <span>Drive Mode Switcher</span>
                    <span className="text-primary font-bold">{metrics.driveMode}</span>
                  </div>
                  <div className="flex gap-2">
                    {['ECO', 'NORMAL', 'SPORT'].map((m) => {
                      const isActive = (metrics.driveMode || '').toUpperCase() === m
                      return (
                        <button
                          key={m}
                          onClick={() => handleSetDriveMode(m)}
                          className={`flex-1 py-1.5 px-2 rounded text-[10px] font-mono font-bold transition-all cursor-pointer ${
                            isActive
                              ? 'bg-primary text-background'
                              : 'bg-card border border-border text-gray-300 hover:bg-border/40'
                          }`}
                        >
                          {m}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Sensor Distance Override */}
                <div className="bg-background/40 border border-border rounded-lg p-3.5 mt-1 flex flex-col gap-2">
                  <div className="flex justify-between items-center text-[10px] font-mono text-muted uppercase">
                    <span>Front Distance Override</span>
                    <span className="text-secondary font-bold">
                      {metrics.frontDist < 400 ? `${metrics.frontDist} cm` : 'OFF'}
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <input 
                      type="range" 
                      min="10" 
                      max="400" 
                      value={metrics.frontDist}
                      onChange={(e) => handleObstacleOverride(parseInt(e.target.value))}
                      className="flex-1 accent-secondary bg-card h-1.5 rounded-lg appearance-none cursor-pointer border border-border"
                    />
                    
                    <button 
                      onClick={handleObstacleClear}
                      className="bg-card border border-border text-[9px] font-mono uppercase px-2 py-1 rounded text-gray-300 hover:bg-border/40 transition-all cursor-pointer"
                    >
                      Disable
                    </button>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Disclaimer */}
            <div className="p-3 bg-warning/10 border border-warning/20 rounded-lg text-warning text-[9px] font-mono mt-4">
              WARNING: Injecting virtual anomalies triggers the safety fail-safe mechanism, forcing the vehicle controller into the EMERGENCY SAFE state.
            </div>
          </div>
        </div>
      )}

      {/* 4. Packet Inspector / CLI Console View */}
      {activeView === 'inspector' && (
        <div className="bg-card border border-border rounded-xl p-6 w-full max-w-7xl mx-auto flex flex-col gap-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2">
            <div>
              <h2 className="text-lg font-mono font-bold text-white mb-1 uppercase tracking-wider">Serial Link & Diagnostic Inspector</h2>
              <p className="text-xs text-muted">Real-time UART frame telemetry, interactive diagnostic console, and DTC freeze-frame memory.</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono bg-background border border-border px-3 py-1 rounded text-primary">
                DTCs: {dtcRecords.length} RECORDED
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Column 1: Raw Framed Telemetry Stream */}
            <div className="flex flex-col gap-2">
              <div className="flex justify-between items-center">
                <label className="block text-[10px] font-mono text-muted uppercase">1. Raw Telemetry Stream</label>
                <span className="text-[9px] font-mono text-gray-400">{messages.length} pkts</span>
              </div>
              <div className="bg-background border border-border rounded-lg p-3 font-mono text-[11px] h-96 overflow-y-auto flex flex-col gap-1 text-secondary">
                {messages.length === 0 ? (
                  <div className="text-muted text-center py-28 uppercase tracking-widest text-[10px]">No packets incoming. Connect uvicorn_server.</div>
                ) : (
                  messages.map((m, idx) => (
                    <div key={idx} className="border-b border-border/10 py-1 font-mono text-left break-all">
                      {m}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Column 2: Diagnostic CLI Shell */}
            <div className="flex flex-col gap-2">
              <div className="flex justify-between items-center">
                <label className="block text-[10px] font-mono text-muted uppercase">2. Diagnostic CLI Shell</label>
                <span className="text-[9px] font-mono text-emerald-400">ONLINE</span>
              </div>
              <div className="bg-background border border-border rounded-lg p-3 font-mono text-xs h-96 flex flex-col justify-between">
                <div className="h-[300px] overflow-y-auto flex flex-col gap-1 text-left text-gray-300 min-h-0">
                  {terminalLogs.map((log, idx) => (
                    <div key={idx} className={`leading-relaxed ${log.startsWith('[EVENT]') ? 'text-warning font-semibold' : log.startsWith('[DTC]') || log.startsWith('=====') ? 'text-secondary font-bold' : log.startsWith('>') ? 'text-primary' : 'text-gray-300'}`}>
                      {log}
                    </div>
                  ))}
                  <div ref={terminalEndRef} />
                </div>
                
                <div className="flex gap-1.5 mt-2 pt-2 border-t border-border/40">
                  <input
                    type="text"
                    placeholder="Enter command (e.g. dtc read, status)..."
                    value={terminalInput}
                    onChange={(e) => setTerminalInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && executeCommand(terminalInput)}
                    className="flex-1 bg-card border border-border rounded px-2.5 py-1.5 text-white font-mono text-xs focus:outline-none"
                  />
                  <button 
                    onClick={() => executeCommand(terminalInput)}
                    className="bg-primary/20 border border-primary/30 text-primary px-3 rounded hover:bg-primary/30 transition-colors text-xs font-mono font-bold cursor-pointer"
                  >
                    Send
                  </button>
                </div>
              </div>
            </div>

            {/* Column 3: Diagnostic Trouble Codes (DTC) Registry */}
            <div className="flex flex-col gap-2">
              <div className="flex justify-between items-center">
                <label className="block text-[10px] font-mono text-muted uppercase">3. DTC Trouble Codes & Freeze Frames</label>
                <div className="flex gap-1.5">
                  <button
                    onClick={handleReadDTCs}
                    className="bg-secondary/20 hover:bg-secondary/30 text-secondary border border-secondary/40 text-[9px] font-mono font-bold px-2 py-0.5 rounded cursor-pointer transition-all"
                  >
                    Query
                  </button>
                  <button
                    onClick={handleClearDTCs}
                    className="bg-card hover:bg-border/40 text-gray-400 border border-border text-[9px] font-mono font-bold px-2 py-0.5 rounded cursor-pointer transition-all"
                  >
                    Clear
                  </button>
                </div>
              </div>
              <div className="bg-background border border-border rounded-lg p-3 font-mono text-xs h-96 overflow-y-auto flex flex-col gap-2.5">
                {dtcRecords.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-4">
                    <ShieldCheck size={36} className="text-primary/60 mb-2" />
                    <div className="text-xs font-bold text-gray-300 uppercase tracking-wider">No Stored DTCs</div>
                    <div className="text-[10px] text-muted mt-1 max-w-[200px]">All ECU systems nominal. Click "Query" or run "dtc read" to refresh.</div>
                  </div>
                ) : (
                  dtcRecords.map((rec, idx) => (
                    <div key={idx} className="bg-card border border-border rounded-lg p-3 flex flex-col gap-2 shadow-sm text-left">
                      <div className="flex justify-between items-start">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-extrabold text-danger bg-danger/15 border border-danger/30 px-2 py-0.5 rounded">
                            {rec.code}
                          </span>
                          <span className="text-[10px] text-gray-400 font-mono">({rec.hex})</span>
                        </div>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${
                          rec.state === 'ACTIVE' 
                            ? 'bg-danger/20 text-danger border border-danger/40 animate-pulse' 
                            : 'bg-muted/20 text-gray-400'
                        }`}>
                          {rec.state}
                        </span>
                      </div>

                      <div className="text-[11px] text-white font-medium">{rec.desc}</div>

                      {/* Freeze Frame Snapshot Grid */}
                      <div className="grid grid-cols-3 gap-1.5 bg-background/60 border border-border/50 rounded p-2 text-center mt-1">
                        <div>
                          <div className="text-[8px] text-muted uppercase">Speed</div>
                          <div className="text-[11px] font-bold text-emerald-400">{rec.speed}</div>
                        </div>
                        <div>
                          <div className="text-[8px] text-muted uppercase">SOC</div>
                          <div className="text-[11px] font-bold text-primary">{rec.soc}</div>
                        </div>
                        <div>
                          <div className="text-[8px] text-muted uppercase">Temp</div>
                          <div className="text-[11px] font-bold text-warning">{rec.temp}</div>
                        </div>
                      </div>

                      <div className="text-[9px] text-muted flex justify-between items-center border-t border-border/30 pt-1.5 mt-0.5">
                        <span>Timestamp:</span>
                        <span className="text-gray-300">{rec.time}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}

export default App
