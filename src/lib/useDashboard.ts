/**
 * SWR-powered dashboard data hook.
 * Caches dashboard queries so revisiting Home shows data instantly,
 * then revalidates in the background. Also auto-revalidates on network
 * reconnect, and on tab focus at most every FOCUS_THROTTLE_MS.
 */

import useSWR from "swr"
import {
  deriveDashboardTasks,
  deriveDashboardStats,
  deriveUpcomingTasks,
  deriveExpiringWarranties,
  deriveInsights,
  deriveHomeNotices,
  type DashboardTasksResult,
  type DashboardStats,
  type MaintenanceTaskFull,
  type InsightCard,
  type ExpiringWarrantyItem,
  type HomeNotices,
} from "./dashboard"
import { deepCleanGuidesFrom, type DeepCleanGuide } from "./cleanSession"
import { homeReadsForThisRound, readTaskTemplates } from "./homeReads"
import { getHomeProfile } from "@/modules/home/services/homeProfileService"
import { persistSwrSnapshot } from "./swrPersist"
import { markBoot } from "./bootTiming"
import { LOAD_TIMEOUT_MS, withTimeout } from "./withTimeout"

interface DashboardCore {
  tasks: DashboardTasksResult
  stats: DashboardStats
}
interface DashboardExtras {
  upcoming: MaintenanceTaskFull[]
  insights: InsightCard[]
  expiringWarranties: ExpiringWarrantyItem[]
  notices: HomeNotices
  cleaningGuides: DeepCleanGuide[]
}

/** Non-essential query → never fail the whole dashboard on it. A flaky
 *  warranties/insights/notices fetch should degrade to empty, not blank Home. */
function soft<T>(p: Promise<T>, fallback: T, label: string): Promise<T> {
  return p.catch((e) => {
    console.warn(`[dashboard] ${label} soft-failed:`, e instanceof Error ? e.message : e)
    return fallback
  })
}

const EMPTY_NOTICES: HomeNotices = { recalls: [], missingDetails: [] }

/**
 * CORE — the two things Home cannot render without: the health stats and the
 * task list. Everything else is supplementary and must not gate first paint.
 *
 * Measured on the owner's phone (2026-08-04, cold start, native shell): the old
 * single fetch spent 1955ms of a 4387ms boot in a round of SEVEN parallel
 * queries, and only then started the task list — which took 174ms. So the list
 * she was waiting on sat behind deep-clean guides and home-upkeep, neither of
 * which mobile Home even renders.
 *
 * `topConcerns` from the profile only applies an ordering BOOST
 * (priorityScoreFor), so tasks depend on the profile alone — one query — rather
 * than on the slowest of seven.
 *
 * Stats and tasks come from ONE set of reads (homeReads.ts — items, open
 * instances, recent completions), which fetchExtras shares when SWR starts both
 * in the same round. The task list no longer waits on a second round trip.
 *
 * Exported (with fetchExtras) for src/lib/dashboardReads.test.ts, which runs
 * both against an in-memory Firestore and pins what one Home load reads.
 */
export async function fetchCore(homeId: string): Promise<DashboardCore> {
  const [profileRes, reads] = await Promise.all([
    soft(getHomeProfile(homeId), { data: null, error: null } as Awaited<ReturnType<typeof getHomeProfile>>, "profile"),
    homeReadsForThisRound(homeId), // core — a real failure here surfaces the retry card
  ])
  const stats = deriveDashboardStats(reads)
  const tasks = deriveDashboardTasks(reads, profileRes.data?.top_concerns ?? [])
  markBoot("dash:core")
  return { stats, tasks }
}

/**
 * SUPPLEMENTARY — warranties, notices, guides, upkeep, upcoming, insights.
 * Every one fails soft: a flaky query here degrades its own section to empty and
 * never blanks Home. Fetched alongside core, rendered whenever it lands.
 */
export async function fetchExtras(homeId: string): Promise<DashboardExtras> {
  // getHomeUpkeep is deliberately NOT fetched here any more. Its only consumer
  // was the desktop Home-upkeep card, and it read two ENTIRE collections
  // (taskInstances + taskTemplates) on every dashboard load to render rows the
  // agenda already carried. Removing the card removed the query with it.
  //
  // Every section derives from the reads fetchCore started in this same round;
  // the templates (for the deep-clean guides) are the only read of extras' own.
  const reads = homeReadsForThisRound(homeId)
  const templates = readTaskTemplates(homeId)
  const [upcoming, expiringWarranties, notices, cleaningGuides, insights] = await Promise.all([
    soft(reads.then(deriveUpcomingTasks), [], "upcoming"),
    soft(reads.then(deriveExpiringWarranties), [], "warranties"),
    soft(reads.then(deriveHomeNotices), EMPTY_NOTICES, "notices"),
    soft(templates.then((t) => deepCleanGuidesFrom(homeId, t, () => reads)), [], "cleaningGuides"),
    soft(reads.then(deriveInsights), [], "insights"),
  ])
  markBoot("dash:extras")
  return { upcoming, insights, expiringWarranties, notices, cleaningGuides }
}

const TIMED_OUT = "Loading your home timed out. Check your connection and try again."

/**
 * Coming back to the app revalidates Home at most this often; each focus used
 * to refetch the whole dashboard (SWR's 5 s default). Opening Home, a reconnect
 * and refresh() — every check-off and snooze — still refetch at once.
 */
export const FOCUS_THROTTLE_MS = 5 * 60_000

/**
 * Two keys, not one. Home's skeleton gates on CORE only, so the supplementary
 * round can take as long as it likes without anyone staring at a spinner.
 *
 * Both keys keep the `dashboard:` prefix that swrPersist requires, so the warm
 * start still works. The first launch after this ships has no snapshot under the
 * new keys and will be a cold one; every launch after that is warm again.
 */
export function useDashboard(homeId: string | null) {
  const core = useSWR<DashboardCore>(
    homeId ? `dashboard:core:${homeId}` : null,
    () => withTimeout(fetchCore(homeId!), LOAD_TIMEOUT_MS, TIMED_OUT),
    {
      revalidateOnFocus: true,
      focusThrottleInterval: FOCUS_THROTTLE_MS,
      revalidateOnReconnect: true,
      dedupingInterval: 5000,
      keepPreviousData: true,
      onSuccess: (fresh, key) => persistSwrSnapshot(key, fresh),
    },
  )

  const extras = useSWR<DashboardExtras>(
    homeId ? `dashboard:extras:${homeId}` : null,
    () => withTimeout(fetchExtras(homeId!), LOAD_TIMEOUT_MS, TIMED_OUT),
    {
      revalidateOnFocus: true,
      focusThrottleInterval: FOCUS_THROTTLE_MS,
      revalidateOnReconnect: true,
      dedupingInterval: 5000,
      keepPreviousData: true,
      onSuccess: (fresh, key) => persistSwrSnapshot(key, fresh),
    },
  )

  return {
    tasks: core.data?.tasks ?? null,
    stats: core.data?.stats ?? null,
    upcoming: extras.data?.upcoming ?? [],
    insights: extras.data?.insights ?? [],
    expiringWarranties: extras.data?.expiringWarranties ?? [],
    notices: extras.data?.notices ?? { recalls: [], missingDetails: [] },
    cleaningGuides: extras.data?.cleaningGuides ?? [],
    // CORE only. Gating the skeleton on the supplementary round is exactly the
    // 1955ms this change exists to stop charging the user.
    isLoading: core.isLoading,
    error: core.error,
    refresh: () => Promise.all([core.mutate(), extras.mutate()]),
  }
}
