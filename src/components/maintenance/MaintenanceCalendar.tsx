import { useEffect, useMemo, useRef } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"

import { cn } from "@/lib/utils"
import type { MaintenanceTaskFull } from "@/lib/dashboard"

interface MaintenanceCalendarProps {
  tasks: MaintenanceTaskFull[] // essential tasks with next_due_date only
  selectedDay: string | null // "YYYY-MM-DD"
  onSelectDay: (day: string | null) => void
  month: Date
  onPrevMonth: () => void
  onNextMonth: () => void
}

interface EssentialTaskAgendaProps {
  tasks: MaintenanceTaskFull[] // all essential tasks with next_due_date, sorted by date asc
  selectedDay: string | null
  onTaskClick: (t: MaintenanceTaskFull) => void
}

function pad2(n: number) {
  return String(n).padStart(2, "0")
}

function formatLocalDateStr(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function isSameLocalDate(a: string, b: string): boolean {
  return a === b
}

function formatAgendaDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number)
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1)
  return dt.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })
}

export function EssentialTaskAgenda({
  tasks,
  selectedDay,
  onTaskClick,
}: EssentialTaskAgendaProps) {
  const groups = useMemo(() => {
    const m = new Map<string, MaintenanceTaskFull[]>()
    for (const t of tasks) {
      if (!t.next_due_date) continue
      const key = t.next_due_date
      const list = m.get(key) ?? []
      list.push(t)
      m.set(key, list)
    }

    return Array.from(m.entries())
      .map(([dateStr, list]) => ({ dateStr, tasks: list }))
      .sort((a, b) => a.dateStr.localeCompare(b.dateStr))
  }, [tasks])

  const groupRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  useEffect(() => {
    if (!selectedDay) return
    const el = groupRefs.current.get(selectedDay)
    if (!el) return
    el.scrollIntoView({ behavior: "smooth", block: "nearest" })
  }, [selectedDay])

  return (
    <div className="overflow-y-auto max-h-[380px] space-y-3 pr-1 pt-0.5">
      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">No essential tasks scheduled.</p>
      ) : (
        groups.map((g) => (
          <div
            key={g.dateStr}
            ref={(el) => {
              if (!el) return
              groupRefs.current.set(g.dateStr, el)
            }}
          >
            <div
              className={cn(
                "flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide rounded-md px-2 py-1.5 mb-1 sticky top-0 z-10",
                selectedDay === g.dateStr ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
              )}
            >
              {formatAgendaDate(g.dateStr)}
              <span
                className={cn(
                  "text-[10px] font-medium rounded-full px-1.5 py-0",
                  selectedDay === g.dateStr
                    ? "bg-white/20 text-white"
                    : "bg-background text-muted-foreground",
                )}
              >
                {g.tasks.length}
              </span>
            </div>
            <div className="space-y-1">
              {g.tasks.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onTaskClick(t)}
                  className="w-full text-left flex items-center gap-2 py-1.5 px-1 rounded-md hover:bg-muted/40 border-l-2 border-transparent hover:border-primary transition-all group"
                >
                  {t.itemName && (
                    <span className="text-xs font-semibold text-primary shrink-0 w-24 truncate">
                      {t.itemName}
                    </span>
                  )}
                  <span className="text-sm text-foreground truncate flex-1">{t.title}</span>
                </button>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  )
}

export function MaintenanceCalendar({
  tasks,
  selectedDay,
  onSelectDay,
  month,
  onPrevMonth,
  onNextMonth,
}: MaintenanceCalendarProps) {
  const todayStr = useMemo(() => formatLocalDateStr(new Date()), [])
  const tasksByDay = useMemo(() => {
    const m = new Map<string, MaintenanceTaskFull[]>()
    for (const t of tasks) {
      if (!t.next_due_date) continue
      const key = t.next_due_date
      const list = m.get(key) ?? []
      list.push(t)
      m.set(key, list)
    }
    return m
  }, [tasks])

  const cells = useMemo(() => {
    const firstOfMonth = new Date(month.getFullYear(), month.getMonth(), 1)
    const dayOfWeek = firstOfMonth.getDay() // 0 Sun ... 6 Sat
    const mondayOffset = (dayOfWeek + 6) % 7 // Monday -> 0, ..., Sunday -> 6
    const start = new Date(firstOfMonth)
    start.setDate(firstOfMonth.getDate() - mondayOffset)

    const out: Array<{ date: Date; dayStr: string; isOutsideMonth: boolean }> = []
    for (let i = 0; i < 42; i++) {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      out.push({
        date: d,
        dayStr: formatLocalDateStr(d),
        isOutsideMonth: d.getMonth() !== month.getMonth(),
      })
    }
    return out
  }, [month])

  const monthTitle = month.toLocaleDateString(undefined, { month: "long", year: "numeric" })

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-3">
        <button
          type="button"
          onClick={onPrevMonth}
          className="h-11 w-11 md:h-7 md:w-7 flex items-center justify-center rounded-md border border-border text-muted-foreground hover:border-primary hover:text-primary transition-colors"
          aria-label="Previous month"
        >
          <ChevronLeft className="size-4" />
        </button>
        <span className="text-sm font-semibold text-foreground tracking-wide">{monthTitle}</span>
        <button
          type="button"
          onClick={onNextMonth}
          className="h-11 w-11 md:h-7 md:w-7 flex items-center justify-center rounded-md border border-border text-muted-foreground hover:border-primary hover:text-primary transition-colors"
          aria-label="Next month"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-2 text-xs text-muted-foreground font-medium">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((h) => (
          <div
            key={h}
            className="text-center text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 pb-2"
          >
            {h}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map(({ date, dayStr, isOutsideMonth }) => {
          const dayTasks = tasksByDay.get(dayStr) ?? []
          const selected = selectedDay ? isSameLocalDate(dayStr, selectedDay) : false
          const isToday = isSameLocalDate(dayStr, todayStr)

          return (
            <button
              key={dayStr}
              type="button"
              onClick={() => onSelectDay(selected ? null : dayStr)}
              className={cn(
                "relative text-left p-1.5 rounded-lg border border-transparent transition-colors min-h-[72px] overflow-hidden",
                selected && "bg-foreground border-foreground",
                !selected && "hover:bg-muted/50",
                !selected && isOutsideMonth && "opacity-25 pointer-events-none"
              )}
              aria-label={`Select ${dayStr}`}
            >
              <span
                className={cn(
                  "text-[11px] font-medium block mb-1",
                  selected && "text-white",
                  !selected && isToday && "text-primary font-bold underline underline-offset-2",
                  !selected && !isToday && "text-muted-foreground"
                )}
              >
                {date.getDate()}
              </span>

              {dayTasks.length > 0 && (
                <div className="mt-1 space-y-0.5 overflow-hidden">
                  {dayTasks.slice(0, 2).map((t) => (
                    <div key={t.id} className="flex items-center gap-0.5 min-w-0 mb-0.5">
                      <span
                        className={cn(
                          "h-1.5 w-1.5 rounded-full shrink-0",
                          selected ? "bg-white/70" : "bg-red-500"
                        )}
                      />
                      <span
                        className={cn(
                          "text-[10px] truncate leading-tight",
                          selected
                            ? "text-white/80"
                            : "text-red-800 dark:text-red-300"
                        )}
                        title={t.title}
                      >
                        {t.title}
                      </span>
                    </div>
                  ))}
                  {dayTasks.length > 2 && (
                    <span
                      className={cn(
                        "text-[10px] leading-tight mt-0.5 block",
                        selected ? "text-white/50" : "text-muted-foreground"
                      )}
                    >
                      +{dayTasks.length - 2} more
                    </span>
                  )}
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

