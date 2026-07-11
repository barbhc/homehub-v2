export type ChunkType = "care" | "how_to" | "troubleshooting" | "safety" | "specs"
export type CareType = "cleaning" | "maintenance" | "mixed"
export type PriorityTier = "essential" | "recommended" | "optional"
export type RiskLevel = "safety" | "prevent_damage" | "performance" | "comfort"
export type ScheduleType =
  | "after_each_use"
  | "weekly"
  | "monthly"
  | "quarterly"
  | "semiannual"
  | "annual"
  | "seasonal"
  | "every_n_days"
  | "as_needed"
  | "setup"

export interface PreviewChunk {
  chunk_type: ChunkType
  title: string | null
  content: string
  tags: string[]
  /** PDF page(s) this chunk came from; persisted so the manual link works. */
  source_pages?: number[] | null
  /** Variant tags (e.g. ["gas"]); [] = applies to all. Forwarded to save. */
  applies_to?: string[]
}

export interface PreviewSupply {
  name: string
  category: string
  part_number: string | null
}

export interface PreviewReCheckTrigger {
  /** Canonical symptom tag, or "" when the condition has no canonical match. */
  trigger: string
  description: string
  severity: string
}

export interface PreviewTask {
  title: string
  description: string | null
  care_type: CareType
  priority_tier: PriorityTier
  risk_level: RiskLevel
  estimated_minutes: number | null
  schedule_type: ScheduleType
  interval_days: number | null
  instructions_text: string | null
  /** PDF manual page this task's how-to came from; forwarded to save so the app
   *  can show a "From your manual · p.X" link. Null when unknown. */
  source_page?: number | null
  /** One-sentence "why this matters" — forwarded to save (task_template.justification). */
  justification?: string | null
  /** Canonical symptom tags — the Fix-flow integration key. */
  symptom_tags: string[]
  /** "Re-do if…" conditions (setup tasks today; reactive tasks in a later phase). */
  re_check_triggers: PreviewReCheckTrigger[]
  /** Per-task parse confidence 0–1 ("Sort it right" review). Low → "Check this". */
  confidence?: number | null
  /** Variant tags this task is specific to; [] = all configs. Forwarded to save. */
  applies_to?: string[]
  /** Cited supplies for the "You'll need" chips; [] = none. Forwarded to save. */
  supplies?: PreviewSupply[]
}

export interface PreviewResult {
  ok: true
  chunks: PreviewChunk[]
  tasks: PreviewTask[]
}
