import { useCallback, useEffect, useRef, useState } from "react"
import { getTaskDetail, type TaskDetail } from "@/modules/care"
import type { ScheduleType, Season } from "@/integrations/types"

/**
 * Human-readable recurrence labels, shared by the Home inline-expand panels
 * (desktop FocusCard / mobile TaskHero) and any other surface that needs to
 * describe a task's schedule in plain language.
 */
export const RECUR_LABEL: Record<ScheduleType, string> = {
  weekly: "weekly", monthly: "monthly", quarterly: "every 3 months", semiannual: "every 6 months",
  annual: "yearly", every_n_days: "on a cycle", seasonal: "each season",
  after_each_use: "after each use", as_needed: "as needed", setup: "one-time setup",
}

const NON_RECURRING: ScheduleType[] = ["after_each_use", "as_needed", "setup"]

/** Safe recurrence label, tolerant of schedule types not in the static map. */
export function recurLabel(t: ScheduleType): string {
  return RECUR_LABEL[t] ?? "on a schedule"
}

/** True when the schedule describes a repeating task (vs a one-off / on-demand). */
export function isRecurring(t: ScheduleType | null | undefined): boolean {
  return !!t && !NON_RECURRING.includes(t)
}

/**
 * Title-case cadence label for upkeep rows, e.g. "Weekly", "Every 3 months",
 * "Each fall" / "Each season", "Every 10 days". Mirrors the prototype's
 * `upSched` (design/hh-advanced.jsx). Seasonal rows get "Each {season}" when the
 * season is known, falling back to "Each season".
 */
const CADENCE_LABEL: Record<ScheduleType, string> = {
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Every 3 months",
  semiannual: "Every 6 months",
  annual: "Yearly",
  seasonal: "Each season",
  every_n_days: "On a cycle",
  after_each_use: "After each use",
  as_needed: "As needed",
  setup: "One-time setup",
}

export function cadenceLabel(
  t: ScheduleType,
  season?: Season | null,
  intervalDays?: number | null
): string {
  if (t === "seasonal") return season ? `Each ${season}` : "Each season"
  if (t === "every_n_days" && intervalDays && intervalDays > 0) {
    return `Every ${intervalDays} days`
  }
  return CADENCE_LABEL[t] ?? "On a schedule"
}

/**
 * Lazily fetches the full TaskDetail the first time a Home card is expanded,
 * then caches it for the lifetime of the card. The hook owns the open/loading
 * state so both the desktop FocusCard and the mobile TaskHero share identical
 * behavior: toggle "See how" → fetch once → expand the inline panel.
 *
 * Fetch failures are non-fatal — the panel still renders its meta + "Open full
 * view" link, so the card never breaks on a transient data error.
 */
export function useTaskExpandDetail(homeId: string | null, taskInstanceId: string) {
  const [open, setOpen] = useState(false)
  const [detail, setDetail] = useState<TaskDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const fetchedRef = useRef(false)

  // Pure toggle — no side effects in the state updater (calling setState/async
  // work inside an updater can crash under React's prod reconciliation).
  const toggle = useCallback(() => setOpen((o) => !o), [])

  // Lazy-fetch the detail the first time the panel opens. Side effects belong
  // in an effect, not the updater above.
  useEffect(() => {
    if (!open || fetchedRef.current || !homeId) return
    fetchedRef.current = true
    setLoading(true)
    let cancelled = false
    getTaskDetail(homeId, taskInstanceId)
      .then((res) => { if (!cancelled) setDetail(res.data ?? null) })
      .catch(() => { if (!cancelled) setDetail(null) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [open, homeId, taskInstanceId])

  return { open, toggle, detail, loading }
}
