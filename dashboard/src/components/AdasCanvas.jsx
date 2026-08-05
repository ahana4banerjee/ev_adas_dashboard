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

      // Helper to draw a detailed bird's-eye view car vector
      const drawCar = (x, y, w, h, bodyColor, outlineColor, isBrakeActive) => {
        ctx.save()
        ctx.translate(x, y)

        // 1. Draw Wheels
        ctx.fillStyle = '#1e2430'
        const wheelW = w * 0.16
        const wheelH = h * 0.20
        // Front-left / Front-right wheels
        ctx.fillRect(-w / 2 - wheelW + 2, -h / 2 + h * 0.15, wheelW, wheelH)
        ctx.fillRect(w / 2 - 2, -h / 2 + h * 0.15, wheelW, wheelH)
        // Rear-left / Rear-right wheels
        ctx.fillRect(-w / 2 - wheelW + 2, h / 2 - h * 0.15 - wheelH, wheelW, wheelH)
        ctx.fillRect(w / 2 - 2, h / 2 - h * 0.15 - wheelH, wheelW, wheelH)

        // 2. Draw Side Mirrors
        ctx.fillStyle = bodyColor
        ctx.strokeStyle = outlineColor
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.roundRect(-w / 2 - 4, -h / 2 + h * 0.28, 5, 3, 1)
        ctx.roundRect(w / 2 - 1, -h / 2 + h * 0.28, 5, 3, 1)
        ctx.fill()
        ctx.stroke()

        // 3. Draw Aerodynamic Chassis Body
        ctx.fillStyle = bodyColor
        ctx.strokeStyle = outlineColor
        ctx.lineWidth = 2.5
        ctx.shadowColor = outlineColor
        ctx.shadowBlur = 8
        ctx.beginPath()
        ctx.moveTo(-w * 0.35, -h / 2)
        ctx.bezierCurveTo(-w * 0.45, -h * 0.4, -w * 0.5, -h * 0.2, -w * 0.5, 0)
        ctx.bezierCurveTo(-w * 0.5, h * 0.2, -w * 0.48, h * 0.4, -w * 0.4, h / 2)
        ctx.lineTo(w * 0.4, h / 2)
        ctx.bezierCurveTo(w * 0.48, h * 0.4, w * 0.5, h * 0.2, w * 0.5, 0)
        ctx.bezierCurveTo(w * 0.5, -h * 0.2, w * 0.45, -h * 0.4, w * 0.35, -h / 2)
        ctx.closePath()
        ctx.fill()
        ctx.stroke()
        ctx.shadowBlur = 0 // Reset glow

        // 4. Tinted Cabin Windows
        ctx.fillStyle = '#0f172a'
        ctx.strokeStyle = '#1e293b'
        ctx.lineWidth = 1
        // Front Windshield
        ctx.beginPath()
        ctx.moveTo(-w * 0.32, -h * 0.18)
        ctx.lineTo(w * 0.32, -h * 0.18)
        ctx.quadraticCurveTo(w * 0.35, -h * 0.08, w * 0.28, 0)
        ctx.lineTo(-w * 0.28, 0)
        ctx.quadraticCurveTo(-w * 0.35, -h * 0.08, -w * 0.32, -h * 0.18)
        ctx.fill()
        ctx.stroke()

        // Rear Windshield
        ctx.beginPath()
        ctx.moveTo(-w * 0.30, h * 0.20)
        ctx.lineTo(w * 0.30, h * 0.20)
        ctx.lineTo(w * 0.34, h * 0.36)
        ctx.lineTo(-w * 0.34, h * 0.36)
        ctx.closePath()
        ctx.fill()
        ctx.stroke()

        // Side Glass panels
        ctx.beginPath()
        ctx.moveTo(-w * 0.43, -h * 0.10)
        ctx.lineTo(-w * 0.41, h * 0.16)
        ctx.lineTo(-w * 0.34, h * 0.14)
        ctx.lineTo(-w * 0.34, -h * 0.08)
        ctx.closePath()
        ctx.fill()
        ctx.stroke()

        ctx.beginPath()
        ctx.moveTo(w * 0.43, -h * 0.10)
        ctx.lineTo(w * 0.41, h * 0.16)
        ctx.lineTo(w * 0.34, h * 0.14)
        ctx.lineTo(w * 0.34, -h * 0.08)
        ctx.closePath()
        ctx.fill()
        ctx.stroke()

        // 5. Headlights
        ctx.fillStyle = '#fef08a'
        ctx.fillRect(-w * 0.40, -h / 2 + 1, 5, 2.5)
        ctx.fillRect(w * 0.40 - 5, -h / 2 + 1, 5, 2.5)

        // 6. Taillights (Brakes)
        ctx.fillStyle = isBrakeActive ? '#f87171' : '#b91c1c'
        ctx.fillRect(-w * 0.36, h / 2 - 3, 6, 2.5)
        ctx.fillRect(w * 0.36 - 6, h / 2 - 3, 6, 2.5)

        // Hood Lines
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(-w * 0.12, -h / 2 + 4)
        ctx.lineTo(-w * 0.12, -h * 0.22)
        ctx.moveTo(w * 0.12, -h / 2 + 4)
        ctx.lineTo(w * 0.12, -h * 0.22)
        ctx.stroke()

        ctx.restore()
      }

      // 3. Draw Ego Vehicle (Center Position)
      drawCar(cx, cy, egoW, egoH, '#12141c', collisionWarn === 2 ? '#ef4444' : '#3b82f6', collisionWarn === 2)

      // 4. Draw Front Obstacle Vehicle (if inside 400cm zone)
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

        // Draw Obstacle Vehicle
        drawCar(cx, obstacleY, obsW, obsH, '#1e293b', collisionWarn === 2 ? '#ef4444' : '#f59e0b', false)

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
