/**
 * SWR-powered dashboard data hook.
 * Caches dashboard queries so revisiting Home shows data instantly,
 * then revalidates in the background. Also auto-revalidates on
 * tab focus and network reconnect.
 */

import useSWR from "swr"
import {
  getDashboardTasks,
  getDashboardStats,
  getUpcomingTasks,
  getExpiringWarranties,
  getInsights,
  getHomeNotices,
  type DashboardTasksResult,
  type DashboardStats,
  type MaintenanceTaskFull,
  type InsightCard,
  type ExpiringWarrantyItem,
  type HomeNotices,
} from "./dashboard"
import { getDeepCleanGuides, type DeepCleanGuide } from "./cleanSession"
import { getHomeProfile } from "@/modules/home/services/homeProfileService"
import { persistDashboardSnapshot } from "./swrPersist"
import { markBoot } from "./bootTiming"

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
 */
async function fetchCore(homeId: string): Promise<DashboardCore> {
  const [profileRes, stats] = await Promise.all([
    soft(getHomeProfile(homeId), { data: null, error: null } as Awaited<ReturnType<typeof getHomeProfile>>, "profile"),
    getDashboardStats(homeId), // core — a real failure here surfaces the retry card
  ])
  const tasks = await getDashboardTasks(homeId, profileRes.data?.top_concerns ?? [])
  markBoot("dash:core")
  return { stats, tasks }
}

/**
 * SUPPLEMENTARY — warranties, notices, guides, upkeep, upcoming, insights.
 * Every one fails soft: a flaky query here degrades its own section to empty and
 * never blanks Home. Fetched alongside core, rendered whenever it lands.
 */
async function fetchExtras(homeId: string): Promise<DashboardExtras> {
  // getHomeUpkeep is deliberately NOT fetched here any more. Its only consumer
  // was the desktop Home-upkeep card, and it read two ENTIRE collections
  // (taskInstances + taskTemplates) on every dashboard load to render rows the
  // agenda already carried. Removing the card removed the query with it.
  const [upcoming, expiringWarranties, notices, cleaningGuides] = await Promise.all([
    soft(getUpcomingTasks(homeId), [], "upcoming"),
    soft(getExpiringWarranties(homeId), [], "warranties"),
    soft(getHomeNotices(homeId), EMPTY_NOTICES, "notices"),
    soft(getDeepCleanGuides(homeId), [], "cleaningGuides"),
  ])
  markBoot("dash:extras")
  // Insights read the warranties, so this one genuinely is second.
  const insights = await soft(getInsights(homeId, expiringWarranties), [], "insights")
  return { upcoming, insights, expiringWarranties, notices, cleaningGuides }
}

/** Reject after `ms` so a hung Firestore query surfaces the retry card instead
 *  of trapping the user on the loading skeleton forever (no default SWR timeout). */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("Loading your home timed out. Check your connection and try again.")), ms)
    ),
  ])
}

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
    () => withTimeout(fetchCore(homeId!), 20_000),
    {
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      dedupingInterval: 5000,
      keepPreviousData: true,
      onSuccess: (fresh, key) => persistDashboardSnapshot(key, fresh),
    },
  )

  const extras = useSWR<DashboardExtras>(
    homeId ? `dashboard:extras:${homeId}` : null,
    () => withTimeout(fetchExtras(homeId!), 20_000),
    {
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      dedupingInterval: 5000,
      keepPreviousData: true,
      onSuccess: (fresh, key) => persistDashboardSnapshot(key, fresh),
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
