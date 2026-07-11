import { useEffect, useState, useRef } from "react"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"

interface ManualParseProgressProps {
  isActive: boolean
  estimatedMs?: number
}

export function ManualParseProgress({
  isActive,
  estimatedMs = 28000,
}: ManualParseProgressProps) {
  const [elapsed, setElapsed] = useState(0)
  const [completed, setCompleted] = useState(false)
  const [shouldUnmount, setShouldUnmount] = useState(false)
  const [hasBeenActive, setHasBeenActive] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const completedAtRef = useRef<number | null>(null)
  const hasBeenActiveRef = useRef(false)

  useEffect(() => {
    if (isActive) {
      hasBeenActiveRef.current = true
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHasBeenActive(true)
      setElapsed(0)
      setCompleted(false)
      setShouldUnmount(false)
      completedAtRef.current = null

      intervalRef.current = setInterval(() => {
        setElapsed((prev) => prev + 200)
      }, 200)

      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current)
          intervalRef.current = null
        }
      }
    } else {
      if (!hasBeenActiveRef.current) return // never started — don't flash
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      setCompleted(true)
      completedAtRef.current = Date.now()
    }
  }, [isActive])

  useEffect(() => {
    if (!completed) return

    const timer = setTimeout(() => {
      setShouldUnmount(true)
    }, 1500)

    return () => clearTimeout(timer)
  }, [completed])

  if (!hasBeenActive || shouldUnmount) return null

  const raw = isActive
    ? 1 - Math.exp(-3.5 * elapsed / estimatedMs)
    : 1
  const pct = Math.min(completed ? 100 : 92, raw * 100)

  const countdownSec = Math.max(0, Math.ceil((estimatedMs - elapsed) / 1000))
  const countdownText = isActive
    ? elapsed >= estimatedMs
      ? "Almost done…"
      : `~${countdownSec} sec remaining`
    : "Done"

  return (
    <div className="mt-1.5 space-y-1">
      <Progress
        value={pct}
        className={cn(
          "h-1.5 transition-colors",
          completed && "bg-green-500/20 [&>div]:!bg-green-500"
        )}
      />
      <p className="text-xs text-muted-foreground">{countdownText}</p>
    </div>
  )
}
