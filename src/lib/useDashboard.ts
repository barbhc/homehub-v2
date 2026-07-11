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

async function fetchDashboard(homeId: string): Promise<DashboardData> {
  // Round 1: fetch profile and supporting data in parallel.
  // Profile is needed to extract top_concerns for task ordering.
  const [profileRes, stats, upcoming, expiringWarranties, notices, cleaningGuides, homeUpkeepRes] =
    await Promise.all([
      getHomeProfile(homeId),
      getDashboardStats(homeId),
      getUpcomingTasks(homeId),
      getExpiringWarranties(homeId),
      getHomeNotices(homeId),
      // Powers the desktop "Deep-clean guides" rail (advanced/power level only).
      // Curated, guide-level + capped — NOT the full per-step cleaning feed.
      getDeepCleanGuides(homeId),
      // Powers the desktop "Home upkeep" list: home-scoped recurring tasks.
      getHomeUpkeep(homeId),
    ])
  const topConcerns = profileRes.data?.top_concerns ?? []

  // Round 2: fetch tasks (needs topConcerns) and insights (needs warranties) in parallel.
  const [tasks, insights] = await Promise.all([
    getDashboardTasks(homeId, topConcerns),
    getInsights(homeId, expiringWarranties),
  ])
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

export function useDashboard(homeId: string | null) {
  const { data, error, isLoading, mutate } = useSWR(
    homeId ? `dashboard:${homeId}` : null,
    () => fetchDashboard(homeId!),
    {
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      dedupingInterval: 5000,
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
