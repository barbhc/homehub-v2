/**
 * Canonical cross-appliance symptom taxonomy.
 *
 * The integration key between setup tasks, maintenance tasks, knowledge
 * chunks, and the upcoming troubleshooting flow (Phase 4b). Every task
 * extracted from a manual gets tagged with zero or more of these symptoms;
 * the troubleshooting flow uses them to fan out queries when the user
 * reports a problem.
 *
 * Lives as a TypeScript constants file rather than a DB table because:
 *   - The set is small and stable (12 cross-appliance tags, rarely added to)
 *   - Schema overhead (table + RLS + migrations) isn't worth it for
 *     reference data this static
 *   - TypeScript autocomplete + compile-time checks catch typos in
 *     producer code (parser, classifier, troubleshooting query builder)
 *
 * Edits:
 *   - Adding a tag here is safe — DB columns are TEXT[], no enum to migrate.
 *   - Renaming a tag requires a one-shot data migration to update existing
 *     `symptom_tags` arrays. Don't rename casually.
 *   - Per-category overlays (e.g. coffee-machine-specific symptoms) can be
 *     added later as a second const without touching this list.
 */

export const SYMPTOM_TAGS = {
  vibration: {
    label: "Vibration / walking",
    description: "Excessive shaking or movement during operation",
  },
  drainage: {
    label: "Won't drain / draining issues",
    description: "Water not draining, slow drainage, standing water",
  },
  electrical: {
    label: "Electrical issue",
    description: "Sparks, shocks, burning smell, tripped breaker, won't power on",
  },
  noise: {
    label: "Loud or unusual noise",
    description: "Grinding, squealing, banging, knocking",
  },
  wont_start: {
    label: "Won't start",
    description: "Doesn't power on, no response to controls",
  },
  overheating: {
    label: "Overheating",
    description: "Excessive heat, smoke, hot exterior",
  },
  leaking: {
    label: "Leaking",
    description: "Water, oil, or refrigerant leaks",
  },
  odor: {
    label: "Bad odor",
    description: "Mildew, sulfur, food, or burning smell",
  },
  error_code: {
    label: "Error code displayed",
    description: "Display shows an error or fault code",
  },
  wont_clean: {
    label: "Doesn't clean / cook properly",
    description: "Dishes, clothes, or food come out unsatisfactorily",
  },
  performance_drop: {
    label: "Performance drop",
    description: "Slower, less efficient, takes longer than usual",
  },
  physical_damage: {
    label: "Physical damage",
    description: "Crack, dent, broken handle, torn seal",
  },
} as const

/** Canonical symptom-tag keys. Use this type to constrain producer code. */
export type SymptomTag = keyof typeof SYMPTOM_TAGS

/** Iterable list of all canonical tags. Useful for validation + UI chips. */
export const ALL_SYMPTOM_TAGS = Object.keys(SYMPTOM_TAGS) as SymptomTag[]

/** Friendly UI label, falls back to the raw key if unknown (defensive). */
export function symptomLabel(tag: string): string {
  return (SYMPTOM_TAGS as Record<string, { label: string }>)[tag]?.label ?? tag
}

/** Validate a string is a known canonical tag. */
export function isValidSymptomTag(tag: string): tag is SymptomTag {
  return tag in SYMPTOM_TAGS
}

/**
 * Filter an arbitrary string array down to only canonical tags.
 * Used when reading `task_template.symptom_tags` from DB rows that may
 * contain stale or unrecognized values from older parser versions.
 */
export function filterValidSymptomTags(tags: readonly string[] | null | undefined): SymptomTag[] {
  if (!tags) return []
  return tags.filter(isValidSymptomTag)
}

// ───────────────────────────────────────────────────────────────────────────
// Free-text → canonical symptom matching
// ───────────────────────────────────────────────────────────────────────────

/**
 * Keyword hints per symptom, used to map a user's free-text description
 * ("it's leaking from the bottom") to a canonical tag without an AI call.
 * Lowercase substrings; matched against the lowercased input.
 */
const SYMPTOM_KEYWORDS: Record<SymptomTag, string[]> = {
  vibration: ["vibrat", "shak", "wobbl", "walk", "rattl", "shudder"],
  drainage: ["drain", "won't drain", "wont drain", "standing water", "clog", "backed up", "back up", "water left"],
  electrical: ["spark", "shock", "breaker", "tripp", "burning smell", "smells like burning", "electric", "no power", "won't power", "wont power"],
  noise: ["nois", "loud", "grind", "squeal", "squeak", "bang", "knock", "hum", "buzz", "clank"],
  wont_start: ["won't start", "wont start", "won't turn on", "wont turn on", "won't run", "dead", "unresponsive", "nothing happens", "no response"],
  overheating: ["overheat", "too hot", "very hot", "smoke", "smoking", "burning up", "runs hot"],
  leaking: ["leak", "drip", "puddle", "water under", "water on the floor", "oil", "refrigerant"],
  odor: ["odor", "odour", "smell", "stink", "mildew", "musty", "moldy", "sulfur", "rotten", "stinky"],
  error_code: ["error", "fault", "code", "blink", "flash", "warning light", "e1", "e2", "e3", "f1"],
  wont_clean: ["doesn't clean", "wont clean", "won't clean", "not clean", "still dirty", "streak", "spots", "undercook", "not cook", "won't dry", "wont dry", "not dry"],
  performance_drop: ["slow", "takes longer", "takes forever", "weak", "less", "not as", "inefficient", "underperform", "barely"],
  physical_damage: ["crack", "dent", "broke", "broken", "torn", "chip", "handle", "seal", "snapped", "shatter"],
}

/**
 * Map a free-text problem description to the best-fitting canonical symptom,
 * or null if nothing matches. Pure keyword scoring (no AI) — ties resolve to
 * the earlier tag in ALL_SYMPTOM_TAGS order.
 */
export function matchSymptomFromText(input: string): SymptomTag | null {
  const text = input.toLowerCase()
  if (text.trim().length < 2) return null
  let best: { tag: SymptomTag; score: number } | null = null
  for (const tag of ALL_SYMPTOM_TAGS) {
    let score = 0
    for (const kw of SYMPTOM_KEYWORDS[tag]) {
      if (text.includes(kw)) score += 1
    }
    if (score > 0 && (!best || score > best.score)) best = { tag, score }
  }
  return best?.tag ?? null
}

// ───────────────────────────────────────────────────────────────────────────
// Re-check trigger shape (used by task_template.re_check_triggers)
// ───────────────────────────────────────────────────────────────────────────

/**
 * Severity drives visual emphasis on the Setup Checklist:
 *   - safety:  red badge ("Re-do if you smell burning…") — call out fire/shock/leak
 *   - warning: amber badge ("Re-do if vibrating during spin")
 */
export type ReCheckSeverity = "safety" | "warning"

export interface ReCheckTrigger {
  /** Canonical key from SYMPTOM_TAGS (cross-references the symptom taxonomy). */
  trigger: SymptomTag
  /** User-facing description of the trigger condition. */
  description: string
  /** Visual severity for the Setup Checklist UI. */
  severity: ReCheckSeverity
}
