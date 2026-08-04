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
  FileTextIcon,
  BellRingIcon,
  MessageCircleIcon,
  WrenchIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { markTaskInstanceDone, snoozeTaskInstance } from "@/modules/care"
import type { DashboardTask, MaintenanceTaskFull } from "@/lib/dashboard"
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

function formatTodayDate(): string {
  return new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  })
}

// ── Health Ring ─────────────────────────────────────────────────────────────

// ── Insight Scroll Strip ─────────────────────────────────────────────────────

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
    expiringWarranties,
    notices,
    cleaningGuides,
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

  // Calendar state
  const [calendarMonth, setCalendarMonth] = useState(() => new Date())
  const [selectedDay, setSelectedDay] = useState<string | null>(null)

  // The boot is "done" when Home shows real content rather than a skeleton —
  // that is the moment the user stops waiting, which is what we are measuring.
  useEffect(() => {
    if (!isLoading && stats) markBoot("content")
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
            upcoming={upcoming}
            itemsCount={stats?.totalItems ?? 0}
            cleaningGuides={cleaningGuides}
            level={level}
            homeId={homeId || null}
            completingId={completingId}
            onComplete={handleMarkComplete}
            onSnooze={handleSnooze}
          />
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
