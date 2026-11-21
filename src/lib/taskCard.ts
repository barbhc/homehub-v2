/**
 * The task card's rules, shared by every place a task is shown (owner-approved
 * 2026-11-21; design/task-card.md).
 *
 * The card reads top to bottom: status line ("Essential · Good to do now"),
 * title, item and minutes, the supply when there is one, then Mark done and
 * Snooze. These helpers decide the words and how the timing is coloured, so
 * Home, Tasks and the task page can't drift apart.
 */
import { TIER, priorityTier, type Tier } from "@/lib/redesign/tokens"
import type { TaskPriority } from "@/lib/dashboard"

export type WhenTone = "plain" | "date" | "attention"

const WEEKDAY = /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/

/**
 * How the timing words are coloured.
 * - attention (clay): a real deadline actually past, or lapsed safety work.
 * - date (ink): a real date someone set ("By Dec 5", "Sat, Jun 27", "Today").
 * - plain (grey): a window ("Good to do now", "In Sep", "Been a while"). Most
 *   tasks have a window, not a date; colouring a window would invent urgency.
 */
export function whenTone(phrase: string | null | undefined, o: { trulyOverdue?: boolean; safetyNote?: string | null } = {}): WhenTone {
  if (o.trulyOverdue || o.safetyNote) return "attention"
  const p = (phrase ?? "").trim()
  if (/^By\s/.test(p) || WEEKDAY.test(p) || p === "Today" || p === "Tomorrow") return "date"
  return "plain"
}

/** "Carrier Infinity Furnace · 10 min" — whichever halves exist. */
export function itemMinutesLine(item: string | null | undefined, minutes: number | null | undefined): string | null {
  const parts = [item?.trim() || null, minutes != null && minutes > 0 ? `${minutes} min` : null].filter(Boolean)
  return parts.length ? parts.join(" · ") : null
}

/** The tier word and its colour token. */
export function tierWord(tier: Tier): { label: string; color: string } {
  return { label: TIER[tier].label, color: TIER[tier].dot }
}

const PRIORITIES: readonly TaskPriority[] = ["low", "medium", "high", "critical"]
const isPriority = (p: unknown): p is TaskPriority => PRIORITIES.some((x) => x === p)

/** Legacy priority ("critical"/"high"/...) to the calm tier the card names. */
export function tierOfPriority(p: string | null | undefined): Tier {
  return priorityTier(isPriority(p) ? p : "low")
}

/** The supply slot says who to book instead when a pro does the work. */
export const isProLine = (line: string) => /technician/i.test(line)
