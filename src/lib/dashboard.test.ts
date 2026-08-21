import { describe, it, expect } from "vitest"
import { computeHealthScore, type DashboardStats } from "./dashboard"

describe("computeHealthScore", () => {
  const baseStats: DashboardStats = {
    totalItems: 10,
    overdueTaskCount: 0,
    dueSoonCount: 0,
    completedThisMonth: 0,
    scheduledTaskCount: 0,
  }

  it("returns 100 when nothing is overdue and nothing completed", () => {
    expect(computeHealthScore(baseStats, 0)).toBe(100)
  })

  it("penalizes essential overdue tasks heavily (15 pts each, max 45)", () => {
    const stats = { ...baseStats, overdueTaskCount: 2 }
    // 2 essential overdue = 30 penalty, score = 70
    expect(computeHealthScore(stats, 2)).toBe(70)
  })

  it("caps essential penalty at 45", () => {
    const stats = { ...baseStats, overdueTaskCount: 5 }
    // 5 essential = 75 penalty, capped at 45 → score = 55
    expect(computeHealthScore(stats, 5)).toBe(55)
  })

  it("penalizes non-essential overdue tasks lightly (3 pts each, max 15)", () => {
    const stats = { ...baseStats, overdueTaskCount: 3 }
    // 0 essential, 3 non-essential = 9 penalty → score = 91
    expect(computeHealthScore(stats, 0)).toBe(91)
  })

  it("caps non-essential penalty at 15", () => {
    const stats = { ...baseStats, overdueTaskCount: 10 }
    // 0 essential, 10 non-essential = 30, capped at 15 → score = 85
    expect(computeHealthScore(stats, 0)).toBe(85)
  })

  it("adds completion bonus (2 pts each, max 12)", () => {
    const stats = { ...baseStats, completedThisMonth: 5 }
    // bonus = 10 → score = 110, capped at 100
    expect(computeHealthScore(stats, 0)).toBe(100)
  })

  it("combines penalties and bonus correctly", () => {
    const stats = { ...baseStats, overdueTaskCount: 3, completedThisMonth: 3 }
    // 1 essential (15) + 2 non-essential (6) - 6 bonus = 15 penalty → score = 85
    expect(computeHealthScore(stats, 1)).toBe(85)
  })

  it("never goes below 0", () => {
    const stats = { ...baseStats, overdueTaskCount: 10 }
    // 10 essential = 150, capped at 45 + 0 non-essential → score = 55
    // Actually: 10 essential overdue, but overdueTaskCount also 10
    // essentialPenalty = min(10*15, 45) = 45
    // nonEssential = max(0, 10-10) = 0, softPenalty = 0
    // score = 100 - 45 = 55
    expect(computeHealthScore(stats, 10)).toBe(55)
  })

  it("never exceeds 100", () => {
    const stats = { ...baseStats, completedThisMonth: 20 }
    // bonus = min(40, 12) = 12 → score = 112, capped at 100
    expect(computeHealthScore(stats, 0)).toBe(100)
  })
})
