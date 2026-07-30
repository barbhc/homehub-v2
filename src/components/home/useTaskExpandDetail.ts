import { useCallback, useState } from "react"
import useSWR, { preload } from "swr"
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

/** SWR key for one task's expand detail — shared by the hook and the prefetcher. */
function detailKey(homeId: string, taskInstanceId: string): string {
  return `task-detail:${homeId}:${taskInstanceId}`
}

async function fetchDetail(homeId: string, taskInstanceId: string): Promise<TaskDetail | null> {
  // Failures are non-fatal: the panel still renders its meta + "Open full view",
  // so a transient data error never breaks the card.
  try {
    const res = await getTaskDetail(homeId, taskInstanceId)
    return res.data ?? null
  } catch {
    return null
  }
}

/**
 * Warm a task's detail before the user asks for it. Home calls this for the rows
 * it has just rendered, so tapping "See how" usually finds the data already in
 * SWR's cache instead of showing "Loading details…" (the lag reported 2026-07-29).
 * Safe to call repeatedly — SWR dedupes by key.
 */
export function prefetchTaskDetail(homeId: string | null, taskInstanceId: string): void {
  if (!homeId || !taskInstanceId) return
  preload(detailKey(homeId, taskInstanceId), () => fetchDetail(homeId, taskInstanceId))
}

/**
 * Fetches the full TaskDetail for an expandable Home card. The hook owns the
 * open/loading state so the desktop FocusCard and the mobile TaskHero behave
 * identically: toggle "See how" → expand the inline panel.
 *
 * Backed by SWR rather than local state, which buys two things over the previous
 * fetch-once-per-card version: the result is shared across cards and survives
 * navigation (the app's persistent cache provider), and `prefetchTaskDetail` can
 * fill the same cache entry ahead of the tap.
 */
export function useTaskExpandDetail(homeId: string | null, taskInstanceId: string) {
  const [open, setOpen] = useState(false)

  // Pure toggle — no side effects in the state updater (calling setState/async
  // work inside an updater can crash under React's prod reconciliation).
  const toggle = useCallback(() => setOpen((o) => !o), [])

  // Keyed only while open, so a collapsed card costs nothing; a prefetched entry
  // is already in cache by then and renders without a loading flash.
  const { data, isLoading } = useSWR(
    open && homeId ? detailKey(homeId, taskInstanceId) : null,
    () => fetchDetail(homeId!, taskInstanceId),
    { revalidateOnFocus: false, revalidateIfStale: false, keepPreviousData: true },
  )

  return { open, toggle, detail: data ?? null, loading: isLoading && !data }
}
