// ── Tasks redesign — shared helpers (mobile TasksV3A + desktop DesktopTasksRoom)
// Ported from the design handoff (tasks-redesign{,2,3}.jsx / tasks-desktop.jsx),
// rebuilt against the real WeekAgenda read model. The prototype's hardcoded
// "June 2026 / today = 24th" calendar and item→room mapping are replaced with
// real dates and the real room join. Calm tiers only (never red); overdue is a
// clay dot + the word "Overdue", never a full-orange line or "50d overdue".

import { useEffect, useState } from "react"
import { getTaskDetail, type TaskDetail, type WeekAgendaItem } from "@/modules/care"
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
 * Calm "when" label for a row's metadata line. Overdue collapses to the single
 * word "Overdue" (no alarming "50d overdue" precision); on-track rows get a
 * natural-language relative label.
 */
export function whenLabel(t: WeekAgendaItem): string {
  if (t.isOverdue) return "Overdue"
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
/** Item label for the item filter / "Group by Item". */
export function itemOf(t: WeekAgendaItem): string {
  return t.itemName ?? t.roomName ?? "Home"
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
    const buckets: { key: string; label: string; tone: string; items: WeekAgendaItem[] }[] = [
      // Genuinely overdue (essential lapse) only — usually small or empty.
      { key: "overdue", label: "Overdue", tone: CLAY, items: tasks.filter((t) => t.isOverdue) },
      { key: "week", label: "This week", tone: TEAL, items: tasks.filter((t) => !t.isOverdue && !t.pastDue && daysUntil(t.dueDate) <= 7) },
      // Past their suggested cadence but no hard deadline — calm backlog.
      { key: "anytime", label: "Start anytime", tone: SLATE, items: tasks.filter((t) => !t.isOverdue && t.pastDue) },
      { key: "later", label: "Later", tone: SLATE, items: tasks.filter((t) => !t.isOverdue && !t.pastDue && daysUntil(t.dueDate) > 7) },
    ]
    return buckets
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
 * Tier-filter state that persists within a session but resets to "focus" each
 * NEW session (sessionStorage is per-tab-session by design). Shared by mobile
 * RefinedWeek and desktop DesktopTasks so the behavior can't drift.
 */
export function useTierFilter(): [string, (t: string) => void] {
  const [tier, setTierState] = useState<string>(() => {
    try {
      return sessionStorage.getItem(TIER_STORAGE_KEY) || "focus"
    } catch {
      return "focus"
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

export type Insight = { kind: "start" | "calm"; label: string; text: string; tone: string }

export function computeInsight(tasks: WeekAgendaItem[]): Insight {
  const essOver = tasks.filter((t) => t.isOverdue && t.priorityTier === "essential").length
  if (essOver > 0) {
    return {
      kind: "start",
      label: "Start here",
      tone: CLAY,
      text: `${essOver} essential task${essOver > 1 ? "s are" : " is"} overdue.`,
    }
  }
  const counts = new Map<string, number>()
  for (const t of tasks) {
    const r = roomOf(t)
    counts.set(r, (counts.get(r) ?? 0) + 1)
  }
  const busiest = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]
  return {
    kind: "calm",
    label: "Good to know",
    tone: TEAL,
    text:
      busiest && tasks.length > 0
        ? `Most of your list is in the ${busiest[0]} — knock it out in one pass.`
        : "You're on top of things.",
  }
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

export function useTaskDetail(homeId: string | null, taskInstanceId: string | null, enabled: boolean) {
  const [detail, setDetail] = useState<TaskDetail | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!enabled || !homeId || !taskInstanceId) return
    let cancelled = false
    setLoading(true)
    setDetail(null)
    void getTaskDetail(homeId, taskInstanceId).then((res) => {
      if (cancelled) return
      setDetail(res.data ?? null)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [homeId, taskInstanceId, enabled])

  return { detail, loading }
}
