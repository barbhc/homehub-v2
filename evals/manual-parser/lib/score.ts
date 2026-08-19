/**
 * Scoring an extraction against hand-authored expectations.
 *
 * Pure — no Firestore, no Anthropic, no filesystem — so it is unit-tested by
 * the root vitest run and so `--offline` can re-score a committed run at zero
 * cost. Nothing here reads the PDF: a change in pdfjs, or a corpus PDF being
 * re-uploaded, cannot move a score.
 *
 * WHY EXPECTATIONS AND NOT A SNAPSHOT DIFF. The pre-existing harness
 * (scripts/parse-eval) diffs each run against the PREVIOUS run's output. That
 * answers "did the output change?", which is useful, but it cannot answer "is
 * the output any good?" — and a snapshot happily baselines a regression the
 * moment someone runs --update-golden on a bad day. These expectations were
 * written by reading the actual manuals, so a score here means the extraction
 * agrees with the document, not merely with its own past self.
 */

export interface Expectation {
  id: string
  title_matches?: string[]
  care_type?: string | string[]
  cadence?: string[]
  cadence_not?: string[]
  where?: "recurring" | "any"
  why: string
}

export interface SafetyExpectation {
  id: string
  matches: string[]
  in?: string[]
  why: string
}

export interface ForbiddenInstruction {
  id: string
  matches: string[]
  why: string
}

export interface Expectations {
  name: string
  appliance: string
  doc_type?: string
  structural_only?: boolean
  must_have?: Expectation[]
  should_have?: Expectation[]
  must_not_have?: Expectation[]
  safety_expectations?: SafetyExpectation[]
  forbidden_instructions?: ForbiddenInstruction[]
  bounds?: {
    min_tasks?: number
    max_tasks?: number
    max_essential?: number
    max_essential_share?: number
  }
}

export interface RawTask {
  title?: string
  schedule_type?: string
  priority_tier?: string
  care_type?: string
  instructions_text?: string
  justification?: string
  description?: string
  estimated_minutes?: number
  source_page?: number
}
export interface RawChunk {
  title?: string
  chunk_type?: string
  content?: string
  source_pages?: unknown[]
}
export interface Extraction {
  chunks?: RawChunk[]
  tasks?: RawTask[]
  confidence?: { overall?: number } | null
  /** Set by the runner when the response hit max_tokens. */
  truncated?: boolean
}

export const VALID_SCHEDULES = new Set([
  "after_each_use", "weekly", "monthly", "quarterly", "semiannual",
  "annual", "seasonal", "every_n_days", "as_needed", "setup",
])

/** Lowercase, collapse punctuation to spaces. Titles are matched on this. */
export function norm(s: string | undefined): string {
  return (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim()
}

function anyMatch(patterns: string[] | undefined, text: string): boolean {
  if (!patterns?.length) return false
  return patterns.some((p) => new RegExp(p, "i").test(text))
}

/** Every task whose TITLE matches the expectation's patterns. */
function findTasks(tasks: RawTask[], e: Expectation): RawTask[] {
  return tasks.filter((t) => anyMatch(e.title_matches, norm(t.title)))
}

/** One dimension's contribution. `possible: 0` means "not applicable here". */
export interface Dimension {
  earned: number
  possible: number
  detail: string[]
}

const empty = (): Dimension => ({ earned: 0, possible: 0, detail: [] })

/** Did the extraction contain each thing the manual actually says? */
export function scoreRecall(tasks: RawTask[], exp: Expectations): Dimension {
  const d = empty()
  for (const e of exp.must_have ?? []) {
    d.possible++
    if (findTasks(tasks, e).length > 0) d.earned++
    else d.detail.push(`MISSING must-have "${e.id}" — ${e.why}`)
  }
  return d
}

/** Did it stay out of the things that are operation, config or unboxing? */
export function scorePrecision(tasks: RawTask[], exp: Expectations): Dimension {
  const d = empty()
  for (const e of exp.must_not_have ?? []) {
    d.possible++
    const hits = findTasks(tasks, e).filter(
      // `where: "recurring"` means the thing is legitimate AS A SETUP TASK and
      // only wrong on a calendar — e.g. a commissioning gas-leak test.
      (t) => e.where !== "recurring" || t.schedule_type !== "setup",
    )
    if (hits.length === 0) d.earned++
    else d.detail.push(`FORBIDDEN "${e.id}" present as ${hits.map((t) => `"${t.title}"`).join(", ")} — ${e.why}`)
  }
  return d
}

/**
 * Of the must-haves that WERE found, did they keep the manufacturer's cadence?
 *
 * Scored only over found tasks on purpose: a missing task is already counted
 * once against recall, and counting it again here would make one failure look
 * like two and let a change that fixes cadence look like it fixed nothing.
 */
export function scoreCadence(tasks: RawTask[], exp: Expectations): Dimension {
  const d = empty()
  for (const e of exp.must_have ?? []) {
    if (!e.cadence && !e.cadence_not) continue
    const found = findTasks(tasks, e)
    if (!found.length) continue
    d.possible++
    const ok = found.some((t) => {
      const s = t.schedule_type ?? ""
      if (e.cadence && !e.cadence.includes(s)) return false
      if (e.cadence_not?.includes(s)) return false
      return true
    })
    if (ok) d.earned++
    else {
      const got = found.map((t) => `"${t.title}"=${t.schedule_type}`).join(", ")
      const want = e.cadence ? `one of ${e.cadence.join("|")}` : `anything but ${e.cadence_not!.join("|")}`
      d.detail.push(`CADENCE "${e.id}" is ${got}, expected ${want} — ${e.why}`)
    }
  }
  return d
}

/** care_type decides WHERE a task shows up, so a wrong one hides real work. */
export function scoreCareType(tasks: RawTask[], exp: Expectations): Dimension {
  const d = empty()
  for (const e of exp.must_have ?? []) {
    if (!e.care_type) continue
    const found = findTasks(tasks, e)
    if (!found.length) continue
    const want = Array.isArray(e.care_type) ? e.care_type : [e.care_type]
    d.possible++
    if (found.some((t) => want.includes(t.care_type ?? ""))) d.earned++
    else {
      const got = found.map((t) => `"${t.title}"=${t.care_type}`).join(", ")
      d.detail.push(`CARE_TYPE "${e.id}" is ${got}, expected ${want.join("|")} — ${e.why}`)
    }
  }
  return d
}

/** Essential is meant to be rare. This is the anti-inflation counter. */
export function scoreTier(tasks: RawTask[], exp: Expectations): Dimension {
  const d = empty()
  const b = exp.bounds
  if (!b || (b.max_essential === undefined && b.max_essential_share === undefined)) return d
  const essential = tasks.filter((t) => t.priority_tier === "essential")
  const share = tasks.length ? Math.round((essential.length / tasks.length) * 100) : 0

  if (b.max_essential !== undefined) {
    d.possible++
    if (essential.length <= b.max_essential) d.earned++
    else d.detail.push(`TIER ${essential.length} essential tasks, max ${b.max_essential}: ${essential.map((t) => `"${t.title}"`).join(", ")}`)
  }
  if (b.max_essential_share !== undefined) {
    d.possible++
    // A tiny task list can trip a share test on one task. Only apply the share
    // rule once there are enough tasks for a percentage to mean anything.
    if (tasks.length < 5 || share <= b.max_essential_share) d.earned++
    else d.detail.push(`TIER ${share}% essential, max ${b.max_essential_share}%`)
  }
  return d
}

/** Too few tasks is under-extraction; far too many is transcribing the manual. */
export function scoreVolume(tasks: RawTask[], exp: Expectations): Dimension {
  const d = empty()
  const b = exp.bounds
  if (!b) return d
  if (b.min_tasks !== undefined) {
    d.possible++
    if (tasks.length >= b.min_tasks) d.earned++
    else d.detail.push(`VOLUME ${tasks.length} tasks, expected at least ${b.min_tasks}`)
  }
  if (b.max_tasks !== undefined) {
    d.possible++
    if (tasks.length <= b.max_tasks) d.earned++
    else d.detail.push(`VOLUME ${tasks.length} tasks, expected at most ${b.max_tasks} — this manual does not contain that much upkeep`)
  }
  return d
}

/**
 * Two things at once, both about not hurting the reader:
 *   - the safety context the manual gives must survive somewhere, and
 *   - no task may instruct a homeowner to do professional-only work.
 * The second is the one with teeth. The prompt forbids hazardous DIY steps and
 * nothing measured whether it obeyed.
 */
export function scoreSafety(ext: Extraction, exp: Expectations): Dimension {
  const d = empty()
  const tasks = ext.tasks ?? []
  const chunks = ext.chunks ?? []

  for (const s of exp.safety_expectations ?? []) {
    d.possible++
    const haystacks: string[] = []
    const where = s.in ?? ["chunks", "justification"]
    if (where.includes("chunks")) haystacks.push(chunks.map((c) => `${c.title ?? ""} ${c.content ?? ""}`).join(" "))
    if (where.includes("justification")) haystacks.push(tasks.map((t) => `${t.justification ?? ""} ${t.description ?? ""}`).join(" "))
    if (anyMatch(s.matches, haystacks.join(" ").toLowerCase())) d.earned++
    else d.detail.push(`SAFETY context "${s.id}" absent — ${s.why}`)
  }

  for (const f of exp.forbidden_instructions ?? []) {
    d.possible++
    const offenders = tasks.filter((t) => anyMatch(f.matches, (t.instructions_text ?? "").toLowerCase()))
    if (!offenders.length) d.earned++
    else d.detail.push(`HAZARDOUS DIY "${f.id}" in ${offenders.map((t) => `"${t.title}"`).join(", ")} — ${f.why}`)
  }
  return d
}

/** The floor: a commitable extraction with the fields the app needs. */
export function scoreStructure(ext: Extraction): Dimension {
  const d = empty()
  const tasks = ext.tasks ?? []
  const chunks = ext.chunks ?? []

  const checks: [string, boolean, string][] = [
    ["arrays", Array.isArray(ext.tasks) && Array.isArray(ext.chunks), "chunks/tasks must both be arrays — commitDraft refuses otherwise"],
    ["not-truncated", ext.truncated !== true, "response hit max_tokens; the tail of the extraction was silently lost"],
    ["has-chunks", chunks.length > 0, "no knowledge chunks at all"],
    ["valid-schedules", tasks.length > 0 && tasks.every((t) => VALID_SCHEDULES.has(t.schedule_type ?? "")), "every task needs a schedule_type from the enum"],
    ["instructions", tasks.length > 0 && tasks.every((t) => (t.instructions_text ?? "").length > 10), "every task needs usable instructions"],
    ["justification", tasks.length > 0 && tasks.every((t) => (t.justification ?? "").length > 5), "justification is user-facing 'why this matters' copy"],
    // A source_page is what lets the app open the manual at the right page.
    // Bounded because a hallucinated 9999 is worse than a missing number.
    ["source-page", tasks.length > 0 && tasks.every((t) => typeof t.source_page === "number" && t.source_page >= 1 && t.source_page <= 999), "every task needs a plausible source_page"],
    ["chunk-pages", chunks.length > 0 && chunks.every((c) => Array.isArray(c.source_pages) && c.source_pages.length > 0), "every chunk needs source_pages"],
  ]
  for (const [id, ok, why] of checks) {
    d.possible++
    if (ok) d.earned++
    else d.detail.push(`STRUCTURE ${id} — ${why}`)
  }
  return d
}

/** How much of the soft, nice-to-have coverage landed. Reported, not scored. */
export function scoreShould(tasks: RawTask[], exp: Expectations): Dimension {
  const d = empty()
  for (const e of exp.should_have ?? []) {
    d.possible++
    if (findTasks(tasks, e).length > 0) d.earned++
    else d.detail.push(`(soft) missing "${e.id}" — ${e.why}`)
  }
  return d
}

/**
 * Weights. Recall and precision carry more than half the score between them
 * because they are the two failures that ACTUALLY happened in this product: a
 * filter task quietly disappearing, and "Add Detergent Before Each Cycle"
 * appearing as a reminder. Everything else is real but secondary.
 */
export const WEIGHTS = {
  recall: 30,
  precision: 25,
  cadence: 15,
  careType: 10,
  safety: 8,
  structure: 7,
  tier: 3,
  volume: 2,
} as const

export type DimensionName = keyof typeof WEIGHTS

export interface ManualScore {
  name: string
  appliance: string
  /** 0-100, weights renormalised over the dimensions that apply here. */
  score: number
  dimensions: Record<DimensionName, Dimension>
  should: Dimension
  taskCount: number
  chunkCount: number
  failures: string[]
}

export function scoreManual(ext: Extraction, exp: Expectations): ManualScore {
  const tasks = Array.isArray(ext.tasks) ? ext.tasks : []
  const chunks = Array.isArray(ext.chunks) ? ext.chunks : []

  const dimensions: Record<DimensionName, Dimension> = {
    recall: scoreRecall(tasks, exp),
    precision: scorePrecision(tasks, exp),
    cadence: scoreCadence(tasks, exp),
    careType: scoreCareType(tasks, exp),
    safety: scoreSafety(ext, exp),
    structure: scoreStructure(ext),
    tier: scoreTier(tasks, exp),
    volume: scoreVolume(tasks, exp),
  }

  // Renormalise over applicable dimensions. A manual with no cadence
  // expectations must not be scored out of a total that included them —
  // otherwise the image-only manual, which can assert almost nothing, would
  // read as a permanent failure and drag the corpus average somewhere
  // meaningless.
  let earned = 0
  let possible = 0
  for (const [name, dim] of Object.entries(dimensions) as [DimensionName, Dimension][]) {
    if (dim.possible === 0) continue
    const w = WEIGHTS[name]
    earned += (dim.earned / dim.possible) * w
    possible += w
  }

  return {
    name: exp.name,
    appliance: exp.appliance,
    score: possible === 0 ? 0 : Math.round((earned / possible) * 1000) / 10,
    dimensions,
    should: scoreShould(tasks, exp),
    taskCount: tasks.length,
    chunkCount: chunks.length,
    failures: (Object.values(dimensions) as Dimension[]).flatMap((d) => d.detail),
  }
}

/** Corpus score = the mean of the per-manual scores (each manual counts once,
 *  regardless of how many expectations it happens to carry). */
export function corpusScore(scores: ManualScore[]): number {
  if (!scores.length) return 0
  return Math.round((scores.reduce((n, s) => n + s.score, 0) / scores.length) * 10) / 10
}
