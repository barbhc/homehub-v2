// ── Redesign tokens ──────────────────────────────────────────────────────────
// Ported from the design handoff (design/hh-data.jsx). The calm tier system and
// density scale are the shared foundation for every redesigned screen. Pure (no
// imports) so it's unit-testable and usable from any component.
//
// Two product non-negotiables (design/CLAUDE.md):
//  1. Calm tiers — never alarmist red. Essential = clay, Recommended = teal,
//     Optional = slate. Overdue shows in clay, never pure red.
//  2. Level-based progressive disclosure (simple | standard | advanced).

import type { TaskPriority } from "@/lib/dashboard"

export type Tier = "essential" | "recommended" | "optional"

export const TIER: Record<Tier, { dot: string; soft: string; label: string }> = {
  essential: { dot: "var(--hh-clay)", soft: "var(--hh-clay-soft)", label: "Essential" },
  recommended: { dot: "var(--hh-teal)", soft: "var(--hh-teal-wash)", label: "Recommended" },
  optional: { dot: "var(--hh-slate)", soft: "var(--hh-slate-soft)", label: "Optional" },
}

/** Legacy DashboardTask priority → calm tier. */
export function priorityTier(p: TaskPriority): Tier {
  if (p === "critical") return "essential"
  if (p === "high") return "recommended"
  return "optional"
}

// ── Density ──────────────────────────────────────────────────────────────────
export type DensityName = "spacious" | "cozy" | "compact"
export interface Density {
  pad: number; gap: number; rowPy: number; cardPad: number; stack: number
  big: number; h2: number; body: number; small: number; tap: number; radius: number; dot: number
}
const DENSITY: Record<DensityName, Density> = {
  spacious: { pad: 24, gap: 16, rowPy: 17, cardPad: 21, stack: 22, big: 36, h2: 21, body: 16, small: 13.5, tap: 30, radius: 24, dot: 9 },
  cozy: { pad: 20, gap: 12, rowPy: 13, cardPad: 17, stack: 17, big: 33, h2: 19, body: 15, small: 12.5, tap: 27, radius: 20, dot: 8 },
  compact: { pad: 16, gap: 8, rowPy: 9, cardPad: 13, stack: 12, big: 28, h2: 17, body: 14, small: 11.5, tap: 23, radius: 16, dot: 7 },
}
export function dens(name: DensityName = "cozy"): Density {
  return DENSITY[name] ?? DENSITY.cozy
}

// ── Time helpers ─────────────────────────────────────────────────────────────
export function greeting(now: Date = new Date()): string {
  const h = now.getHours()
  if (h < 12) return "Good morning"
  if (h < 17) return "Good afternoon"
  return "Good evening"
}

export function shortDate(offsetDays = 0, now: Date = new Date()): string {
  const dt = new Date(now)
  dt.setDate(dt.getDate() + offsetDays)
  return dt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
}

/**
 * Natural-language due label from a signed day offset (negative = overdue).
 * Calm wording — only says "overdue" when it genuinely is.
 *
 * Note: for never-started past-due work the Home cards omit the timing label
 * entirely (the recurrence line already conveys "no deadline"), so callers
 * guard the call rather than passing a flag here. The Tasks page groups that
 * work under a "Start anytime" header instead (see tasks/shared.ts).
 */
export function dueLabel(days: number): string {
  if (days < 0) {
    const n = Math.abs(days)
    return `${n} day${n === 1 ? "" : "s"} overdue`
  }
  if (days === 0) return "Today"
  if (days === 1) return "Tomorrow"
  if (days <= 7) return `In ${days} days`
  return shortDate(days)
}

/** Effort tier → rough minutes, for the "· N min" hint. */
export function effortMins(effort: "short" | "medium" | "long" | null | undefined): number | null {
  switch (effort) {
    case "short": return 5
    case "medium": return 15
    case "long": return 30
    default: return null
  }
}
