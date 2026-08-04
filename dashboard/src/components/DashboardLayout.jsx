import React from 'react'
import { LayoutDashboard, History, Settings, Terminal, ShieldAlert } from 'lucide-react'

function DashboardLayout({ activeView, onViewChange, children, statusHeader }) {
  const menuItems = [
    { id: 'live', label: 'Live Diagnostics', icon: LayoutDashboard },
    { id: 'replay', label: 'Trip Replay', icon: History },
    { id: 'config', label: 'Safety Thresholds', icon: Settings },
    { id: 'inspector', label: 'Packet Inspector', icon: Terminal },
  ]

  return (
    <div className="flex h-screen bg-background text-gray-100 overflow-hidden font-sans">
      {/* Sidebar Navigation */}
      <aside className="w-64 bg-card border-r border-border flex flex-col justify-between shrink-0">
        <div>
          {/* Logo Brand Header */}
          <div className="px-6 py-6 border-b border-border flex items-center gap-3">
            <div className="bg-primary/10 border border-primary/30 p-2 rounded-lg text-primary">
              <ShieldAlert size={20} />
            </div>
            <div>
              <div className="font-extrabold text-white tracking-wide text-sm">EV ADAS</div>
              <div className="text-[10px] text-muted font-mono tracking-widest uppercase">NOC Console</div>
            </div>
          </div>

          {/* Menu Options */}
          <nav className="px-4 py-6 flex flex-col gap-1.5">
            {menuItems.map((item) => {
              const Icon = item.icon
              const isActive = activeView === item.id
              return (
                <button
                  key={item.id}
                  onClick={() => onViewChange(item.id)}
                  className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-lg text-xs font-mono font-bold tracking-wide transition-all uppercase ${
                    isActive
                      ? 'bg-primary/10 border border-primary/20 text-primary shadow-sm shadow-primary/5'
                      : 'text-gray-400 hover:text-white hover:bg-border/30 border border-transparent'
                  }`}
                >
                  <Icon size={16} />
                  <span>{item.label}</span>
                </button>
              )
            })}
          </nav>
        </div>

        {/* Footer Meta */}
        <div className="p-6 border-t border-border/60">
          <div className="text-[10px] font-mono text-muted text-center uppercase tracking-widest">
            HIL Platform V2.0
          </div>
        </div>
      </aside>

      {/* Main Workspace Frame */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Status Header Bar */}
        {statusHeader}

        {/* Dynamic Display Panel */}
        <main className="flex-1 overflow-y-auto bg-[#07080a] p-6">
          {children}
        </main>
      </div>
    </div>
  )
}

export default DashboardLayout
