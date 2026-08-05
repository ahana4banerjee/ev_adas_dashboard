import React from 'react'

function MetricGauge({ value, min, max, title, unit, color = '#10b981' }) {
  const clampedValue = Math.max(min, Math.min(max, value))
  const percentage = (clampedValue - min) / (max - min)

  // Sweeps a 270-degree arc from bottom-left to bottom-right
  const r = 70
  const c = 2 * Math.PI * r // 439.82
  const arcLength = (270 / 360) * c // 329.87
  const strokeDashoffset = arcLength - percentage * arcLength

  return (
    <div className="flex flex-col items-center justify-center p-4">
      <div className="relative w-40 h-40">
        <svg className="w-full h-full transform -rotate-225" viewBox="0 0 200 200">
          {/* Background track */}
          <circle
            cx="100"
            cy="100"
            r={r}
            fill="none"
            stroke="#1f2430"
            strokeWidth="10"
            strokeDasharray={`${arcLength} ${c}`}
            strokeLinecap="round"
          />
          {/* Glowing active dial sweep */}
          <circle
            cx="100"
            cy="100"
            r={r}
            fill="none"
            stroke={color}
            strokeWidth="10"
            strokeDasharray={`${arcLength} ${c}`}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            style={{
              filter: `drop-shadow(0 0 6px ${color})`,
              transition: 'stroke-dashoffset 0.15s ease-out'
            }}
          />
        </svg>
        {/* Centered digital value display */}
        <div className="absolute inset-0 flex flex-col justify-center items-center mt-2">
          <span className="text-3xl font-extrabold text-white tracking-tight">{value}</span>
          <span className="text-[10px] font-mono text-muted uppercase tracking-wider mt-0.5">{unit}</span>
        </div>
      </div>
      <div className="text-xs font-mono font-bold text-gray-400 mt-1.5 uppercase tracking-wider">
        {title}
      </div>
    </div>
  )
}

export default MetricGauge
