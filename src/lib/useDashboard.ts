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
import { getHomeUpkeep, type HomeUpkeepItem } from "@/modules/care"
import { persistDashboardSnapshot } from "./swrPersist"
import { markBoot } from "./bootTiming"

interface DashboardData {
  tasks: DashboardTasksResult
  stats: DashboardStats
  upcoming: MaintenanceTaskFull[]
  insights: InsightCard[]
  expiringWarranties: ExpiringWarrantyItem[]
  notices: HomeNotices
  cleaningGuides: DeepCleanGuide[]
  homeUpkeep: HomeUpkeepItem[]
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

async function fetchDashboard(homeId: string): Promise<DashboardData> {
  // Round 1. Only stats is core (below); every supplementary query fails soft so
  // one hiccup can't blank the whole Home. Profile drives task ordering only.
  const [profileRes, stats, upcoming, expiringWarranties, notices, cleaningGuides, homeUpkeepRes] =
    await Promise.all([
      soft(getHomeProfile(homeId), { data: null, error: null } as Awaited<ReturnType<typeof getHomeProfile>>, "profile"),
      getDashboardStats(homeId), // core — a real failure here surfaces the retry card
      soft(getUpcomingTasks(homeId), [], "upcoming"),
      soft(getExpiringWarranties(homeId), [], "warranties"),
      soft(getHomeNotices(homeId), EMPTY_NOTICES, "notices"),
      // Powers the desktop "Deep-clean guides" rail (advanced/power level only).
      // Curated, guide-level + capped — NOT the full per-step cleaning feed.
      soft(getDeepCleanGuides(homeId), [], "cleaningGuides"),
      // Powers the desktop "Home upkeep" list: home-scoped recurring tasks.
      soft(getHomeUpkeep(homeId), { data: [], error: null } as Awaited<ReturnType<typeof getHomeUpkeep>>, "homeUpkeep"),
    ])
  markBoot("dash:round1")
  const topConcerns = profileRes.data?.top_concerns ?? []

  // Round 2: tasks (core) + insights (supplementary).
  const [tasks, insights] = await Promise.all([
    getDashboardTasks(homeId, topConcerns), // core
    soft(getInsights(homeId, expiringWarranties), [], "insights"),
  ])
  markBoot("dash:round2")
  return {
    tasks,
    stats,
    upcoming,
    insights,
    expiringWarranties,
    notices,
    cleaningGuides,
    homeUpkeep: homeUpkeepRes.data ?? [],
  }
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

export function useDashboard(homeId: string | null) {
  const { data, error, isLoading, mutate } = useSWR(
    homeId ? `dashboard:${homeId}` : null,
    () => withTimeout(fetchDashboard(homeId!), 20_000),
    {
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      dedupingInterval: 5000,
      // App.tsx seeds the last dashboard as SWR `fallback`, so reopen paints the
      // previous Home instantly; keepPreviousData avoids a skeleton flash while
      // it revalidates.
      keepPreviousData: true,
      // Write the snapshot on every success rather than on unload: iOS can kill a
      // backgrounded WebView without firing beforeunload/visibilitychange, which
      // is exactly the reopen the warm start exists for.
      onSuccess: (fresh, key) => persistDashboardSnapshot(key, fresh),
    }
  )

  return {
    tasks: data?.tasks ?? null,
    stats: data?.stats ?? null,
    upcoming: data?.upcoming ?? [],
    insights: data?.insights ?? [],
    expiringWarranties: data?.expiringWarranties ?? [],
    notices: data?.notices ?? { recalls: [], missingDetails: [] },
    cleaningGuides: data?.cleaningGuides ?? [],
    homeUpkeep: data?.homeUpkeep ?? [],
    isLoading,
    error,
    refresh: mutate,
  }
}
