import React, { useRef, useEffect } from 'react'

function AdasCanvas({ frontDist, leftDist, rightDist, collisionWarn, bsdLeft, bsdRight, speed }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let animationFrameId

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      const cx = canvas.width / 2
      const cy = canvas.height * 0.75 // Placement of Ego vehicle
      const egoW = 38
      const egoH = 68

      // Draw road shoulders
      ctx.strokeStyle = '#161922'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(cx - 70, 0)
      ctx.lineTo(cx - 70, canvas.height)
      ctx.moveTo(cx + 70, 0)
      ctx.lineTo(cx + 70, canvas.height)
      ctx.stroke()

      // Animate road lane dividers based on speed
      const speedFactor = speed > 0 ? (Date.now() * speed * 0.0008) % 40 : 0
      ctx.strokeStyle = '#1f2430'
      ctx.setLineDash([15, 15])
      ctx.beginPath()
      ctx.moveTo(cx, -40 + speedFactor)
      ctx.lineTo(cx, canvas.height + 40)
      ctx.stroke()
      ctx.setLineDash([])

      // 1. Draw Front ADAS Sensor Radar Sector
      let frontConeColor = 'rgba(16, 185, 129, 0.04)' // Nominal Green
      let frontStrokeColor = 'rgba(16, 185, 129, 0.12)'
      if (collisionWarn === 1) {
        frontConeColor = 'rgba(245, 158, 11, 0.08)' // Warning Amber
        frontStrokeColor = 'rgba(245, 158, 11, 0.35)'
      } else if (collisionWarn === 2) {
        // Blinking alert effect
        const flash = Math.floor(Date.now() / 200) % 2 === 0
        frontConeColor = flash ? 'rgba(239, 68, 68, 0.22)' : 'rgba(239, 68, 68, 0.05)'
        frontStrokeColor = 'rgba(239, 68, 68, 0.7)'
      }

      ctx.fillStyle = frontConeColor
      ctx.strokeStyle = frontStrokeColor
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(cx, cy - egoH / 2)
      ctx.lineTo(cx - 90, 20)
      ctx.lineTo(cx + 90, 20)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()

      // 2. Draw BSD Zones
      // Left BSD Arc Zone
      const leftBsdColor = bsdLeft ? 'rgba(245, 158, 11, 0.25)' : 'rgba(31, 36, 48, 0.1)'
      const leftBsdBorder = bsdLeft ? '#f59e0b' : '#1f2430'
      ctx.fillStyle = leftBsdColor
      ctx.strokeStyle = leftBsdBorder
      ctx.beginPath()
      ctx.arc(cx - egoW / 2, cy, 45, Math.PI * 0.85, Math.PI * 1.35)
      ctx.lineTo(cx - egoW / 2, cy)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()

      // Right BSD Arc Zone
      const rightBsdColor = bsdRight ? 'rgba(245, 158, 11, 0.25)' : 'rgba(31, 36, 48, 0.1)'
      const rightBsdBorder = bsdRight ? '#f59e0b' : '#1f2430'
      ctx.fillStyle = rightBsdColor
      ctx.strokeStyle = rightBsdBorder
      ctx.beginPath()
      ctx.arc(cx + egoW / 2, cy, 45, Math.PI * 1.65, Math.PI * 2.15)
      ctx.lineTo(cx + egoW / 2, cy)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()

      // 3. Draw Ego Vehicle (Center Box)
      ctx.fillStyle = '#12141c'
      ctx.strokeStyle = collisionWarn === 2 ? '#ef4444' : '#3b82f6'
      ctx.lineWidth = 3
      ctx.shadowColor = collisionWarn === 2 ? '#ef4444' : '#3b82f6'
      ctx.shadowBlur = 10
      ctx.beginPath()
      ctx.roundRect(cx - egoW / 2, cy - egoH / 2, egoW, egoH, 8)
      ctx.fill()
      ctx.stroke()
      ctx.shadowBlur = 0 // Reset glow shadow

      // Draw Brake lights (active red if critical collision alert is triggered)
      const brakeActive = collisionWarn === 2
      ctx.fillStyle = brakeActive ? '#ef4444' : '#450a0a'
      ctx.fillRect(cx - egoW / 2 + 2, cy + egoH / 2 - 4, 6, 3)
      ctx.fillRect(cx + egoW / 2 - 8, cy + egoH / 2 - 4, 6, 3)

      // 4. Draw Front Obstacle Vehicle (if inside the 400cm range)
      if (frontDist < 400) {
        // Interpolate distance: 0cm -> close (cy - 70), 400cm -> far (30)
        const minY = 30
        const maxY = cy - egoH / 2 - 35
        const ratio = Math.max(0, Math.min(1.0, frontDist / 400.0))
        const obstacleY = minY + (maxY - minY) * ratio

        const obsW = 34
        const obsH = 54

        // Draw warning vector line between vehicles
        ctx.strokeStyle = collisionWarn === 2 ? 'rgba(239, 68, 68, 0.45)' : 'rgba(245, 158, 11, 0.3)'
        ctx.lineWidth = 1.5
        ctx.setLineDash([4, 4])
        ctx.beginPath()
        ctx.moveTo(cx, cy - egoH / 2)
        ctx.lineTo(cx, obstacleY + obsH / 2)
        ctx.stroke()
        ctx.setLineDash([])

        // Draw Obstacle Vehicle Box
        ctx.fillStyle = '#1c1b1e'
        ctx.strokeStyle = collisionWarn === 2 ? '#ef4444' : '#f59e0b'
        ctx.lineWidth = 2
        ctx.shadowColor = collisionWarn === 2 ? '#ef4444' : '#f59e0b'
        ctx.shadowBlur = 8
        ctx.beginPath()
        ctx.roundRect(cx - obsW / 2, obstacleY - obsH / 2, obsW, obsH, 5)
        ctx.fill()
        ctx.stroke()
        ctx.shadowBlur = 0

        // Draw Distance Text next to target
        ctx.fillStyle = collisionWarn === 2 ? '#ef4444' : '#f59e0b'
        ctx.font = 'bold 10px monospace'
        ctx.fillText(`${frontDist} cm`, cx + obsW / 2 + 8, obstacleY + 3)
      }

      animationFrameId = requestAnimationFrame(render)
    }

    render()

    return () => {
      cancelAnimationFrame(animationFrameId)
    }
  }, [frontDist, leftDist, rightDist, collisionWarn, bsdLeft, bsdRight, speed])

  return (
    <div className="w-full h-full flex items-center justify-center relative">
      <canvas
        ref={canvasRef}
        width={320}
        height={320}
        className="bg-background/25 rounded-lg max-w-full max-h-full border border-border/20"
      />
    </div>
  )
}

export default AdasCanvas
