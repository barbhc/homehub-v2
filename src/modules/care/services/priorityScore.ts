import { addDays, localToday } from "../../../../shared/dates/calendar"
import type { PriorityTier, RiskLevel } from "@/integrations/types"

/* Moved out of taskService so the cadence-change writer (cadenceChangeService)
 * can build an occurrence without importing taskService, which imports it.
 * taskService re-exports it, so every existing import keeps working. */

// Priority scoring constants (from CHO spec)
const TIER_BASE: Record<PriorityTier, number> = {
  essential: 100,
  recommended: 60,
  optional: 30,
}
const RISK_BONUS: Record<RiskLevel, number> = {
  safety: 100,
  prevent_damage: 50,
  performance: 20,
  comfort: 10,
}
const DUENESS_OVERDUE = 60
const DUENESS_WITHIN_WINDOW = 30
const DUENESS_DUE_IN_14 = 15
const EFFORT_PENALTY = 20

/**
 * Computes priority_score and is_safety_critical for a task_instance.
 */
export function computePriorityScore(
  tier: PriorityTier,
  riskLevel: RiskLevel,
  dueDate: string,
  windowStart: string | null,
  windowEnd: string | null,
  estimatedMinutes: number | null
): { priorityScore: number; isSafetyCritical: boolean } {
  const tierBase = TIER_BASE[tier] ?? 60
  const riskBonus = RISK_BONUS[riskLevel] ?? 0
  const isSafetyCritical = riskLevel === "safety"

  let duenessBonus = 0
  const today = localToday()
  if (dueDate < today) duenessBonus = DUENESS_OVERDUE
  else if (windowStart && windowEnd && today >= windowStart && today <= windowEnd)
    duenessBonus = DUENESS_WITHIN_WINDOW
  // Calendar days, not 14 x 24 h from noon: across the November change that
  // reached only 11:00 on day 14 and missed a task due that day.
  else if (dueDate <= addDays(today, 14)) duenessBonus = DUENESS_DUE_IN_14

  let effortPenalty = 0
  const isHighEffort = estimatedMinutes != null && estimatedMinutes > 20
  if (tier === "optional" && isHighEffort) effortPenalty = EFFORT_PENALTY

  const priorityScore = Math.max(0, tierBase + riskBonus + duenessBonus - effortPenalty)
  return { priorityScore, isSafetyCritical }
}
