import React, { useState, useEffect } from 'react'

function App() {
  const [status, setStatus] = useState('DISCONNECTED')
  const [messages, setMessages] = useState([])
  const [ws, setWs] = useState(null)
  const [payloadInput, setPayloadInput] = useState('')

  useEffect(() => {
    // Establish local connection to FastAPI WebSocket server
    const socket = new WebSocket('ws://localhost:8080/ws')

    socket.onopen = () => {
      setStatus('CONNECTED')
      console.log('Connected to Telemetry Bridge')
    }

    socket.onclose = () => {
      setStatus('DISCONNECTED')
      console.log('Disconnected from Telemetry Bridge')
    }

    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        setMessages((prev) => [msg, ...prev].slice(0, 50))
      } catch (err) {
        console.error('Error parsing WebSocket message:', err)
      }
    }

    setWs(socket)

    return () => {
      socket.close()
    }
  }, [])

  const sendMessage = () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      const payload = {
        event: 'test_command',
        data: payloadInput || 'Hello from React Dashboard!'
      }
      ws.send(JSON.stringify(payload))
      setPayloadInput('')
    }
  }

  return (
    <div className="min-h-screen bg-background text-gray-100 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-2xl bg-card border border-border rounded-xl p-8 shadow-2xl">
        <h1 className="text-3xl font-extrabold text-white mb-2 tracking-tight">
          EV ADAS NOC Dashboard <span className="text-primary text-sm font-mono px-2 py-1 bg-primary/10 rounded ml-2 border border-primary/20">V2.0-Alpha</span>
        </h1>
        <p className="text-muted text-sm mb-6">Phase 1: Project Environment & WebSocket Bridge Verification</p>
        
        {/* Status indicator */}
        <div className="flex items-center gap-4 mb-6 p-4 bg-background/50 rounded-lg border border-border">
          <div className="text-sm font-semibold">Bridge Connection Status:</div>
          <div className="flex items-center gap-2">
            <span className={`inline-block w-3 h-3 rounded-full ${status === 'CONNECTED' ? 'bg-primary animate-pulse' : 'bg-danger'}`}></span>
            <span className={`font-mono text-sm font-bold ${status === 'CONNECTED' ? 'text-primary' : 'text-danger'}`}>{status}</span>
          </div>
        </div>

        {/* Console send */}
        <div className="mb-8">
          <label className="block text-xs font-mono text-muted mb-2 uppercase tracking-wider">WebSocket Payload Sender</label>
          <div className="flex gap-2">
            <input 
              type="text" 
              className="flex-1 bg-background border border-border rounded px-4 py-2 text-white font-mono text-sm focus:outline-none focus:border-secondary transition-colors"
              placeholder="Enter message to send..." 
              value={payloadInput}
              onChange={(e) => setPayloadInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
            />
            <button 
              onClick={sendMessage}
              disabled={status !== 'CONNECTED'}
              className="bg-secondary hover:bg-secondary/90 disabled:bg-muted disabled:cursor-not-allowed text-white font-bold px-6 py-2 rounded transition-colors text-sm"
            >
              Send Frame
            </button>
          </div>
        </div>

        {/* Logger console */}
        <div>
          <label className="block text-xs font-mono text-muted mb-2 uppercase tracking-wider">WebSocket Message Log</label>
          <div className="bg-background/80 border border-border rounded-lg p-4 font-mono text-xs h-64 overflow-y-auto flex flex-col gap-2">
            {messages.length === 0 ? (
              <div className="text-muted text-center py-12">No packets received. Start bridge server and connect.</div>
            ) : (
              messages.map((m, idx) => (
                <div key={idx} className="p-2 bg-card/50 border border-border/30 rounded flex flex-col gap-1">
                  <div className="flex justify-between items-center text-[10px] text-muted">
                    <span>Event: {m.event}</span>
                    <span>Received Now</span>
                  </div>
                  <pre className="text-secondary whitespace-pre-wrap">{JSON.stringify(m.data, null, 2)}</pre>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
