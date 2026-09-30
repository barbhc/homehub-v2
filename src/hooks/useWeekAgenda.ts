/**
 * The Tasks page's agenda, fetched ONCE per home and shared.
 *
 * /maintenance mounts two trees — RefinedWeek on phones, DesktopTasks at lg+ —
 * and each used to run its own uncached getWeekAgenda (the home doc plus every
 * task instance in the home) on every visit, so every visit paid for the agenda
 * twice. Both now call this hook: one SWR key per home, so the two trees share
 * one request and one cache, and the agenda is persisted like Home's dashboard
 * so a revisit or a relaunch paints at once and revalidates behind it.
 */
import { useCallback } from "react"
import useSWR, { useSWRConfig } from "swr"
import { countHiddenCleaning, getWeekAgenda, type WeekAgendaItem } from "@/modules/care"
import { persistSwrSnapshot, WEEK_KEY_PREFIX } from "@/lib/swrPersist"
import { LOAD_TIMEOUT_MS, withTimeout } from "@/lib/withTimeout"

/** How far ahead the Tasks page reads, so the month calendar and the "Later" group have real content. */
export const TASKS_HORIZON_DAYS = 31

/**
 * One persisted payload per home. If this shape changes, bump WEEK_KEY_PREFIX's
 * version in swrPersist.ts — snapshots of the old shape are then ignored.
 */
export interface WeekAgendaSnapshot {
  items: WeekAgendaItem[]
  /** Scheduled work the agenda hides by design (item-scoped cleaning), so an empty list can say where it went. */
  hiddenCleaning: number
}

export function weekAgendaKey(homeId: string): string {
  return `${WEEK_KEY_PREFIX}${homeId}`
}

const TIMED_OUT = "Loading your tasks timed out. Check your connection and try again."

/**
 * THROWS on a failed read — including an offline read the cache answered with
 * nothing (refuseOfflineEmpty) — so SWR keeps the last good agenda. Resolving
 * an empty agenda instead would say "Nothing due — enjoy the calm" about a home
 * whose tasks we never read, and persist that as the next launch's snapshot.
 */
async function fetchWeekAgenda(homeId: string): Promise<WeekAgendaSnapshot> {
  const res = await getWeekAgenda(homeId, { days: TASKS_HORIZON_DAYS, refuseOfflineEmpty: true })
  if (res.error) throw new Error(res.error.message)
  // Only counted when the agenda is actually empty — no cost on the common path.
  const hiddenCleaning = res.data.length === 0 ? await countHiddenCleaning(homeId) : 0
  return { items: res.data, hiddenCleaning }
}

export function useWeekAgenda(homeId: string | null) {
  const key = homeId ? weekAgendaKey(homeId) : null
  // Keyed explicitly (not the hook's bound mutate): a removal belongs to the
  // home whose row was checked off, whatever the hook is showing by the time
  // that write resolves.
  const { mutate: mutateKey } = useSWRConfig()
  const { data, error, mutate } = useSWR<WeekAgendaSnapshot>(
    key,
    () => withTimeout(fetchWeekAgenda(homeId!), LOAD_TIMEOUT_MS, TIMED_OUT),
    {
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      dedupingInterval: 5000,
      // Never another home's agenda under this home's name — see useHomeItems.
      keepPreviousData: false,
      onSuccess: (fresh, k) => persistSwrSnapshot(k, fresh),
    },
  )

  /**
   * After a check-off or snooze has SUCCEEDED: take the row off the shared
   * agenda — both trees, and the persisted snapshot, so a relaunch can't show a
   * finished task as still to do — without refetching the whole agenda (the
   * rows used to be filtered locally with no refetch; this keeps that cost).
   *
   * One exception: if what's on screen is the persisted snapshot (this
   * session's read hasn't landed yet), the removal is applied to it and, since
   * SWR discards a read that started before a local change, a fresh read is
   * asked for — otherwise the page would keep a snapshot the server never
   * confirmed.
   */
  const removeTask = useCallback(
    (taskInstanceId: string) => {
      if (!key) return
      let fromSnapshot = false
      mutateKey<WeekAgendaSnapshot>(
        key,
        (current) => {
          fromSnapshot = current === undefined
          const base = current ?? data
          if (!base) return current
          const next = { ...base, items: base.items.filter((t) => t.taskInstanceId !== taskInstanceId) }
          persistSwrSnapshot(key, next)
          return next
        },
        { revalidate: () => fromSnapshot },
      ).catch((e: unknown) => {
        // The write already succeeded; a failed local removal only means the
        // row lingers until the next read. Logged, never surfaced as a failure.
        console.warn(`[tasks] could not update ${key}:`, e instanceof Error ? e.message : e)
      })
    },
    [key, mutateKey, data],
  )

  return {
    /** The agenda to paint — fresh, in-memory, or the persisted snapshot. `undefined` only when there is nothing to paint yet. */
    data,
    /** The last read's failure. Set alongside `data` when a refresh failed behind an agenda we could still show. */
    error: error instanceof Error ? error : error ? new Error(String(error)) : undefined,
    /** Refetch now (Try again / Retry). */
    refresh: () => mutate(),
    removeTask,
  }
}
