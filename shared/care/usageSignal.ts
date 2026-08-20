/**
 * Phase 3 of design/due-windows.md — tasks the appliance itself tells you about.
 *
 * Some maintenance has a better trigger than any calendar: the unit has a light.
 * A Levoit Core 300 lights "check filter"; a range hood keeps a charcoal-filter
 * timer. For those, "every 6-8 months" is our estimate and the indicator is the
 * manufacturer's — so the honest framing is a CHECK ("when the filter light
 * comes on, or about every 6 months"), not a due date.
 *
 * We do not need the parser to tell us this. Manuals already produce the
 * evidence as a sibling task: an item with "Reset Filter Cleaning Indicator"
 * demonstrably has a filter indicator. Inferring from what is already extracted
 * avoids another prompt change and another eval cycle.
 *
 * The inference is deliberately narrow. A real read of one home's 429 templates
 * found "Check LED Light Operation" and "Replace LumiLight LED" on a range hood
 * — lamps, not filter indicators. Matching "light" or "LED" would have turned a
 * bulb replacement into a filter check, so: the task must RESET an INDICATOR or
 * TIMER, and its target must share a subject noun with it.
 */

/** Reset-the-indicator tasks: "Reset Filter Cleaning Indicator", "Reset
 *  Charcoal Filter Timer", "Reset Clean Filter Indicator". Requires the verb —
 *  "Check LED Light Operation" is not one of these. */
const INDICATOR_RESET_RE = /\breset\b[\s\S]{0,40}\b(indicator|timer|reminder)\b/i

/** Subject nouns worth linking on. A reset task and its target task must share
 *  one, or "Reset Charcoal Filter Timer" would claim any task on the item. */
const SUBJECTS = ["filter", "charcoal", "mesh", "hepa", "carbon", "pre-filter", "prefilter", "water", "descal"]

export function isIndicatorResetTask(title: string): boolean {
  return INDICATOR_RESET_RE.test(title)
}

function subjectsOf(title: string): string[] {
  const t = title.toLowerCase()
  return SUBJECTS.filter((s) => t.includes(s))
}

/**
 * Given an item's task titles, which of them are driven by an indicator?
 *
 * Returns the titles of the TARGET tasks (the replace/clean work), not the
 * reset tasks themselves — the reset is a step you take after doing the work,
 * and framing it as a check would be circular.
 */
export function indicatorDrivenTitles(titles: string[]): Set<string> {
  const resets = titles.filter(isIndicatorResetTask)
  if (resets.length === 0) return new Set()

  const out = new Set<string>()
  for (const reset of resets) {
    const subjects = subjectsOf(reset)
    if (subjects.length === 0) continue
    for (const candidate of titles) {
      if (candidate === reset || isIndicatorResetTask(candidate)) continue
      // Must be maintenance ON the thing the indicator watches, and must share
      // a subject noun with the reset task.
      if (!/\b(replace|clean|change|wash|rinse)\b/i.test(candidate)) continue
      if (subjectsOf(candidate).some((s) => subjects.includes(s))) out.add(candidate)
    }
  }
  return out
}

/** Cadence in words, for the fallback half of a usage phrase. Deliberately
 *  vague ("about monthly"): it is our estimate, not the manual's promise. */
const CADENCE_WORD: Record<string, string> = {
  weekly: "about weekly",
  monthly: "about monthly",
  quarterly: "about every 3 months",
  semiannual: "about every 6 months",
  annual: "about yearly",
  seasonal: "each season",
}

/**
 * How to say when an indicator-driven task wants doing.
 *
 * The indicator LEADS because it is the manufacturer's signal, measured on the
 * actual unit; our cadence follows as the fallback for anyone whose light never
 * comes on. Note this takes the CADENCE, not a window phrase — "or Oct-ish"
 * would promise a date for something whose whole point is that it has none.
 */
export function usagePhrase(scheduleType: string | null): string {
  const word = scheduleType ? CADENCE_WORD[scheduleType] : undefined
  return word ? `When the indicator comes on · or ${word}` : "When the indicator comes on"
}
