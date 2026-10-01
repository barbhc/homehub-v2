// ── Tasks redesign — shared helpers (mobile RefinedWeek + desktop DesktopTasks)
// Ported from the design handoff (tasks-redesign{,2,3}.jsx / tasks-desktop.jsx),
// rebuilt against the real WeekAgenda read model. The prototype's hardcoded
// "June 2026 / today = 24th" calendar and item→room mapping are replaced with
// real dates and the real room join. Calm tiers only (never red); overdue is a
// clay dot + the word "Overdue", never a full-orange line or "50d overdue".

import { useCallback, useEffect, useState } from "react"
import {
  getTaskDetail, markTaskInstanceDone, snoozeTaskInstance, type TaskDetail, type WeekAgendaItem,
} from "@/modules/care"
import type { Tier } from "@/lib/redesign/tokens"

// Group accent tones (calm tier palette — clay for overdue, never pure red).
export const CLAY = "var(--hh-clay)"
export const TEAL = "var(--hh-teal)"
export const SLATE = "var(--hh-slate)"

const TIER_RANK: Record<string, number> = { essential: 0, recommended: 1, optional: 2 }

export function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}
/** YYYY-MM-DD `days` ahead of `dateStr`. */
export function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T12:00:00")
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}
/** Signed whole-day delta from today (negative = overdue). */
export function daysUntil(dateStr: string): number {
  const a = new Date(todayStr() + "T00:00:00")
  const b = new Date(dateStr + "T00:00:00")
  return Math.round((b.getTime() - a.getTime()) / 86400000)
}

/**
 * The Tasks headline when there is nothing on the list — and where the work
 * went, when some was left off it on purpose.
 *
 * HH-82 / HH-94: item-scoped cleaning never reaches this feed (it lives in the
 * item's guides and in Deep Clean), so an empty list with cleaning scheduled is
 * not "nothing due". The phone and desktop pages each carried their own copy of
 * this line, and only the phone's ever learned the count; this is the one copy
 * both render, fed by the count useWeekAgenda carries with every agenda.
 *
 * Only for an EMPTY agenda. A list a filter has emptied is not "nothing on the
 * schedule" — its headline says how much the filter is hiding instead — and a
 * non-empty list states the count in HiddenCleaningLink, below its groups.
 */
export function nothingDueLine(hiddenCleaning: number): string {
  if (hiddenCleaning <= 0) return "Nothing due — enjoy the calm."
  return `Nothing on the schedule — ${hiddenCleaning} cleaning job${hiddenCleaning === 1 ? " lives" : "s live"} in your guides.`
}

// ── Check-off and snooze, for both trees ─────────────────────────────────────

/** What a row write answers — markTaskInstanceDone and snoozeTaskInstance both fit. */
type RowWrite = { success: boolean; error?: string }

/**
 * What a failed check-off or snooze says — Home's words (Home.tsx, #230), so a
 * task that won't complete reads the same on Home and on Tasks. The service's
 * own error is for the log, not the person.
 */
export const DONE_FAILED = "Couldn't mark this done. Check your connection and try again."
export const SNOOZE_FAILED = "Couldn't snooze this. Check your connection and try again."

/** completeTask's date refusals (firebase/functions/src/tasks/completedOn.ts)
 *  all open this way. They are written for the person and say what to check
 *  (this device's date, or a day too far back), so they are shown as sent. */
const DATE_REFUSAL = "Can't record this as done"

/**
 * What a failed check-off says on the task page and the item page: the
 * server's own date refusal as sent, and DONE_FAILED for anything else. Never
 * the service's raw error — that is for the log, which the caller writes with
 * its ids.
 */
export function doneFailedMessage(error: string | null | undefined): string {
  return typeof error === "string" && error.startsWith(DATE_REFUSAL) ? error : DONE_FAILED
}

/**
 * Done and Snooze for the agenda's rows: ONE implementation, which RefinedWeek
 * and DesktopTasks both call.
 *
 * Each tree used to carry its own copy. The phone's learned to report a failed
 * write; the desktop's kept reading only `res.success`, so a failed check-off
 * or snooze closed the row and said nothing. The task then sat there looking
 * untouched, which reads as "my tap didn't register" — and gets tapped again.
 *
 * A failure moves nothing: the task stays listed, and stays open if it was
 * open (it is genuinely not done), and `actionError` says why — `failedId`
 * says WHICH row, so a tree can put the words beside it (desktop does: its
 * header scrolls away above a long list). Only a write that SUCCEEDED closes
 * the row and takes the task off the shared agenda.
 */
export function useAgendaRowActions(homeId: string | null, removeTask: (taskInstanceId: string) => void) {
  const [openId, setOpenId] = useState<string | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [failure, setFailure] = useState<{ id: string; message: string } | null>(null)

  const run = useCallback(
    async (id: string, what: "done" | "snooze", write: () => Promise<RowWrite>) => {
      setPendingId(id)
      setFailure(null)
      let res: RowWrite
      try {
        res = await write()
      } catch (e) {
        // A write that throws failed like one that answered "no" — and is
        // logged and said the same way below, never swallowed.
        res = { success: false, error: e instanceof Error ? e.message : String(e) }
      }
      setPendingId(null)
      if (!res.success) {
        console.warn(`[tasks] could not ${what === "done" ? "mark task done" : "snooze task"} ${id} (home ${homeId}):`, res.error)
        setFailure({ id, message: what === "done" ? DONE_FAILED : SNOOZE_FAILED })
        return
      }
      setOpenId(null)
      removeTask(id)
    },
    [homeId, removeTask],
  )

  const onDone = useCallback(
    async (id: string) => {
      if (!homeId) return
      await run(id, "done", () => markTaskInstanceDone(homeId, id))
    },
    [homeId, run],
  )

  const onSnooze = useCallback(
    async (id: string) => {
      if (!homeId) return
      await run(id, "snooze", () => snoozeTaskInstance(homeId, id, addDays(todayStr(), 7)))
    },
    [homeId, run],
  )

  const toggle = useCallback((id: string) => setOpenId((cur) => (cur === id ? null : id)), [])

  return {
    /** The expanded row, if any. */
    openId,
    toggle,
    /** The row whose write is in flight — collapsed until it answers. */
    pendingId,
    /** Why the last Done/Snooze failed; cleared when the next one starts. */
    actionError: failure?.message ?? null,
    /** The row that last Done/Snooze failed on. */
    failedId: failure?.id ?? null,
    onDone,
    onSnooze,
  }
}

/**
 * Calm "when" label for a row's metadata line. Overdue collapses to the single
 * word "Overdue" (no alarming "50d overdue" precision); on-track rows get a
 * natural-language relative label.
 */
export function whenLabel(t: WeekAgendaItem): string {
  // Only a real deadline still says the word. Window-kind work carries its own
  // phrase ("Been a while") — see design/due-windows.md.
  if (t.trulyOverdue) return "Overdue"
  if (t.duePhrase) return t.duePhrase
  // Past-due but not a genuine lapse (never started, or non-essential cadence):
  // calm "Start anytime" instead of an alarming day count.
  if (t.pastDue) return "Start anytime"
  const n = daysUntil(t.dueDate)
  if (n <= 0) return "Today"
  if (n === 1) return "Tomorrow"
  if (n <= 7) return `In ${n} days`
  return new Date(t.dueDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

// ── Grouping ──────────────────────────────────────────────────────────────────

export type Lens = "urgency" | "room" | "item"
export type TaskGroup = { key: string; label: string; tone: string; items: WeekAgendaItem[]; mins: number }

/** Real room (from the item→room join), falling back to "Home" for home-scoped work. */
export function roomOf(t: WeekAgendaItem): string {
  return t.roomName ?? "Home"
}
/** Item label for the item filter / "Group by Item". Home-scoped tasks group
 *  under "Whole home" — a real address, not an apology like the old
 *  "not linked to an item" framing. This is where the removed Home-upkeep row's
 *  job now lives. */
export function itemOf(t: WeekAgendaItem): string {
  return t.itemName ?? t.roomName ?? "Whole home"
}

function sortRows(rows: WeekAgendaItem[]): WeekAgendaItem[] {
  return [...rows].sort(
    (a, b) =>
      daysUntil(a.dueDate) - daysUntil(b.dueDate) ||
      (TIER_RANK[a.priorityTier] ?? 2) - (TIER_RANK[b.priorityTier] ?? 2)
  )
}
function sumMins(rows: WeekAgendaItem[]): number {
  return rows.reduce((s, t) => s + (t.estimatedMinutes ?? 0), 0)
}

export function groupTasks(tasks: WeekAgendaItem[], lens: Lens): TaskGroup[] {
  if (lens === "urgency") {
    // Grouped by WHEN ACTING MAKES SENSE, not by calendar failure
    // (design/due-windows.md). "Deadlines" is the only bucket that keeps clay,
    // and it is usually empty — which is the point: red means something again.
    const isDeadline = (t: WeekAgendaItem) => t.dueKind === "deadline"
    const buckets: { key: string; label: string; tone: string; items: WeekAgendaItem[] }[] = [
      { key: "deadlines", label: "Deadlines", tone: CLAY, items: tasks.filter(isDeadline) },
      // Window hasn't opened yet — genuinely not yet, no pressure implied.
      {
        key: "coming", label: "Coming up", tone: SLATE,
        items: tasks.filter((t) => !isDeadline(t) && t.windowState === "upcoming"),
      },
      // CATCH-ALL, deliberately last and defined by exclusion: in-window,
      // lapsed, or carrying no window state at all. Filtering this bucket by
      // explicit states made the grouping non-total, and a task that matches no
      // bucket does not render — it silently disappears from the user's list.
      {
        key: "now", label: "Good to do now", tone: TEAL,
        items: tasks.filter((t) => !isDeadline(t) && t.windowState !== "upcoming"),
      },
    ]
    const ordered = [buckets[0], buckets[2], buckets[1]]
    return ordered
      .filter((g) => g.items.length > 0)
      .map((g) => ({ ...g, items: sortRows(g.items), mins: sumMins(g.items) }))
  }

  const keyOf = lens === "room" ? roomOf : itemOf
  const map = new Map<string, WeekAgendaItem[]>()
  for (const t of tasks) {
    const k = keyOf(t)
    const list = map.get(k) ?? []
    list.push(t)
    map.set(k, list)
  }
  const ranked = [...map.entries()].map(([label, items]) => ({
    group: { key: label, label, tone: items.some((t) => t.isOverdue) ? CLAY : TEAL, items: sortRows(items), mins: sumMins(items) } as TaskGroup,
    overdue: items.some((t) => t.isOverdue),
  }))
  ranked.sort((a, b) => Number(b.overdue) - Number(a.overdue) || b.group.items.length - a.group.items.length)
  return ranked.map((r) => r.group)
}

/** Distinct item labels present in the list, for the item filter. */
export function itemOptions(tasks: WeekAgendaItem[]): string[] {
  return [...new Set(tasks.map(itemOf))].sort((a, b) => a.localeCompare(b))
}

export function applyFilters(tasks: WeekAgendaItem[], tier: string, item: string): WeekAgendaItem[] {
  return tasks.filter((t) => (tier === "all" || t.priorityTier === tier) && (item === "all" || itemOf(t) === item))
}

// ── Fix A: calm-by-default surfacing ────────────────────────────────────────
// The task list defaults to a "Focus" view — essential work OR anything overdue
// (any tier) — so a long tail of optional/recommended tasks never makes the list
// feel overwhelming. "All" is always one tap away and shows the true total, so
// nothing feels hidden. Universal default (NOT level-keyed): volume calming
// protects everyone; power users get the one-tap escape hatch.

export type TierFilter = "focus" | "all" | "essential" | "recommended" | "optional"

/** True when a task belongs in the Focus view: essential OR overdue (any tier). */
export function isFocusTask(t: WeekAgendaItem): boolean {
  return t.priorityTier === "essential" || t.isOverdue
}

/**
 * The priority menu, in order, with the labels the user actually reads.
 *
 * "Focus" was renamed to "Needs you" after the owner said, plainly, that she
 * could not tell it apart from "All". The behaviour was never the problem —
 * essential-or-overdue is the right default — but a filter has to say what it
 * selects, and "Focus" said nothing. Everything else keeps the tier names used
 * across the rest of the app.
 */
export const TIER_FILTERS: { value: string; label: string; short: string; dot: string | null }[] = [
  // `short` is what the trigger shows; `label` is the full name in the menu,
  // where there is room for it.
  { value: "focus", label: "Needs you", short: "Needs you", dot: null },
  { value: "all", label: "All priorities", short: "All", dot: null },
  { value: "essential", label: "Essential", short: "Essential", dot: "var(--hh-clay)" },
  { value: "recommended", label: "Recommended", short: "Recommended", dot: "var(--hh-teal)" },
  { value: "optional", label: "Optional", short: "Optional", dot: "var(--hh-slate)" },
]

/** Counts for every option, computed over the UNFILTERED set so each choice
 *  states what it would yield before it is picked. */
export function tierFilterCounts(tasks: WeekAgendaItem[], item: string): Record<string, number> {
  const scoped = applyTierFilter(tasks, "all", item)
  return {
    focus: scoped.filter(isFocusTask).length,
    all: scoped.length,
    essential: scoped.filter((t) => t.priorityTier === "essential").length,
    recommended: scoped.filter((t) => t.priorityTier === "recommended").length,
    optional: scoped.filter((t) => t.priorityTier === "optional").length,
  }
}

/**
 * Tier + item filter. `tier` accepts a TierFilter; "focus" = essential OR overdue
 * (any tier), "all" = everything. Supersedes applyFilters for the task screens.
 */
export function applyTierFilter(tasks: WeekAgendaItem[], tier: string, item: string): WeekAgendaItem[] {
  return tasks.filter((t) => {
    const tierOk =
      tier === "all"
        ? true
        : tier === "focus"
          ? isFocusTask(t)
          : t.priorityTier === tier
    const itemOk = item === "all" || itemOf(t) === item
    return tierOk && itemOk
  })
}

const TIER_STORAGE_KEY = "homehub:tasks-tier"

/**
 * Tier-filter state that persists within a session but resets to "all" each
 * NEW session (sessionStorage is per-tab-session by design). Shared by mobile
 * RefinedWeek and desktop DesktopTasks so the behavior can't drift.
 *
 * The default WAS "focus" (essential-or-overdue). The owner questioned that
 * filter twice — first as "Focus", then, renamed, as "Needs you" — and the
 * second time the page was reporting "2 to do" while quietly hiding nine more.
 * A default that filters is a default that hides; grouping by Urgency already
 * puts what needs you first without pretending the rest doesn't exist.
 * "Needs you" stays in the menu as an opt-in lens.
 */
export function useTierFilter(): [string, (t: string) => void] {
  const [tier, setTierState] = useState<string>(() => {
    try {
      return sessionStorage.getItem(TIER_STORAGE_KEY) || "all"
    } catch {
      // Storage unavailable (private mode): start unfiltered, as a first visit does.
      return "all"
    }
  })
  const setTier = (t: string) => {
    try {
      sessionStorage.setItem(TIER_STORAGE_KEY, t)
    } catch {
      /* storage unavailable (private mode / SSR) — in-memory only */
    }
    setTierState(t)
  }
  return [tier, setTier]
}

// ── "Start here" insight ────────────────────────────────────────────────────

export type Insight = { kind: "start"; label: string; text: string; tone: string }

export function computeInsight(tasks: WeekAgendaItem[]): Insight | null {
  // Deadlines first — the only thing that is genuinely late.
  const deadlines = tasks.filter((t) => t.trulyOverdue).length
  if (deadlines > 0) {
    return {
      kind: "start",
      label: "Start here",
      tone: CLAY,
      text: `${deadlines} deadline${deadlines > 1 ? "s have" : " has"} passed.`,
    }
  }
  // Lapsed safety work earns firmness without the word "overdue": a skipped
  // detector check is worth saying plainly, and it is the one place a nudge is
  // honest (owner-approved, design/due-windows.md).
  const safety = tasks.filter((t) => t.safetyNote).length
  if (safety > 0) {
    return {
      kind: "start",
      label: "Worth doing",
      tone: CLAY,
      text: `${safety} safety check${safety > 1 ? "s have" : " has"} skipped a cycle.`,
    }
  }
  // Room clusters ("6 of your 11 tasks are in the Kitchen — worth one pass")
  // are deliberately NOT surfaced. The rule was true but not useful, and
  // because it was recomputed from the list on every visit the dismiss never
  // stuck — the same note greeted the owner every time (2026-09-08). A banner
  // has to change what you do next; a head-count by room does not.
  // Nothing worth saying. Say nothing: callers hide the banner entirely rather
  // than fill the top of the screen with a platitude.
  return null
}

// ── Real-date month calendar ──────────────────────────────────────────────────

export type CalendarCell = { day: number; tiers: Tier[] } | null
export type MonthCalendar = {
  monthLabel: string
  todayDate: number
  cells: CalendarCell[]
}

/** Builds the current month's grid with tier-colored dots for due (non-overdue) tasks. */
export function monthCalendar(tasks: WeekAgendaItem[], now: Date = new Date()): MonthCalendar {
  const year = now.getFullYear()
  const month = now.getMonth()
  const first = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const dots = new Map<number, Tier[]>()
  for (const t of tasks) {
    if (t.isOverdue || t.pastDue) continue
    const d = new Date(t.dueDate + "T00:00:00")
    if (d.getFullYear() === year && d.getMonth() === month) {
      const k = d.getDate()
      const arr = dots.get(k) ?? []
      arr.push(t.priorityTier as Tier)
      dots.set(k, arr)
    }
  }

  const cells: CalendarCell[] = []
  for (let i = 0; i < first; i++) cells.push(null)
  for (let n = 1; n <= daysInMonth; n++) cells.push({ day: n, tiers: dots.get(n) ?? [] })

  return {
    monthLabel: now.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
    todayDate: now.getDate(),
    cells,
  }
}

/** Tasks due on a given day-of-(current)-month. */
export function tasksDueOnDay(tasks: WeekAgendaItem[], day: number, now: Date = new Date()): WeekAgendaItem[] {
  const year = now.getFullYear()
  const month = now.getMonth()
  return tasks.filter((t) => {
    if (t.isOverdue || t.pastDue) return false
    const d = new Date(t.dueDate + "T00:00:00")
    return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day
  })
}

/** "June 24"-style label for a selected day-of-current-month. */
export function dayLabel(day: number, now: Date = new Date()): string {
  return new Date(now.getFullYear(), now.getMonth(), day).toLocaleDateString("en-US", { month: "long", day: "numeric" })
}

// ── Lazy task detail (why / notes) for the expandable row ──────────────────────
// Real task_template data exposes `justification` (why-it-matters) and
// `notes`/instructions_override, but NOT a structured supplies list or numbered
// steps — so the expanded row shows what's real and links to the full guide
// rather than inventing supplies/steps.

export function useTaskDetail(homeId: string | null, taskInstanceId: string | null, enabled: boolean, attempt = 0) {
  // One state object keyed by what was asked for: a stale answer for another
  // task never shows, and `loading` is derived rather than set — no setState
  // in the effect body. A failed read lands in `error` (Home's open row shows
  // it with a retry via `attempt`) instead of a spinner that never ends.
  const key = enabled && homeId && taskInstanceId ? `${homeId}|${taskInstanceId}|${attempt}` : null
  const [answer, setAnswer] = useState<{ key: string; detail: TaskDetail | null; error: string | null } | null>(null)
  useEffect(() => {
    if (!key || !homeId || !taskInstanceId) return
    let cancelled = false
    getTaskDetail(homeId, taskInstanceId)
      .then((res) => {
        if (cancelled) return
        setAnswer({ key, detail: res.data ?? null, error: res.error ? res.error.message : null })
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setAnswer({ key, detail: null, error: e instanceof Error ? e.message : String(e) })
      })
    return () => {
      cancelled = true
    }
  }, [key, homeId, taskInstanceId])
  const current = answer && answer.key === key ? answer : null
  return { detail: current?.detail ?? null, loading: !!key && !current, error: current?.error ?? null }
}
