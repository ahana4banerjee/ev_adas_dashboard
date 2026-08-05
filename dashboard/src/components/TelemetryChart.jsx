import React from 'react'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'

function TelemetryChart({ data }) {
  return (
    <div className="w-full h-64 bg-background/20 p-2 rounded-lg border border-border/40">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2430" />
          <XAxis
            dataKey="time"
            stroke="#6b7280"
            tick={{ fill: '#6b7280', fontSize: 10, fontFamily: 'monospace' }}
            tickLine={false}
          />
          {/* Left Y Axis for Speed */}
          <YAxis
            yAxisId="left"
            stroke="#10b981"
            tick={{ fill: '#10b981', fontSize: 10, fontFamily: 'monospace' }}
            tickLine={false}
            domain={[0, 'auto']}
          />
          {/* Right Y Axis for Temperature */}
          <YAxis
            yAxisId="right"
            orientation="right"
            stroke="#3b82f6"
            tick={{ fill: '#3b82f6', fontSize: 10, fontFamily: 'monospace' }}
            tickLine={false}
            domain={[0, 'auto']}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#12141c',
              borderColor: '#1f2430',
              borderRadius: '8px',
              color: '#f3f4f6',
              fontFamily: 'monospace',
              fontSize: '11px'
            }}
          />
          <Legend
            wrapperStyle={{
              fontSize: '10px',
              fontFamily: 'monospace',
              paddingTop: '8px'
            }}
          />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="speed"
            name="Speed (km/h)"
            stroke="#10b981"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="temp"
            name="Motor Temp (°C)"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export default TelemetryChart
