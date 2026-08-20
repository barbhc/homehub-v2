/**
 * Shared parse normalization core — THE single implementation of "raw model
 * output → validated rows" for the manual-extraction pipeline.
 *
 * Imported by parse-manual (auto-commit), save-parsed-manual (review flow), and
 * unit tests (src/lib/parseCore.test.ts). Before this module existed the two
 * DB-writing paths hand-duplicated this logic and drifted: structured `steps`
 * were populated only on the review path, `justification` only on the
 * auto-commit path, and re_check_triggers were schema-validated only on the
 * auto-commit path. One implementation ends that class of bug.
 *
 * Keep this module dependency-free (no Deno/node imports) so every runtime —
 * edge functions, vitest, the eval harness — can load it.
 */

// --- Enumerations (canonical value lists) ---

export type ChunkType = "care" | "how_to" | "troubleshooting" | "safety" | "specs" | "warranty" | "cleaning_guide" | "reference"
export type ContentLevel = "critical" | "important" | "contextual" | "reference" | "everyday"
export type CareType = "cleaning" | "maintenance" | "mixed"
export type PriorityTier = "essential" | "recommended" | "optional"
export type RiskLevel = "safety" | "prevent_damage" | "performance" | "comfort"
export type ScheduleType =
  | "after_each_use" | "weekly" | "monthly" | "quarterly" | "semiannual"
  | "annual" | "seasonal" | "every_n_days" | "as_needed" | "setup"
export type ReCheckSeverity = "safety" | "warning"

// Canonical symptom taxonomy — mirrors src/lib/symptomTaxonomy.ts (TS source of truth).
// Edge runtime can't import from src/, so the list is duplicated here.
// Edits to the taxonomy MUST happen in BOTH files (a vitest parity check imports both).
export const VALID_SYMPTOM_TAGS = [
  "vibration", "drainage", "electrical", "noise", "wont_start",
  "overheating", "leaking", "odor", "error_code", "wont_clean",
  "performance_drop", "physical_damage",
] as const
export type SymptomTag = typeof VALID_SYMPTOM_TAGS[number]
export const VALID_RE_CHECK_SEVERITIES: ReCheckSeverity[] = ["safety", "warning"]

// Persist the full chunk taxonomy — cleaning_guide/warranty/reference are real
// DB values (rows already exist); without them the writer silently downgrades
// them to "how_to".
export const VALID_CHUNK_TYPES: ChunkType[] = ["care", "how_to", "troubleshooting", "safety", "specs", "warranty", "cleaning_guide", "reference"]
export const VALID_CONTENT_LEVELS: ContentLevel[] = ["critical", "important", "contextual", "reference", "everyday"]
export const VALID_CARE_TYPES: CareType[] = ["cleaning", "maintenance", "mixed"]
export const VALID_PRIORITY_TIERS: PriorityTier[] = ["essential", "recommended", "optional"]
export const VALID_RISK_LEVELS: RiskLevel[] = ["safety", "prevent_damage", "performance", "comfort"]
export const VALID_SCHEDULE_TYPES: ScheduleType[] = [
  "after_each_use", "weekly", "monthly", "quarterly", "semiannual",
  "annual", "seasonal", "every_n_days", "as_needed", "setup",
]

// Valid content_level values per chunk type
const SAFETY_LEVELS: ContentLevel[] = ["critical", "important", "contextual", "reference"]
const HOWTO_LEVELS: ContentLevel[] = ["everyday", "reference"]

// --- Raw model output shapes (loose on purpose — the model is untrusted) ---

export interface ParsedChunk {
  chunk_type?: string
  content_level?: string
  title?: string
  content?: string
  tags?: string[]
  scenarios?: Array<{ condition: string; steps: string[] }>
  table_data?: Array<{ table_title?: string; columns?: string[]; rows?: string[][] }>
  source_pages?: number[]
  diagram_pages?: Array<{ page: number; caption: string; crop?: { x: number; y: number; w: number; h: number } }>
  applies_to?: string[]
}

export interface ParsedReCheckTrigger {
  trigger?: string
  description?: string
  severity?: string
}

export interface ParsedTask {
  title?: string; description?: string; care_type?: string; justification?: string
  priority_tier?: string; risk_level?: string; estimated_minutes?: number
  schedule_type?: string; interval_days?: number; instructions_text?: string
  interval_days_min?: number; interval_days_max?: number
  source_page?: number
  tags?: string[]; diagram_pages?: Array<{ page: number; caption: string }>
  symptom_tags?: string[]
  re_check_triggers?: ParsedReCheckTrigger[]
  applies_to?: string[]
  supplies?: Array<{ name?: string; category?: string; part_number?: string } | string>
}

// --- Field normalizers ---

/**
 * Normalize the model's `applies_to` variant tags into a clean lowercase
 * string[] for the *.applies_to TEXT[] columns. Empty = applies to all
 * configurations (the common case). Tokens are slugged (lowercase, spaces→_)
 * and deduped; capped to keep payloads bounded.
 */
export function normalizeAppliesTo(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const out = raw
    .filter((x): x is string => typeof x === "string")
    .map((s) => s.trim().toLowerCase().replace(/\s+/g, "_"))
    .filter((s) => s.length > 0 && s.length <= 24)
  return [...new Set(out)].slice(0, 6)
}

export const VALID_SUPPLY_CATEGORIES = ["filter", "battery", "cleaner", "accessory", "other"] as const
export type SupplyDraft = { name: string; category: string; part_number: string | null }
/**
 * Normalize the model's per-task `supplies` (Q5: extract ONLY when the manual
 * cites them, never invent). Accepts objects {name,category,part_number} or
 * bare strings; coerces category to the catalog enum; dedupes by lowercased
 * name; caps at 6. Empty → []; the "You'll need" chip row self-hides.
 */
export function normalizeSupplies(raw: unknown): SupplyDraft[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: SupplyDraft[] = []
  for (const s of raw) {
    const name = typeof s === "string" ? s : (s && typeof s === "object" ? (s as { name?: unknown }).name : null)
    if (typeof name !== "string") continue
    const clean = name.trim().slice(0, 120)
    if (!clean) continue
    const key = clean.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    const rawCat = s && typeof s === "object" ? (s as { category?: unknown }).category : null
    const category = typeof rawCat === "string" && (VALID_SUPPLY_CATEGORIES as readonly string[]).includes(rawCat) ? rawCat : "other"
    const rawPart = s && typeof s === "object" ? (s as { part_number?: unknown }).part_number : null
    const part_number = typeof rawPart === "string" && rawPart.trim() ? rawPart.trim().slice(0, 80) : null
    out.push({ name: clean, category, part_number })
    if (out.length >= 6) break
  }
  return out
}

/** Split a step blob into discrete steps (mirrors the UI parseSteps heuristic). */
export function splitSteps(text: string): string[] {
  if (!text) return []
  const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean)
  const numbered = lines.filter((l) => /^\d+[.)]\s+/.test(l))
  if (numbered.length >= 2) return numbered.map((l) => l.replace(/^\d+[.)]\s+/, ""))
  const inline = text.split(/(?:^|\s+)(?=\d+[.)]\s)/).map((s) => s.replace(/^\d+[.)]\s+/, "").trim()).filter(Boolean)
  if (inline.length >= 2) return inline
  const sentences = text.split(/(?<=[.!])\s+(?=[A-Z])/).map((s) => s.trim()).filter((s) => s.length > 4)
  if (sentences.length >= 2) return sentences
  return text.trim() ? [text.trim()] : []
}

/** Structured how-to steps for the task_template.steps column: only store a
 *  genuinely multi-step split; single-block tasks stay null and render via the
 *  app's read-time parse fallback. */
export function stepsFromInstructions(text: unknown): string[] | null {
  if (typeof text !== "string") return null
  const s = splitSteps(text.slice(0, 2000))
  return s.length >= 2 ? s : null
}

// --- Row normalizers (raw model object → validated DB-row fields) ---

export function validateContentLevel(chunkType: string, level: string | undefined): string | null {
  if (chunkType === "safety") {
    return SAFETY_LEVELS.includes(level as ContentLevel) ? level! : "important"
  }
  if (chunkType === "how_to" || chunkType === "care") {
    return HOWTO_LEVELS.includes(level as ContentLevel) ? level! : "everyday"
  }
  return null // no content_level for troubleshooting, specs, warranty, cleaning_guide
}

export function normalizeChunkRow(c: ParsedChunk, manualId: string) {
  const chunkType = VALID_CHUNK_TYPES.includes(c.chunk_type as ChunkType)
    ? c.chunk_type as ChunkType
    : "how_to"

  const contentLevel = validateContentLevel(chunkType, c.content_level)
  const scenarios = Array.isArray(c.scenarios) && c.scenarios.length > 0 ? c.scenarios : null
  const sourcePages = Array.isArray(c.source_pages) ? c.source_pages : []
  const diagramPages = Array.isArray(c.diagram_pages) ? c.diagram_pages : []
  // Firestore forbids arrays-of-arrays, and table_data.rows is string[][]. Wrap
  // each row as { cells } so the (write-only, never-read) table data is storable.
  const tableData = Array.isArray(c.table_data) && c.table_data.length > 0
    ? c.table_data.map((t) => ({
        ...(t.table_title ? { table_title: t.table_title } : {}),
        ...(Array.isArray(t.columns) ? { columns: t.columns } : {}),
        ...(Array.isArray(t.rows) ? { rows: t.rows.map((r) => ({ cells: Array.isArray(r) ? r : [r] })) } : {}),
      }))
    : undefined

  const metadata: Record<string, unknown> = { diagram_pages: diagramPages }
  if (tableData) metadata.table_data = tableData

  return {
    manual_id: manualId,
    chunk_type: chunkType,
    content_level: contentLevel,
    title: typeof c.title === "string" ? c.title.slice(0, 500) : null,
    content: String(c.content).slice(0, 10000),
    tags: Array.isArray(c.tags) ? c.tags.slice(0, 20).map(String) : [],
    scenarios: scenarios,
    source_pages: sourcePages,
    applies_to: normalizeAppliesTo(c.applies_to),
    metadata,
  }
}

export function normalizeTaskRow(t: ParsedTask) {
  // Symptom tags: filter to canonical taxonomy, dedupe, cap at 5.
  const symptomTags = Array.isArray(t.symptom_tags)
    ? [...new Set(
        t.symptom_tags
          .filter((s): s is string => typeof s === "string")
          .filter((s) => (VALID_SYMPTOM_TAGS as readonly string[]).includes(s))
      )].slice(0, 5)
    : []

  // Re-check triggers: only valid for setup tasks; filter to canonical
  // symptom keys + valid severity. Capped at 4 entries to keep payloads bounded.
  const scheduleType = VALID_SCHEDULE_TYPES.includes(t.schedule_type as ScheduleType)
    ? t.schedule_type as ScheduleType
    : "as_needed"
  const reCheckTriggers = scheduleType === "setup" && Array.isArray(t.re_check_triggers)
    ? t.re_check_triggers
        .map((r) => {
          if (!r || typeof r !== "object") return null
          const trigger = typeof r.trigger === "string" ? r.trigger : null
          const description = typeof r.description === "string" ? r.description.trim() : ""
          const severity = typeof r.severity === "string" ? r.severity : ""
          if (!trigger || !(VALID_SYMPTOM_TAGS as readonly string[]).includes(trigger)) return null
          if (!description) return null
          const safeSeverity = VALID_RE_CHECK_SEVERITIES.includes(severity as ReCheckSeverity)
            ? severity as ReCheckSeverity
            : "warning"
          return {
            trigger,
            description: description.slice(0, 300),
            severity: safeSeverity,
          }
        })
        .filter((r): r is { trigger: string; description: string; severity: ReCheckSeverity } => r !== null)
        .slice(0, 4)
    : []

  return {
    title: String(t.title).slice(0, 200),
    description: typeof t.description === "string" ? t.description.slice(0, 1000) : null,
    care_type: VALID_CARE_TYPES.includes(t.care_type as CareType) ? t.care_type as CareType : "maintenance",
    // One-sentence "why this matters" — null when the model didn't return one (older runs / missing field).
    justification: typeof t.justification === "string" && t.justification.trim().length > 0
      ? t.justification.trim().slice(0, 500)
      : null,
    priority_tier: VALID_PRIORITY_TIERS.includes(t.priority_tier as PriorityTier) ? t.priority_tier as PriorityTier : "recommended",
    // Stamped later by applyTaskTaxonomy (shared/tasks/taxonomy.ts) when a
    // model-marked "essential" misses the safety/prevent-damage floor, so the
    // user can promote it back per-task. The model never sets this itself.
    essential_candidate: null as "hygiene" | "manual_emphasis" | null,
    risk_level: VALID_RISK_LEVELS.includes(t.risk_level as RiskLevel) ? t.risk_level as RiskLevel : "comfort",
    estimated_minutes: typeof t.estimated_minutes === "number" ? t.estimated_minutes : null,
    instructions_override: typeof t.instructions_text === "string" ? t.instructions_text.slice(0, 2000) : null,
    // Structured steps derived once here — BOTH write paths now persist them
    // (previously only the review path did).
    steps: stepsFromInstructions(t.instructions_text),
    // Manual page this task's how-to came from → a real column (source_page).
    source_page: typeof t.source_page === "number" && t.source_page > 0 ? Math.round(t.source_page) : null,
    schedule_type: scheduleType,
    interval_days: t.schedule_type === "every_n_days" && typeof t.interval_days === "number" ? t.interval_days : null,
    // The RANGE a manual actually states ("every 6-12 months"). Kept for every
    // schedule_type, not just every_n_days: a monthly task whose manual says
    // "every 3-6 weeks" has real slack, and collapsing that to one number is
    // what made the app promise precision it never had (design/due-windows.md).
    ...normalizeIntervalRange(t.interval_days_min, t.interval_days_max),
    tags: Array.isArray(t.tags) ? t.tags.slice(0, 20).map(String) : [],
    diagram_pages: Array.isArray(t.diagram_pages) ? t.diagram_pages : [],
    symptom_tags: symptomTags,
    re_check_triggers: reCheckTriggers,
    applies_to: normalizeAppliesTo(t.applies_to),
    supplies: normalizeSupplies(t.supplies),
  }
}


/**
 * Validate an extracted cadence range.
 *
 * Refuses more than it accepts, because a fabricated range is a false promise
 * about someone's appliance: both bounds must be sane positive day counts, min
 * must not exceed max, and an absurd span (over five years, or a max more than
 * ten times the min) is treated as a misread rather than trusted.
 */
export function normalizeIntervalRange(
  min: unknown,
  max: unknown,
): { interval_days_min: number | null; interval_days_max: number | null } {
  const none = { interval_days_min: null, interval_days_max: null }
  if (typeof min !== "number" || typeof max !== "number") return none
  if (!Number.isFinite(min) || !Number.isFinite(max)) return none
  const lo = Math.round(min)
  const hi = Math.round(max)
  if (lo <= 0 || hi <= 0 || lo > hi) return none
  if (hi > 1825) return none
  if (lo > 0 && hi / lo > 10) return none
  return { interval_days_min: lo, interval_days_max: hi }
}

export type NormalizedTaskRow = ReturnType<typeof normalizeTaskRow>

// --- Rescan identity ---

/** Normalized title for a stable cross-rescan identity. */
export function normTitle(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim()
}
/** Parser-stable key so a rescan UPDATEs a task in place (keeping its instances/
 *  completion) rather than delete-and-reinsert. section is null until two-pass. */
export function extKey(itemUnitId: string, section: string | null | undefined, title: string): string {
  return `${itemUnitId}:${section ?? ""}:${normTitle(title)}`
}

// --- Fuzzy title matching (rescan reconciliation + eval-harness diffs) ---
//
// The eval harness measured 20-45% title churn per re-parse with IDENTICAL
// code ("Run Citrus-Only Cycle to Refresh Filters" ↔ "Run Odor-Mitigation
// Citrus Cycle"), so exact-title matching deletes and re-creates a third of
// tasks on every rescan — the "things disappear" bug. This matcher is shared
// by prod reconciliation AND the harness, so the harness's diff report
// predicts exactly what prod would do.

const TITLE_STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "for", "with", "your",
  "on", "in", "at", "is", "are", "its", "it", "as", "when",
])

/** Light suffix-strip so "grounding"/"grounded" and "filters"/"filter" agree. */
function stem(w: string): string {
  for (const suf of ["ing", "ed", "es", "s"]) {
    if (w.length - suf.length >= 3 && w.endsWith(suf)) return w.slice(0, w.length - suf.length)
  }
  return w
}

/** Cadence phrases carry no task identity (cadence lives in schedule_type) —
 *  strip them so "Clean the Bucket After Each Use" ≡ "Clean the Bucket".
 *  Pre-title-rule rows in the DB carry these suffixes; new parses don't. */
const CADENCE_PHRASE_RE =
  /\(.*?\)|\b(after each (?:use|cycle|wash|load)s?|as needed|when needed|daily|weekly|monthly|quarterly|semi-?annually|semi-?annual|annually|annual|every\s+[\w\s~–-]*?(days?|weeks?|months?|years?|hours?|uses?|cycles?|wash(?:es)?|loads?))\b/gi

export function titleTokens(s: string): Set<string> {
  return new Set(
    (s.toLowerCase().replace(CADENCE_PHRASE_RE, " ").match(/[a-z]+/g) ?? [])
      .filter((w) => w.length >= 3 && !TITLE_STOPWORDS.has(w))
      .map(stem)
  )
}

/**
 * Similarity in [0,1] between two task titles. Jaccard over stemmed tokens,
 * plus a containment bonus (intersection / smaller set) so a retitle that
 * ADDS words still matches — but containment only counts when the smaller
 * title has ≥3 informative tokens, because two-token titles ("Clean Door
 * Gasket" vs "Clean Door Glass") contain each other too easily.
 */
export function titleSimilarity(a: string, b: string): number {
  const ta = titleTokens(a)
  const tb = titleTokens(b)
  if (ta.size === 0 || tb.size === 0) return 0
  let inter = 0
  for (const t of ta) if (tb.has(t)) inter++
  const jaccard = inter / (ta.size + tb.size - inter)
  const minSize = Math.min(ta.size, tb.size)
  const containment = minSize >= 3 ? inter / minSize : 0
  return Math.max(jaccard, containment)
}

export const TITLE_MATCH_THRESHOLD = 0.5

// --- Non-destructive rescan reconciliation (pure planner) ---
//
// The plan/execute split keeps every reconciliation DECISION unit-testable:
// this function is pure; commitDraft just executes the returned plan.
//
// Policy: a task absent from one parse is NEVER deleted on that evidence alone
// (single-run absence is mostly sampling variance). It gets metadata.missed_scans
// incremented; deletion happens only after MISS_THRESHOLD consecutive absences,
// and never for a task the user has actually completed (those only flag).
// Any match resets the counter (the executor rewrites metadata on update).

export const MISS_THRESHOLD = 2

export type ReconcileExisting = {
  id: string
  title: string
  /** Stable key when stamped; null for legacy rows. */
  externalKey: string | null
  /** True → row predates external_key stamping (matched by title only). */
  isLegacy: boolean
  /** Consecutive scans this task has been absent from (metadata.missed_scans). */
  missedScans: number
  /** User has completed this task at least once → never auto-delete. */
  hasCompletions: boolean
}

export type ReconcilePlan = {
  /** incoming index → existing row to UPDATE in place. */
  matches: Array<{ incomingIndex: number; existingId: string; matchedBy: "key" | "fuzzy"; similarity: number }>
  /** incoming indexes with no counterpart → INSERT. */
  inserts: number[]
  /** existing rows absent this run → increment missed_scans (keep the task). */
  flags: Array<{ existingId: string; missedScans: number }>
  /** existing rows absent MISS_THRESHOLD+ consecutive runs, never completed → soft-delete. */
  deletes: string[]
}

export function planTaskReconciliation(
  itemUnitId: string,
  incomingTitles: string[],
  existing: ReconcileExisting[],
  opts?: { missThreshold?: number; similarityThreshold?: number }
): ReconcilePlan {
  const missThreshold = opts?.missThreshold ?? MISS_THRESHOLD
  const simThreshold = opts?.similarityThreshold ?? TITLE_MATCH_THRESHOLD

  const matches: ReconcilePlan["matches"] = []
  const matchedIncoming = new Set<number>()
  const matchedExisting = new Set<string>()

  // Pass 1 — exact key. Stamped rows match by externalKey; legacy rows by the
  // key their title would compute to (how they get reclaimed + stamped).
  const byKey = new Map<string, ReconcileExisting>()
  for (const ex of existing) {
    const key = ex.externalKey ?? extKey(itemUnitId, null, ex.title)
    if (!byKey.has(key)) byKey.set(key, ex)
  }
  incomingTitles.forEach((title, i) => {
    const ex = byKey.get(extKey(itemUnitId, null, title))
    if (ex && !matchedExisting.has(ex.id)) {
      matches.push({ incomingIndex: i, existingId: ex.id, matchedBy: "key", similarity: 1 })
      matchedIncoming.add(i)
      matchedExisting.add(ex.id)
    }
  })

  // Pass 2 — fuzzy, greedy highest-similarity first, one-to-one. Greedy order
  // matters: when both "…Door Gasket" and "…Door Glass" exist on both sides,
  // the exact/strong pairs claim each other before a weak cross-pair can.
  const pairs: Array<{ i: number; ex: ReconcileExisting; sim: number }> = []
  incomingTitles.forEach((title, i) => {
    if (matchedIncoming.has(i)) return
    for (const ex of existing) {
      if (matchedExisting.has(ex.id)) continue
      const sim = titleSimilarity(title, ex.title)
      if (sim >= simThreshold) pairs.push({ i, ex, sim })
    }
  })
  pairs.sort((a, b) => b.sim - a.sim)
  for (const p of pairs) {
    if (matchedIncoming.has(p.i) || matchedExisting.has(p.ex.id)) continue
    matches.push({ incomingIndex: p.i, existingId: p.ex.id, matchedBy: "fuzzy", similarity: p.sim })
    matchedIncoming.add(p.i)
    matchedExisting.add(p.ex.id)
  }

  const inserts = incomingTitles.map((_, i) => i).filter((i) => !matchedIncoming.has(i))

  const flags: ReconcilePlan["flags"] = []
  const deletes: string[] = []
  for (const ex of existing) {
    if (matchedExisting.has(ex.id)) continue
    const missed = ex.missedScans + 1
    if (missed >= missThreshold && !ex.hasCompletions) deletes.push(ex.id)
    else flags.push({ existingId: ex.id, missedScans: missed })
  }

  return { matches, inserts, flags, deletes }
}
