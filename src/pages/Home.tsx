import { useState, useCallback, useMemo, useEffect } from "react"
import { markBoot } from "@/lib/bootTiming"
import { Link } from "react-router-dom"
import {
  PlusIcon,
  PackageIcon,
  SparklesIcon,
  ClipboardListIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronRightIcon as ChevronSmall,
  ShieldAlertIcon,
  FileTextIcon,
  BellRingIcon,
  MessageCircleIcon,
  WrenchIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { markTaskInstanceDone, snoozeTaskInstance } from "@/modules/care"
import type { DashboardTask, MaintenanceTaskFull, InsightCard, ExpiringWarrantyItem, DashboardStats } from "@/lib/dashboard"
import { computeHealthScore } from "@/lib/dashboard"
import { useDashboard } from "@/lib/useDashboard"
import { shouldShowHomeSkeleton } from "@/lib/homeLoadingGate"
import { useFeatureTour } from "@/hooks/useFeatureTour"
import { useAuth } from "@/modules/auth"
import { useCurrentHome, useHomeProfile } from "@/modules/home"
import { useUserLevel } from "@/hooks/useUserLevel"
import { AskFirstHero } from "@/components/dashboard/AskFirstHero"
import { RefinedHome } from "@/components/home/RefinedHome"
import { DesktopHome } from "@/components/home/DesktopHome"
import { ProfileCompletionBanner } from "@/components/dashboard/ProfileCompletionBanner"
import { PushOptInNudge } from "@/components/dashboard/PushOptInNudge"
import { Skeleton } from "@/components/ui/skeleton"

import { WhatsNewBanner } from "@/components/dashboard/WhatsNewBanner"
import { LevelUnlockBanner } from "@/components/dashboard/LevelUnlockBanner"

// ── Helpers ─────────────────────────────────────────────────────────────────

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return "Good morning"
  if (h < 17) return "Good afternoon"
  return "Good evening"
}

function formatLocalDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function formatAgendaDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number)
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1)
  return dt.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })
}

function formatTodayDate(): string {
  return new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  })
}

// ── Health Ring ─────────────────────────────────────────────────────────────

function HealthRing({ score, animate }: { score: number; animate: boolean }) {
  const CIRC = 2 * Math.PI * 50
  const clamped = Math.max(0, Math.min(100, score))
  const offset = CIRC * (1 - clamped / 100)

  const ringColor =
    score >= 90 ? "#1B6B5A" :
    score >= 80 ? "#22c55e" :
    score >= 70 ? "#f59e0b" :
    score >= 55 ? "#fb923c" : "#ef4444"

  const statusLabel =
    score >= 90 ? "Excellent" :
    score >= 80 ? "Great"     :
    score >= 70 ? "Good"      :
    score >= 55 ? "Fair"      : "Needs attention"

  return (
    <div className="relative w-[120px] h-[120px] shrink-0">
      <svg viewBox="0 0 120 120" className="w-[120px] h-[120px] -rotate-90" aria-hidden>
        <circle cx="60" cy="60" r="50" fill="none" stroke="currentColor" strokeWidth="8.5"
          className="text-muted/50" />
        <circle
          cx="60" cy="60" r="50"
          fill="none"
          stroke={ringColor}
          strokeWidth="8.5"
          strokeLinecap="round"
          strokeDasharray={CIRC}
          strokeDashoffset={animate ? offset : CIRC}
          style={{
            transition: animate
              ? "stroke-dashoffset 1.1s cubic-bezier(0.22,1,0.36,1), stroke 0.5s ease"
              : "none",
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-[32px] leading-none text-foreground">{score}</span>
        <span className="text-[10px] font-semibold uppercase tracking-[0.07em] mt-1"
          style={{ color: ringColor }}>
          {statusLabel}
        </span>
      </div>
    </div>
  )
}

function HealthScoreCard({
  stats,
  essentialOverdueCount,
  animateRing,
}: {
  stats: DashboardStats
  essentialOverdueCount: number
  animateRing: boolean
}) {
  const score = computeHealthScore(stats, essentialOverdueCount)
  return (
    <div className="rounded-2xl bg-card border border-border/60 shadow-[0_4px_20px_rgba(0,0,0,0.08)] p-5 relative overflow-hidden">
      <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-primary/5 pointer-events-none" />
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground/60 mb-4">
        Home Health
      </p>
      <div className="flex items-center gap-5">
        <HealthRing score={score} animate={animateRing} />
        <div className="flex-1 space-y-2 min-w-0">
          <div className="flex items-center justify-between">
            <span className="text-[12px] text-muted-foreground">Essential overdue</span>
            <span className={cn("text-[13px] font-bold tabular-nums",
              essentialOverdueCount > 0 ? "text-destructive" : "text-foreground")}>
              {essentialOverdueCount}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[12px] text-muted-foreground">Due this week</span>
            <span className="text-[13px] font-bold tabular-nums text-foreground">{stats.dueSoonCount}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[12px] text-muted-foreground">Done this month</span>
            <span className="text-[13px] font-bold tabular-nums text-primary">{stats.completedThisMonth}</span>
          </div>
          <div className="h-1 bg-muted rounded-full overflow-hidden mt-1">
            <div
              className="h-full rounded-full transition-[width] duration-[1100ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
              style={{
                width: animateRing ? `${score}%` : "0%",
                background: score >= 90 ? "#1B6B5A" : score >= 70 ? "#f59e0b" : "#ef4444",
              }}
            />
          </div>
        </div>
      </div>

      {/* What to do next — turns the score from a number into an action */}
      <div className="mt-4 pt-3 border-t border-border/50">
        {essentialOverdueCount > 0 ? (
          <Link to="/maintenance" className="flex items-center justify-between gap-2 group">
            <span className="text-[12px] text-muted-foreground">
              <span className="font-semibold text-destructive">
                {essentialOverdueCount} essential {essentialOverdueCount === 1 ? "task is" : "tasks are"} overdue
              </span>{" "}
              — biggest drag on your score
            </span>
            <span className="text-[12px] font-semibold text-primary whitespace-nowrap group-hover:underline">
              Fix now →
            </span>
          </Link>
        ) : stats.dueSoonCount > 0 ? (
          <Link to="/maintenance" className="flex items-center justify-between gap-2 group">
            <span className="text-[12px] text-muted-foreground">
              Nothing overdue — {stats.dueSoonCount} {stats.dueSoonCount === 1 ? "task" : "tasks"} due this week
            </span>
            <span className="text-[12px] font-semibold text-primary whitespace-nowrap group-hover:underline">
              View →
            </span>
          </Link>
        ) : (
          <p className="text-[12px] text-muted-foreground">
            You&apos;re all caught up — nothing needs attention right now.
          </p>
        )}
      </div>
    </div>
  )
}

// ── Focus Task Row ───────────────────────────────────────────────────────────

function FocusTaskRow({
  task,
  completing,
  onComplete,
}: {
  task: DashboardTask
  completing: boolean
  onComplete: (id: string) => void
}) {
  const href = task.itemId ? `/inventory/${task.itemId}` : "/maintenance"
  const isEssential = task.priority === "critical"

  return (
    <div
      className={cn(
        "flex items-center py-3 pr-2 border-l-[3px] -ml-px",
        isEssential ? "border-l-red-500/70" : "border-l-primary/50",
        completing && "opacity-50 pointer-events-none"
      )}
    >
      <Link to={href} className="flex-1 pl-3 min-w-0 group">
        {task.itemName && (
          <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide truncate mb-0.5">
            {task.itemName}
          </div>
        )}
        <div className="text-[13.5px] font-medium text-foreground truncate group-hover:text-primary transition-colors">
          {task.name}
        </div>
        {task.isOverdue && task.daysOverdue != null && (
          <span className="text-[10px] font-bold uppercase tracking-wide text-destructive">
            {task.daysOverdue}d overdue
          </span>
        )}
      </Link>
      <button
        type="button"
        onClick={() => onComplete(task.id)}
        disabled={completing}
        className={cn(
          "w-7 h-7 rounded-full border-2 flex items-center justify-center shrink-0 ml-3",
          "transition-all duration-200 hover:scale-110 active:scale-95",
          isEssential
            ? "border-red-200 hover:border-red-400 hover:bg-red-50"
            : "border-border hover:border-primary hover:bg-primary/5"
        )}
        aria-label={`Mark ${task.name} complete`}
      >
        {completing && (
          <span className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />
        )}
      </button>
    </div>
  )
}

// ── Insight Scroll Strip ─────────────────────────────────────────────────────

const insightAccent: Record<InsightCard["variant"], string> = {
  red:   "border-t-red-500",
  amber: "border-t-amber-500",
  blue:  "border-t-blue-500",
  green: "border-t-primary",
}
const insightCatColor: Record<InsightCard["variant"], string> = {
  red:   "text-red-500",
  amber: "text-amber-500",
  blue:  "text-blue-500",
  green: "text-primary",
}

function InsightScrollStrip({ insights }: { insights: InsightCard[] }) {
  return (
    <div className="flex gap-2.5 overflow-x-auto pb-0.5 [&::-webkit-scrollbar]:hidden snap-x snap-mandatory -mx-4 px-4">
      {insights.map((card) => (
        <div
          key={card.id}
          className={cn(
            "shrink-0 w-[160px] bg-card rounded-xl px-3.5 py-3 border border-border/70",
            "border-t-[3px] shadow-sm snap-start",
            insightAccent[card.variant]
          )}
        >
          <p className={cn("text-[9px] font-bold uppercase tracking-[0.12em] mb-1.5", insightCatColor[card.variant])}>
            {card.category}
          </p>
          <p className="text-[12.5px] font-semibold text-foreground leading-snug mb-1">{card.title}</p>
          <p className="text-[11px] text-muted-foreground leading-relaxed">{card.body}</p>
        </div>
      ))}
    </div>
  )
}

// ── Calendar ────────────────────────────────────────────────────────────────

interface CalendarProps {
  tasks: MaintenanceTaskFull[]
  selectedDay: string | null
  onSelectDay: (day: string | null) => void
  month: Date
  onPrevMonth: () => void
  onNextMonth: () => void
}

function DashboardCalendar({ tasks, selectedDay, onSelectDay, month, onPrevMonth, onNextMonth }: CalendarProps) {
  const todayStr = useMemo(() => formatLocalDateStr(new Date()), [])

  // Only show essential (red dot) and recommended (teal dot) tasks
  const tasksByDay = useMemo(() => {
    const m = new Map<string, MaintenanceTaskFull[]>()
    for (const t of tasks) {
      if (!t.next_due_date) continue
      // Skip optional tasks on calendar
      if (t.priority === "medium" || t.priority === "low") continue
      const key = t.next_due_date
      const list = m.get(key) ?? []
      list.push(t)
      m.set(key, list)
    }
    return m
  }, [tasks])

  const cells = useMemo(() => {
    const firstOfMonth = new Date(month.getFullYear(), month.getMonth(), 1)
    const dayOfWeek = firstOfMonth.getDay()
    const mondayOffset = (dayOfWeek + 6) % 7
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
          <ChevronLeftIcon className="size-4" />
        </button>
        <span className="text-sm font-semibold text-foreground tracking-wide">{monthTitle}</span>
        <button
          type="button"
          onClick={onNextMonth}
          className="h-11 w-11 md:h-7 md:w-7 flex items-center justify-center rounded-md border border-border text-muted-foreground hover:border-primary hover:text-primary transition-colors"
          aria-label="Next month"
        >
          <ChevronRightIcon className="size-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-1">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((h) => (
          <div
            key={h}
            className="text-center text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 pb-1"
          >
            {h}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map(({ date, dayStr, isOutsideMonth }) => {
          const dayTasks = tasksByDay.get(dayStr) ?? []
          const selected = selectedDay ? dayStr === selectedDay : false
          const isToday = dayStr === todayStr

          return (
            <button
              key={dayStr}
              type="button"
              onClick={() => onSelectDay(selected ? null : dayStr)}
              className={cn(
                "relative text-left p-1 rounded-lg border border-transparent transition-colors aspect-square flex flex-col items-center justify-start pt-1.5",
                selected && "bg-foreground border-foreground",
                !selected && "hover:bg-muted/50",
                !selected && isOutsideMonth && "opacity-20 pointer-events-none"
              )}
              aria-label={`Select ${dayStr}`}
            >
              <span
                className={cn(
                  "text-[11px] font-medium block",
                  selected && "text-white",
                  !selected && isToday && "text-primary font-bold underline underline-offset-2",
                  !selected && !isToday && "text-muted-foreground"
                )}
              >
                {date.getDate()}
              </span>
              {dayTasks.length > 0 && (
                <div className="flex gap-0.5 mt-1">
                  {dayTasks.slice(0, 3).map((t) => (
                    <span
                      key={t.id}
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        selected
                          ? "bg-white/60"
                          : t.priority === "critical"
                            ? "bg-red-500"
                            : "bg-primary"
                      )}
                    />
                  ))}
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Agenda ──────────────────────────────────────────────────────────────────

function AgendaSection({
  title,
  tasks,
}: {
  title: string
  tasks: MaintenanceTaskFull[]
}) {
  // Group tasks by date
  const groups = useMemo(() => {
    const m = new Map<string, MaintenanceTaskFull[]>()
    for (const t of tasks) {
      if (!t.next_due_date) continue
      const list = m.get(t.next_due_date) ?? []
      list.push(t)
      m.set(t.next_due_date, list)
    }
    return Array.from(m.entries())
      .map(([dateStr, list]) => ({ dateStr, tasks: list }))
      .sort((a, b) => a.dateStr.localeCompare(b.dateStr))
  }, [tasks])

  if (groups.length === 0) return null

  return (
    <div className="rounded-2xl border border-border/50 bg-card/40 p-5">
      <h2 className="font-display text-sm font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
        {title}
      </h2>
      <div className="space-y-3">
        {groups.map((g) => (
          <div key={g.dateStr}>
            <div className="flex items-center gap-2 mb-1 mt-2 first:mt-0">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 whitespace-nowrap">
                {formatAgendaDate(g.dateStr)}
              </span>
              <div className="flex-1 h-px bg-border/50" />
            </div>
            {g.tasks.map((t) => (
              <Link
                key={t.id}
                to={t.item_id ? `/inventory/${t.item_id}` : "/home"}
                className="flex items-center gap-2 py-2 px-1 min-h-11 md:min-h-0 rounded-md hover:bg-muted/30 transition-colors group"
              >
                {t.itemName && (
                  <span className="text-xs font-medium text-muted-foreground shrink-0 w-20 truncate">
                    {t.itemName}
                  </span>
                )}
                <span className="text-sm text-foreground truncate flex-1">{t.title}</span>
                <ChevronSmall className="size-3.5 text-muted-foreground/25 group-hover:text-muted-foreground/50 transition-colors shrink-0" />
              </Link>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Warranty Alerts Card ───────────────────────────────────────────────────

function formatExpiryDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function warrantyUrgency(days: number): { tone: "red" | "amber" | "blue"; label: string } {
  if (days <= 0) return { tone: "red", label: "Expires today" }
  if (days === 1) return { tone: "red", label: "Expires tomorrow" }
  if (days <= 14) return { tone: "red", label: `${days} days left` }
  if (days <= 30) return { tone: "amber", label: `${days} days left` }
  return { tone: "blue", label: `${days} days left` }
}

function WarrantyAlertsCard({ warranties }: { warranties: ExpiringWarrantyItem[] }) {
  const [expanded, setExpanded] = useState(false)
  if (warranties.length === 0) return null
  const visible = expanded ? warranties : warranties.slice(0, 3)
  const hiddenCount = warranties.length - visible.length

  return (
    <div className="rounded-2xl border border-white/70 bg-white/55 backdrop-blur-sm shadow-sm p-5 border-l-[3px] border-l-amber-500">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-display text-base font-bold text-foreground flex items-center gap-2">
          <ShieldAlertIcon className="size-4 text-amber-600" aria-hidden />
          Warranty alerts
        </h2>
        <span className="text-xs text-muted-foreground font-medium">
          {warranties.length} expiring soon
        </span>
      </div>
      <ul className="space-y-1.5">
        {visible.map((w) => {
          const urgency = warrantyUrgency(w.days_remaining)
          const toneStyles = {
            red: "bg-red-50 text-red-700 border-red-100",
            amber: "bg-amber-50 text-amber-700 border-amber-100",
            blue: "bg-blue-50 text-blue-700 border-blue-100",
          }[urgency.tone]
          return (
            <li key={w.item_unit_id}>
              <Link
                to={`/inventory/${w.item_unit_id}`}
                className="flex items-center gap-3 px-3 py-2 rounded-lg border border-transparent hover:border-border hover:bg-white/70 transition-colors"
              >
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium text-foreground truncate">
                    {w.display_name}
                  </span>
                  <span className="block text-[11px] text-muted-foreground">
                    Expires {formatExpiryDate(w.warranty_expiry_date)}
                  </span>
                </span>
                <span
                  className={cn(
                    "shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full border",
                    toneStyles
                  )}
                >
                  {urgency.label}
                </span>
                <ChevronSmall className="size-4 text-muted-foreground/50 shrink-0" aria-hidden />
              </Link>
            </li>
          )
        })}
      </ul>
      {(hiddenCount > 0 || expanded) && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 text-xs font-medium text-primary hover:underline min-h-11 md:min-h-0 px-2 -mx-2 inline-flex items-center"
        >
          {hiddenCount > 0 ? `See all ${warranties.length} warranties` : "Show less"}
        </button>
      )}
    </div>
  )
}

// ── Empty state hero (zero-item users) ──────────────────────────────────────

function EmptyHomeHero() {
  return (
    <div className="rounded-2xl border border-white/70 bg-white/70 backdrop-blur-sm shadow-sm px-6 py-8 sm:px-10 sm:py-10 text-center">
      <div className="max-w-md mx-auto">
        <div className="flex justify-center mb-4">
          <span className="inline-flex items-center justify-center size-14 rounded-2xl bg-primary/10 text-primary">
            <PackageIcon className="size-7" />
          </span>
        </div>
        <h2 className="font-display text-2xl sm:text-3xl font-bold text-foreground mb-2 leading-tight">
          Let&apos;s set up your home
        </h2>
        <p className="text-[15px] sm:text-base text-muted-foreground mb-6 leading-relaxed">
          Add an appliance or fixture and upload its manual.
          Homehub turns it into reminders, warranty tracking, and answers to your questions.
        </p>
        <Link
          to="/inventory/add"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-primary text-primary-foreground font-semibold text-base hover:bg-primary/90 transition-colors shadow-sm"
        >
          <PlusIcon className="size-5" />
          Add your first item
        </Link>

        <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4 text-left">
          <div className="flex items-start gap-2.5">
            <FileTextIcon className="size-5 shrink-0 text-primary mt-0.5" />
            <div>
              <div className="text-sm font-semibold text-foreground">Parse manuals</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Upload a PDF and we extract the key info.
              </div>
            </div>
          </div>
          <div className="flex items-start gap-2.5">
            <BellRingIcon className="size-5 shrink-0 text-primary mt-0.5" />
            <div>
              <div className="text-sm font-semibold text-foreground">Get reminders</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Never miss a filter change or service.
              </div>
            </div>
          </div>
          <div className="flex items-start gap-2.5">
            <MessageCircleIcon className="size-5 shrink-0 text-primary mt-0.5" />
            <div>
              <div className="text-sm font-semibold text-foreground">Ask anything</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                "How do I reset the HVAC?" — we'll find it.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Skeleton ────────────────────────────────────────────────────────────────

function HomeSkeleton() {
  return (
    <div className="px-4 pt-4 space-y-5 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-44 rounded-lg" />
      </div>
      <Skeleton className="h-4 w-52" />
      <div className="grid grid-cols-3 gap-3">
        <Skeleton className="h-16 rounded-xl" />
        <Skeleton className="h-16 rounded-xl" />
        <Skeleton className="h-16 rounded-xl" />
      </div>
      <Skeleton className="h-64 rounded-2xl" />
      <Skeleton className="h-48 rounded-2xl" />
    </div>
  )
}

// ── Main Component ──────────────────────────────────────────────────────────

export default function Home() {
  const { user } = useAuth()
  const { home } = useCurrentHome()
  const { level, derivedLevel } = useUserLevel()
  const homeId = home?.home_id ?? ""

  const {
    tasks: dashTasks,
    stats,
    upcoming,
    insights,
    expiringWarranties,
    notices,
    cleaningGuides,
    homeUpkeep,
    isLoading,
    error: dashError,
    refresh,
  } = useDashboard(homeId || null)
  const { profile: homeProfile, error: profileError } = useHomeProfile(homeId || null)
  const askFirst = homeProfile?.preferred_mode === "ask_first"
  const profileIncomplete =
    !profileError && (homeProfile === null || homeProfile?.completed_at === null)
  useFeatureTour()
  const [completingId, setCompletingId] = useState<string | null>(null)
  /** Instances the user has just completed, hidden until the refetch catches up.
   *  Without this the card stayed on screen after a successful write, looking
   *  untouched, and people tapped Mark done a second time. */
  const [justCompleted, setJustCompleted] = useState<Set<string>>(new Set())
  const [animateRing, setAnimateRing] = useState(false)

  // Calendar state
  const [calendarMonth, setCalendarMonth] = useState(() => new Date())
  const [selectedDay, setSelectedDay] = useState<string | null>(null)

  // The boot is "done" when Home shows real content rather than a skeleton —
  // that is the moment the user stops waiting, which is what we are measuring.
  useEffect(() => {
    if (!isLoading && stats) markBoot("content")
  }, [isLoading, stats])

  // Trigger ring animation after data loads
  useEffect(() => {
    if (!isLoading && stats) {
      const t = setTimeout(() => setAnimateRing(true), 80)
      return () => clearTimeout(t)
    }
  }, [isLoading, stats])

  const handleMarkComplete = useCallback(
    async (taskId: string) => {
      if (!homeId) return
      setCompletingId(taskId)
      const result = await markTaskInstanceDone(homeId, taskId)
      if (!result.success) {
        // Leave it on screen — a task that failed to complete must not vanish.
        setCompletingId(null)
        return
      }
      // Hide it immediately, then wait for the refetch before releasing the
      // optimistic hide. Clearing `completingId` before `refresh()` resolved was
      // the bug: the row un-dimmed while still listed, so it read as "nothing
      // happened, tap again".
      setJustCompleted((s) => new Set(s).add(taskId))
      setAnimateRing(false)
      setCompletingId(null)
      await refresh()
      setJustCompleted((s) => {
        const next = new Set(s)
        next.delete(taskId)
        return next
      })
    },
    [homeId, refresh]
  )

  // Snooze pushes a recurring upkeep task's due date out 2 weeks (spec #7).
  const handleSnooze = useCallback(
    async (taskId: string) => {
      if (!homeId) return
      const snoozedUntil = addDays(formatLocalDateStr(new Date()), 14)
      const result = await snoozeTaskInstance(homeId, taskId, snoozedUntil)
      if (result.success) refresh()
    },
    [homeId, refresh]
  )

  // Derived data — must be computed before any early returns to keep hooks stable
  const todayStr = formatLocalDateStr(new Date())

  // Essential overdue tasks only (the stat that matters for health score)
  const notJustDone = useCallback(
    (t: { id: string }) => !justCompleted.has(t.id),
    [justCompleted],
  )
  const overdueEssential = (dashTasks?.overdueEssential ?? []).filter(notJustDone)
  // Due today: essential + recommended tasks due today that aren't already overdue
  const dueSoonAll = (dashTasks?.dueSoon ?? []).filter(notJustDone)
  const dueToday = useMemo(
    () => dueSoonAll.filter((t) => t.dueDate === todayStr && (t.priority === "critical" || t.priority === "high")),
    [dueSoonAll, todayStr]
  )
  const todayTasks = useMemo(() => [...overdueEssential, ...dueToday], [overdueEssential, dueToday])

  // Redesigned mobile Home (RefinedHome) feed: overdue + due-soon, deduped.
  const homeTasks = useMemo(() => {
    const seen = new Set<string>()
    const out: DashboardTask[] = []
    for (const t of [...(dashTasks?.overdue ?? []), ...(dashTasks?.dueSoon ?? [])]) {
      if (!seen.has(t.id) && notJustDone(t)) { seen.add(t.id); out.push(t) }
    }
    return out
  }, [dashTasks, notJustDone])

  // This week: upcoming essential + recommended, not today
  const thisWeekTasks = useMemo(
    () => upcoming.filter(
      (t) =>
        (t.priority === "critical" || t.priority === "high") &&
        t.next_due_date &&
        t.next_due_date > todayStr &&
        t.next_due_date <= addDays(todayStr, 7)
    ),
    [upcoming, todayStr]
  )

  // All calendar tasks (for dots): essential + recommended, include overdue
  const calendarTasks: MaintenanceTaskFull[] = useMemo(() => {
    const fromUpcoming = upcoming.filter(
      (t) => t.priority === "critical" || t.priority === "high"
    )
    const fromOverdue: MaintenanceTaskFull[] = overdueEssential.map((t) => ({
      id: t.id,
      title: t.name,
      description: null,
      task_template_id: "",
      notes: null,
      next_due_date: t.dueDate,
      is_recurring: false,
      frequency_value: null,
      frequency_unit: null,
      item_id: t.itemId,
      itemName: t.itemName,
      locationId: null,
      locationName: null,
      priority: t.priority,
      effort: t.effort,
      isOverdue: t.isOverdue,
      isDueSoon: t.isDueSoon,
      lastCompletedAt: null,
      completionCount: 0,
      careType: t.careType,
    }))
    const seen = new Set<string>()
    const combined: MaintenanceTaskFull[] = []
    for (const t of [...fromOverdue, ...fromUpcoming]) {
      if (!seen.has(t.id)) {
        seen.add(t.id)
        combined.push(t)
      }
    }
    return combined
  }, [upcoming, overdueEssential])

  // Skeleton ONLY when there is genuinely nothing to paint — see
  // shouldShowHomeSkeleton for why `isLoading` alone was the wrong gate.
  if (shouldShowHomeSkeleton(isLoading, !!stats)) return <HomeSkeleton />

  // Surface dashboard load failures explicitly. Without this, a failed fetch
  // falls through to `stats?.totalItems ?? 0 === 0` and renders the new-user
  // empty-state hero, which hides real RLS/auth regressions from users and
  // support. Profile errors are non-fatal (drive personalization, not core
  // data) so we log but don't block the page.
  if (dashError) {
    return (
      <div className="px-4 lg:px-8 py-8 max-w-xl mx-auto">
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-5">
          <h2 className="text-base font-semibold text-destructive mb-1">
            Couldn't load your home
          </h2>
          <p className="text-sm text-muted-foreground">
            {dashError instanceof Error ? dashError.message : "Unknown error loading dashboard."}
          </p>
          <button
            type="button"
            onClick={() => refresh()}
            className="mt-4 inline-flex items-center rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-accent min-h-11"
          >
            Try again
          </button>
        </div>
      </div>
    )
  }
  if (profileError) {
    console.error("[Home] home_profile fetch failed:", profileError.message)
  }

  const isNewUser = (stats?.totalItems ?? 0) === 0

  return (
    <div className="flex flex-col pb-8">
      {/* ── Mobile: Today strip (replaced by RefinedHome header on mobile) ── */}
      <div className="hidden px-4 pt-5 pb-2">
        <div className="flex items-baseline justify-between">
          <h1 className="font-display text-2xl font-bold text-foreground tracking-tight">
            {formatTodayDate()}
          </h1>
          <span className="text-sm text-muted-foreground">
            {todayTasks.length > 0
              ? `${todayTasks.length} today`
              : "All clear"}
          </span>
        </div>
        <div className="mt-1 h-px bg-border/60" />
      </div>

      {/* ── Desktop: Greeting bar — hidden; RefinedHome owns the header now ── */}
      <div className="hidden items-end justify-between px-8 pt-6 pb-2 max-w-5xl mx-auto w-full border-b border-border/50">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground/70 mb-1">
            {formatTodayDate()}
          </p>
          <h1 className="font-display text-[28px] leading-tight text-foreground font-bold">
            {getGreeting()}
          </h1>
        </div>
        {todayTasks.length > 0 && (
          <p className="text-sm text-muted-foreground pb-1">
            {todayTasks.length} task{todayTasks.length === 1 ? "" : "s"} today
          </p>
        )}
      </div>

      <div className="px-4 lg:px-8 max-w-5xl mx-auto w-full">
        {/* What's new banner */}
        {user?.id && <WhatsNewBanner userId={user.id} />}

        {/* Progressive-complexity: celebrate when the user grows into a new level */}
        <LevelUnlockBanner derivedLevel={derivedLevel} />

        {/* ── New-user empty state ── */}
        {isNewUser && (
          <div className="mt-2 mb-4">
            <EmptyHomeHero />
          </div>
        )}

        {!isNewUser && profileIncomplete && homeId && (
          <ProfileCompletionBanner homeId={homeId} />
        )}

        {/* Push opt-in nudge: self-gates on browser support + existing
            subscription + dismissal, so it's safe to always render when the
            user has a home. Only one opt-in banner shows at a time — if the
            profile banner is still visible, skip the push nudge to avoid
            stacking. */}
        {!isNewUser && !profileIncomplete && user?.id && homeId && (
          <PushOptInNudge userId={user.id} homeId={homeId} />
        )}

        {!isNewUser && askFirst && <AskFirstHero />}

        {!isNewUser && (
          <>
        {/* ── Redesigned Home — RefinedHome (mobile) · DesktopHome (lg+) ── */}
        <div className="lg:hidden -mx-4">
          <div className="mx-auto w-full max-w-[460px]">
            <RefinedHome
              tasks={homeTasks}
              upcoming={upcoming}
              itemsCount={stats?.totalItems ?? 0}
              warranties={expiringWarranties}
              cleaningGuides={cleaningGuides}
              level={level}
              homeId={homeId || null}
              completingId={completingId}
              onComplete={handleMarkComplete}
              onSnooze={handleSnooze}
            />
          </div>
        </div>
        {/* Break out of the page's max-w-5xl wrapper: DesktopHome owns its own
            centered 1180px content region (redesign spec). */}
        <div className="hidden lg:block">
          <DesktopHome
            tasks={homeTasks}
            warranties={expiringWarranties}
            notices={notices}
            cleaningGuides={cleaningGuides}
            homeUpkeep={homeUpkeep}
            level={level}
            homeId={homeId || null}
            completingId={completingId}
            onComplete={handleMarkComplete}
            onSnooze={handleSnooze}
          />
        </div>

        {/* ── Old two-column layout — hidden (replaced by DesktopHome) ── */}
        <div className="hidden">

          {/* LEFT: Calendar + Quick Actions (desktop), hidden on mobile */}
          <div className="hidden lg:block space-y-4">
            <div className="rounded-2xl border border-white/70 bg-white/55 backdrop-blur-sm shadow-sm p-5">
              <DashboardCalendar
                tasks={calendarTasks}
                selectedDay={selectedDay}
                onSelectDay={setSelectedDay}
                month={calendarMonth}
                onPrevMonth={() =>
                  setCalendarMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))
                }
                onNextMonth={() =>
                  setCalendarMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))
                }
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              {[
                { to: "/inventory/add", label: "Add Item", icon: PlusIcon },
                { to: "/inventory", label: "Inventory", icon: PackageIcon },
                { to: "/maintenance", label: "All Tasks", icon: ClipboardListIcon },
                { to: "/clean", label: "Deep Clean", icon: SparklesIcon },
              ]
              .filter((a) => level !== "essentials" || !["/maintenance", "/clean"].includes(a.to))
              .map(({ to, label, icon: Icon }) => (
                <Link
                  key={to}
                  to={to}
                  className="flex flex-col items-center gap-1.5 py-3.5 px-2 rounded-xl border border-border bg-card hover:border-foreground/20 hover:bg-accent/50 transition-colors text-center"
                >
                  <Icon className="size-[18px] text-muted-foreground" />
                  <span className="text-xs font-medium text-foreground">{label}</span>
                </Link>
              ))}
              {level !== "essentials" && (
              <Link
                to="/chat"
                className="col-span-2 flex items-center justify-center gap-2 py-3 px-2 rounded-xl border border-border bg-card hover:border-foreground/20 hover:bg-accent/50 transition-colors text-center"
              >
                <WrenchIcon className="size-[18px] text-primary" />
                <span className="text-xs font-semibold text-foreground">Fix a problem</span>
              </Link>
              )}
            </div>
          </div>

          {/* RIGHT: Health + Today + Agenda */}
          <div className="space-y-4">
            {/* Home Health Score */}
            {stats && (
              <HealthScoreCard
                stats={stats}
                essentialOverdueCount={overdueEssential.length}
                animateRing={animateRing}
              />
            )}

            {/* Warranty alerts */}
            <WarrantyAlertsCard warranties={expiringWarranties} />

            {/* Insights scroll strip */}
            {insights.length > 0 && (
              <InsightScrollStrip insights={insights} />
            )}

            {/* Today's tasks */}
            <div className="rounded-2xl border border-white/70 bg-white/55 backdrop-blur-sm shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-display text-base font-bold text-foreground">Today</h2>
                <span className="text-xs text-muted-foreground/70 font-medium">
                  {new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </span>
              </div>

              {todayTasks.length === 0 ? (
                <p className="text-sm text-muted-foreground py-3">
                  Nothing due today — you&apos;re all set.
                </p>
              ) : (
                <div className="pl-px">
                  {todayTasks.map((task) => (
                    <FocusTaskRow
                      key={task.id}
                      task={task}
                      completing={completingId === task.id}
                      onComplete={handleMarkComplete}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* This Week */}
            <AgendaSection title="This Week" tasks={thisWeekTasks} />
          </div>
        </div>

        {/* ── Mobile: Calendar — hidden; RefinedHome owns mobile ── */}
        <div className="hidden mt-4">
          <div className="rounded-2xl border border-white/70 bg-white/55 backdrop-blur-sm shadow-sm p-5">
            <DashboardCalendar
              tasks={calendarTasks}
              selectedDay={selectedDay}
              onSelectDay={setSelectedDay}
              month={calendarMonth}
              onPrevMonth={() =>
                setCalendarMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))
              }
              onNextMonth={() =>
                setCalendarMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))
              }
            />
          </div>
        </div>

        {/* ── Mobile: Quick Actions — hidden; RefinedHome owns mobile ── */}
        <div className="hidden mt-4">
          <div className="grid grid-cols-2 gap-2.5">
            {[
              { to: "/inventory/add", label: "Add Item", icon: PlusIcon },
              { to: "/inventory", label: "Inventory", icon: PackageIcon },
              { to: "/maintenance", label: "All Tasks", icon: ClipboardListIcon },
              { to: "/clean", label: "Deep Clean", icon: SparklesIcon },
            ]
              .filter((a) => level !== "essentials" || !["/maintenance", "/clean"].includes(a.to))
              .map(({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                className="flex flex-col items-center gap-1.5 py-3.5 px-2 rounded-xl border border-border bg-card hover:border-foreground/20 hover:bg-accent/50 transition-colors text-center"
              >
                <Icon className="size-[18px] text-muted-foreground" />
                <span className="text-xs font-medium text-foreground">{label}</span>
              </Link>
            ))}
            {level !== "essentials" && (
            <Link
              to="/troubleshoot"
              className="col-span-2 flex items-center justify-center gap-2 py-3 px-2 rounded-xl border border-border bg-card hover:border-foreground/20 hover:bg-accent/50 transition-colors text-center"
            >
              <WrenchIcon className="size-[18px] text-primary" />
              <span className="text-xs font-semibold text-foreground">Fix a problem</span>
            </Link>
            )}
          </div>
        </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Utility ─────────────────────────────────────────────────────────────────

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}
