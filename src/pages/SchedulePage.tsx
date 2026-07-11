import { useEffect, useState } from "react"
import { PageContainer, PageHeader, SectionCard, EmptyState } from "@/components/layout"
import { useCurrentHome } from "@/modules/home"
import { getTaskInstances } from "@/modules/care"
import type { TaskInstanceWithDetails } from "@/modules/care"
import { cn } from "@/lib/utils"

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function getMonthDates(year: number, month: number): Date[] {
  const first = new Date(year, month, 1)
  const last = new Date(year, month + 1, 0)
  const dates: Date[] = []
  for (let d = new Date(first); d <= last; d.setDate(d.getDate() + 1)) {
    dates.push(new Date(d))
  }
  return dates
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

export default function SchedulePage() {
  const { home } = useCurrentHome()
  const [instances, setInstances] = useState<TaskInstanceWithDetails[]>([])
  const [loading, setLoading] = useState(true)
  const [viewDate, setViewDate] = useState(() => new Date())
  const viewYear = viewDate.getFullYear()
  const viewMonth = viewDate.getMonth()
  const homeId = home?.home_id

  useEffect(() => {
    if (!homeId) return
    let cancelled = false
    setLoading(true)
    const start = new Date(viewYear, viewMonth, 1)
    const end = new Date(viewYear, viewMonth + 1, 0)
    getTaskInstances(homeId, {
      status: ["scheduled", "snoozed"],
    }).then((result) => {
      if (cancelled) return
      setLoading(false)
      if (result.data) {
        const inRange = result.data.filter((t) => t.due_date >= formatDate(start) && t.due_date <= formatDate(end))
        setInstances(inRange)
      } else {
        setInstances([])
      }
    })
    return () => { cancelled = true }
  }, [homeId, viewYear, viewMonth])

  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const monthLabel = viewDate.toLocaleDateString(undefined, { month: "long", year: "numeric" })
  const dates = getMonthDates(year, month)
  const firstDay = dates[0].getDay()
  const padding = Array.from({ length: firstDay }, (_, i) => i)
  const byDate = instances.reduce<Record<string, TaskInstanceWithDetails[]>>((acc, t) => {
    (acc[t.due_date] ??= []).push(t)
    return acc
  }, {})

  const prevMonth = () => setViewDate((d) => new Date(d.getFullYear(), d.getMonth() - 1))
  const nextMonth = () => setViewDate((d) => new Date(d.getFullYear(), d.getMonth() + 1))

  return (
    <PageContainer>
      <PageHeader
        title="Schedule"
        subtitle="Tasks by due date"
        action={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={prevMonth}
              className="text-sm text-muted-foreground hover:text-foreground"
              aria-label="Previous month"
            >
              ←
            </button>
            <span className="text-sm font-medium min-w-[140px] text-center">{monthLabel}</span>
            <button
              type="button"
              onClick={nextMonth}
              className="text-sm text-muted-foreground hover:text-foreground"
              aria-label="Next month"
            >
              →
            </button>
          </div>
        }
      />
      {loading && <p className="text-muted-foreground">Loading...</p>}
      {!loading && (
        <SectionCard className="p-4">
          <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground mb-2">
            {WEEKDAYS.map((d) => (
              <div key={d}>{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {padding.map((i) => (
              <div key={`pad-${i}`} />
            ))}
            {dates.map((d) => {
              const key = formatDate(d)
              const tasks = byDate[key] ?? []
              const isToday = key === formatDate(new Date())
              return (
                <div
                  key={key}
                  className={cn(
                    "min-h-[80px] p-1 border rounded-lg",
                    isToday ? "border-primary bg-primary/5" : "border-border"
                  )}
                >
                  <span className="text-xs font-medium">{d.getDate()}</span>
                  <div className="mt-1 space-y-0.5">
                    {tasks.slice(0, 3).map((t) => (
                      <div
                        key={t.task_instance_id}
                        className="text-xs truncate rounded px-1 py-0.5 bg-muted"
                        title={(t.task_template as { title?: string })?.title}
                      >
                        {(t.task_template as { title?: string })?.title ?? "Task"}
                      </div>
                    ))}
                    {tasks.length > 3 && (
                      <span className="text-xs text-muted-foreground">+{tasks.length - 3} more</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </SectionCard>
      )}
      {!loading && instances.length === 0 && (
        <EmptyState
          title="No tasks this month"
          description="Add items and tasks to see them on the schedule."
        />
      )}
    </PageContainer>
  )
}
