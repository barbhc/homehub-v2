/**
 * CHO Data Model v1.1 — TypeScript types
 * Generated from supabase/migrations/20260228000000_cho_data_model_v1_1.sql
 *
 * Regenerate from live DB when possible:
 *   npx supabase gen types typescript --project-id YOUR_PROJECT_ID > src/integrations/supabase/types.ts
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface DiagramPageRef {
  page: number
  caption: string
  crop?: { x: number; y: number; w: number; h: number }
}

export interface ScenarioStep {
  condition: string
  steps: string[]
}

export interface TableData {
  table_title: string
  columns: string[]
  rows: string[][]
}

export interface ParseConfidence {
  overall: number
  safety: number
  how_to: number
  care: number
  troubleshooting: number
  notes: string
}

export interface DiagramImageUrl {
  url: string
  page: number
  caption: string
}

// CHO enum types
export type ItemUnitStatus = "active" | "stored" | "sold" | "removed"
export type ManualSourceType = "upload" | "url" | "email"
export type ManualRole = "primary" | "reference"
export type ChunkType =
  | "care"
  | "how_to"
  | "troubleshooting"
  | "safety"
  | "specs"
  | "warranty"
  | "cleaning_guide"
  | "reference"
export type ContentLevel = "critical" | "important" | "contextual" | "reference" | "everyday"
export type ManualEntityType = "part" | "error_code" | "mode" | "component" | "button"
export type ScopeType = "home" | "item_unit"
export type CareType = "cleaning" | "maintenance" | "mixed"
export type PriorityTier = "essential" | "recommended" | "optional"
export type RiskLevel = "safety" | "prevent_damage" | "performance" | "comfort"
/** One "you'll need" row inlined on a task template. `part_number` comes from
 *  the parse; `url`/`size`/`buy_ahead` are user-entered (round 19) and written
 *  only by `updateTaskSupply` — the parse path never invents them. */
export type TemplateSupply = {
  name: string
  category: string
  part_number: string | null
  /** Plain retailer link — any store, never Amazon-assumed. */
  url: string | null
  size: string | null
  buy_ahead: boolean
}

export type SuppliesMode = "none" | "suggested" | "required"
export type TaskSource = "manual" | "user" | "cho_generated"
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
  /**
   * Install-time setup task. Done once when the appliance is added; re-checked
   * only on disturbance (item moved/reinstalled) or when a `re_check_triggers`
   * symptom is reported. Routes to the Setup Checklist surface on item detail,
   * NOT the recurring task feed. See `task_template.re_check_triggers`.
   */
  | "setup"
export type Season = "spring" | "summer" | "fall" | "winter"
export type TaskInstanceStatus = "scheduled" | "done" | "skipped" | "snoozed"
export type SupplyCategory = "filter" | "battery" | "cleaner" | "accessory" | "other"
export type SupplyOptionType = "oem" | "compatible" | "search"
export type CleaningSessionTaskStatus = "selected" | "done" | "skipped"
export type TroubleshootingCaseStatus = "open" | "resolved" | "escalated" | "closed"
export type TroubleshootingStepSource = "manual" | "web"
export type UserFeedback = "helpful" | "not_helpful" | "unknown"
export type HomeMemberRole = "owner" | "admin" | "member" | "guest"
export type RecallStatus = "none_found" | "found" | "unknown"
export type CareNoteScope = "home" | "room" | "item_unit"
export type CareNoteSource = "user" | "ai" | "url"

// Legacy (profiles)
export type PropertyType = "house" | "condo" | "apartment" | "townhouse"
export type UserRole = "owner" | "admin" | "member" | "guest"
export type ItemStatus = "owned" | "sold" | "donated" | "disposed"
export type MaintenanceFreqUnit = "days" | "weeks" | "months" | "years"
export type MaintenancePriority = "low" | "medium" | "high" | "critical"
export type DocCategory = "manual" | "receipt" | "warranty" | "photo" | "other"

/** Postgres enum `item_category` — inventory top-level category */
export type ItemCategory =
  | "major_appliance"
  | "small_appliance"
  | "fixture"
  | "system"
  | "structure"
  | "outdoor"
  | "furniture"
  | "media"
  | "smart_home"

export interface Database {
  public: {
    Tables: {
      profiles: { Row: Profile; Insert: ProfileInsert; Update: Partial<Profile> }
      home: { Row: Home; Insert: HomeInsert; Update: Partial<Home> }
      home_members: { Row: HomeMember; Insert: HomeMemberInsert; Update: Partial<HomeMember> }
      home_invite: { Row: HomeInvite; Insert: HomeInviteInsert; Update: Partial<HomeInvite> }
      room: { Row: Room; Insert: RoomInsert; Update: Partial<Room> }
      item_unit: { Row: ItemUnit; Insert: ItemUnitInsert; Update: Partial<ItemUnit> }
      manual_document: { Row: ManualDocument; Insert: ManualDocumentInsert; Update: Partial<ManualDocument> }
      knowledge_chunk: { Row: KnowledgeChunk; Insert: KnowledgeChunkInsert; Update: Partial<KnowledgeChunk> }
      chat_faq: { Row: ChatFaq; Insert: ChatFaqInsert; Update: Partial<ChatFaq> }
      manual_entity: { Row: ManualEntity; Insert: ManualEntityInsert; Update: Partial<ManualEntity> }
      task_template: { Row: TaskTemplate; Insert: TaskTemplateInsert; Update: Partial<TaskTemplate> }
      schedule_rule: { Row: ScheduleRule; Insert: ScheduleRuleInsert; Update: Partial<ScheduleRule> }
      task_instance: { Row: TaskInstance; Insert: TaskInstanceInsert; Update: Partial<TaskInstance> }
      supply_item: { Row: SupplyItem; Insert: SupplyItemInsert; Update: Partial<SupplyItem> }
      shopping_list_item: { Row: ShoppingListItem; Insert: ShoppingListItemInsert; Update: Partial<ShoppingListItem> }
      supply_option: { Row: SupplyOption; Insert: SupplyOptionInsert; Update: Partial<SupplyOption> }
      task_template_supply: {
        Row: TaskTemplateSupply
        Insert: TaskTemplateSupplyInsert
        Update: Partial<TaskTemplateSupply>
      }
      cleaning_session: { Row: CleaningSession; Insert: CleaningSessionInsert; Update: Partial<CleaningSession> }
      cleaning_session_task: {
        Row: CleaningSessionTask
        Insert: CleaningSessionTaskInsert
        Update: Partial<CleaningSessionTask>
      }
      troubleshooting_case: {
        Row: TroubleshootingCase
        Insert: TroubleshootingCaseInsert
        Update: Partial<TroubleshootingCase>
      }
      troubleshooting_step: {
        Row: TroubleshootingStep
        Insert: TroubleshootingStepInsert
        Update: Partial<TroubleshootingStep>
      }
      web_retrieval: { Row: WebRetrieval; Insert: WebRetrievalInsert; Update: Partial<WebRetrieval> }
      care_note: { Row: CareNote; Insert: CareNoteInsert; Update: Partial<CareNote> }
      task_tier_change_log: {
        Row: TierChangeLog
        Insert: TierChangeLogInsert
        Update: Partial<TierChangeLog>
      }
    }
  }
}

export interface CareNote {
  note_id: string
  home_id: string
  room_id: string | null
  item_unit_id: string | null
  scope: CareNoteScope
  category: string | null
  chunk_type: "care" | "how_to" | "troubleshooting"
  title: string | null
  content: string
  source: CareNoteSource
  source_url: string | null
  task_template_id: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface CareNoteInsert {
  home_id: string
  room_id?: string | null
  item_unit_id?: string | null
  scope: CareNoteScope
  category?: string | null
  chunk_type?: "care" | "how_to" | "troubleshooting"
  title?: string | null
  content: string
  source?: CareNoteSource
  source_url?: string | null
  task_template_id?: string | null
}

// Profiles (auth extension)
export interface Profile {
  id: string
  full_name: string | null
  avatar_url: string | null
  created_at: string
  updated_at: string
}
export type ProfileInsert = Omit<Profile, "created_at" | "updated_at">

// CHO tables
export interface Home {
  home_id: string
  name: string
  timezone: string
  created_at: string
  updated_at: string
  deleted_at: string | null
}
export type HomeInsert = Omit<Home, "home_id" | "created_at" | "updated_at">

export interface HomeMember {
  home_id: string
  user_id: string
  role: HomeMemberRole
  is_primary: boolean
}
export type HomeMemberInsert = HomeMember

export interface HomeInvite {
  invite_id: string
  home_id: string
  token: string
  role: string
  created_by: string
  accepted_by: string | null
  accepted_at: string | null
  expires_at: string
  created_at: string
}
export type HomeInviteInsert = Pick<HomeInvite, "home_id" | "created_by" | "role">

export interface Room {
  room_id: string
  home_id: string
  name: string
  created_at: string
  updated_at: string
  deleted_at: string | null
}
export type RoomInsert = Omit<Room, "room_id" | "created_at" | "updated_at">

export interface ItemUnit {
  item_unit_id: string
  home_id: string
  room_id: string | null
  display_name: string
  category: string
  item_category: ItemCategory | null
  sub_type: string | null
  category_fields: Json | null
  brand: string | null
  model: string | null
  serial_number: string | null
  purchase_date: string | null
  install_date: string | null
  status: ItemUnitStatus
  notes: string | null
  photo_storage_ref: string | null
  store_name: string | null
  price_paid: number | null
  receipt_storage_path: string | null
  warranty_duration_months: number | null
  warranty_coverage: string | null
  warranty_expiry_date: string | null
  manufactured_year: number | null
  recall_status: RecallStatus | null
  recall_checked_at: string | null
  recall_notes: string | null
  tags: string[]
  /** Set when the user marks "I just installed this" — opens the Setup Checklist expanded.
   *  Optional: absent on synthetic/preview objects and queries that don't select it. */
  setup_revealed_at?: string | null
  /** Variant config (e.g. ["gas"], ["steam"]); filters tasks/chunks by applies_to. */
  variant_tags?: string[]
  /** Warranty redesign (Q7) — structured coverage facts. Optional: absent on
   *  synthetic/preview objects and queries that don't select them. */
  warranty_exclusions?: string[]
  warranty_registration_required?: boolean | null
  warranty_registration_url?: string | null
  warranty_contact?: string | null
  warranty_registered_at?: string | null
  /** Product-lookup spec suggestions awaiting the user's Add, written by the
   *  post-create background lookup (round 18 — the lookup left the add screen).
   *  Never auto-applied; the item page renders each inline on its own field.
   *  Optional: absent on items predating the move and on synthetic objects. */
  lookup_suggestions?: { key: string; label: string; value: string | number | boolean }[] | null
  /** "Hide them" on the item page's provenance line — stamps the dismissal so
   *  suggestions never come back on this item. */
  lookup_dismissed_at?: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}
export type ItemUnitInsert = Omit<
  ItemUnit,
  | "item_unit_id" | "created_at" | "updated_at" | "setup_revealed_at" | "variant_tags"
  | "warranty_exclusions" | "warranty_registration_required" | "warranty_registration_url"
  | "warranty_contact" | "warranty_registered_at"
  | "lookup_suggestions" | "lookup_dismissed_at"
>

export interface ServiceProvider {
  provider_id: string
  home_id: string
  name: string
  category: string
  phone: string | null
  email: string | null
  website: string | null
  notes: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface ManualDocument {
  manual_id: string
  item_unit_id: string
  title: string
  label: string | null
  source_type: ManualSourceType
  source_ref: string
  role: ManualRole
  version: string | null
  language: string | null
  parsed_at: string | null
  /** Live worker stage (queued…done|error), or null for pre-parse-era docs.
   *  HH-87: parsed_at alone conflates "no manual" with "manual mid-parse". */
  parse_stage: string | null
  parse_draft: Json | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}
export type ManualDocumentInsert = Omit<ManualDocument, "manual_id" | "created_at" | "updated_at">

export interface KnowledgeChunk {
  chunk_id: string
  manual_id: string
  chunk_type: ChunkType
  content_level: ContentLevel | null
  title: string | null
  content: string
  tags: Json
  scenarios: ScenarioStep[] | null
  source_pages: number[] | null
  metadata: Json
  /** Section-aware parser fields (migration 20260626000002). Optional: absent on
   *  synthetic/preview objects and queries that don't select them. */
  section_category?: string | null
  applies_to?: string[]
  external_key?: string | null
  embedding_ref: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}
export type KnowledgeChunkInsert = Omit<
  KnowledgeChunk,
  "chunk_id" | "created_at" | "updated_at" | "section_category" | "applies_to" | "external_key"
>

export interface ChatFaq {
  faq_id: string
  home_id: string
  item_unit_id: string | null
  question: string
  answer: string
  created_at: string
}
export type ChatFaqInsert = Omit<ChatFaq, "faq_id" | "created_at">

export interface ManualEntity {
  entity_id: string
  manual_id: string
  entity_type: ManualEntityType
  name: string
  value: string | null
  metadata: Json
  created_at: string
  updated_at: string
  deleted_at: string | null
}
export type ManualEntityInsert = Omit<ManualEntity, "entity_id" | "created_at" | "updated_at">

export interface TaskTemplate {
  task_template_id: string
  home_id: string
  room_id: string | null
  scope_type: ScopeType
  item_unit_id: string | null
  title: string
  description: string | null
  care_type: CareType
  /** Set when the user manually re-classifies care_type via the UI; rescans must not overwrite when non-null. */
  care_type_overridden_at: string | null
  /** One-sentence consequence of skipping; populated by parse-manual, surfaces as "Why this matters" copy. */
  justification: string | null
  /**
   * Canonical symptom tags from `src/lib/symptomTaxonomy.ts`. Joins setup
   * tasks ↔ maintenance tasks ↔ knowledge chunks for the Phase 4b
   * troubleshooting flow. Empty array when no symptoms apply.
   */
  symptom_tags: string[]
  /**
   * "Re-do if…" triggers for setup tasks. Each entry references a canonical
   * symptom tag plus user-facing description and severity. Empty array for
   * non-setup tasks. See ReCheckTrigger type in `src/lib/symptomTaxonomy.ts`.
   */
  re_check_triggers: Json
  priority_tier: PriorityTier
  /**
   * Whether this task reminds the user when it comes due. Independent of
   * priority_tier: any scheduled task can carry a reminder. `null` (the state of
   * every task written before this field existed) means the user never chose,
   * so `willNotify` in shared/tasks/reviewBuckets applies the tier default.
   */
  remind_enabled?: boolean | null
  /** The template's own cadence, as stored (parse-written; `setTaskCadence`
   *  rewrites it). Exposed so a surface can tell a recurring task from a tip
   *  or a setup step WITHOUT a taskInstances read — the pick list on
   *  /reminders was offering "Allow Motor to Cool After Overload" as a
   *  reminder because it couldn't. Optional: older constructors omit it. */
  schedule?: { scheduleType: ScheduleType; intervalDays: number | null } | null
  risk_level: RiskLevel
  estimated_minutes: number | null
  /** Default assignee inherited by generated occurrences (Phase 3); guarded to home_members. */
  default_assignee: string | null
  instructions_chunk_id: string | null
  instructions_override: string | null
  /** Ordered plain-language how-to steps (migration 20260630000001). Absent on
   *  queries that don't select it; null → derive from instructions_override. */
  steps?: string[] | null
  /** PDF manual page this task's how-to came from (migration 20260701000001).
   *  Absent on queries that don't select it; null when unknown. */
  source_page?: number | null
  supplies_mode: SuppliesMode
  /** Inlined parse supplies (commitDraft), extended round 19 with the user-
   *  entered retailer link, size, and buy-ahead flag. Legacy rows carry only
   *  the first three fields; the mapper defaults the rest. */
  supplies: TemplateSupply[]
  source: TaskSource
  is_user_editable: boolean
  user_modified_at: string | null
  is_active: boolean
  metadata: Json
  /** Section-aware parser fields (migration 20260626000002). manual_id scopes
   *  rescan reconciliation; external_key is the idempotent rescan key. Optional:
   *  absent on synthetic/preview objects and queries that don't select them. */
  section_category?: string | null
  applies_to?: string[]
  external_key?: string | null
  manual_id?: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}
export type TaskTemplateInsert = Omit<
  TaskTemplate,
  "task_template_id" | "created_at" | "updated_at" | "section_category" | "applies_to" | "external_key" | "manual_id"
>

export interface TierChangeLog {
  id: string
  task_template_id: string
  home_id: string
  changed_by: string
  old_tier: PriorityTier
  new_tier: PriorityTier
  source: string
  created_at: string
}
export type TierChangeLogInsert = Omit<TierChangeLog, "id" | "created_at">

export interface ScheduleRule {
  schedule_rule_id: string
  task_template_id: string
  schedule_type: ScheduleType
  interval_days: number | null
  anchor_date: string | null
  season: Season | null
  window_days_before: number
  window_days_after: number
  created_at: string
  updated_at: string
  deleted_at: string | null
}
export type ScheduleRuleInsert = Omit<ScheduleRule, "schedule_rule_id" | "created_at" | "updated_at">

export interface TaskInstance {
  task_instance_id: string
  home_id: string
  task_template_id: string
  item_unit_id: string | null
  status: TaskInstanceStatus
  due_date: string
  window_start: string | null
  window_end: string | null
  snoozed_until: string | null
  priority_score: number
  is_safety_critical: boolean
  completed_at: string | null
  completion_notes: string | null
  completion_photos: Json
  /** Home member this occurrence is assigned to (Phase 3); guarded to home_members. */
  assigned_to: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}
export type TaskInstanceInsert = Omit<TaskInstance, "task_instance_id" | "created_at" | "updated_at">

export interface SupplyItem {
  supply_item_id: string
  name: string
  category: SupplyCategory
  oem_part_number: string | null
  brand: string | null
  model: string | null
  spec: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}
export type SupplyItemInsert = Omit<SupplyItem, "supply_item_id" | "created_at" | "updated_at">

export type ShoppingStatus = "needed" | "have" | "bought"
export interface ShoppingListItem {
  id: string
  home_id: string
  supply_item_id: string | null
  name: string
  quantity: string | null
  status: ShoppingStatus
  source_task_instance_id: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}
export type ShoppingListItemInsert = Omit<ShoppingListItem, "id" | "created_at" | "updated_at">

export interface SupplyOption {
  supply_option_id: string
  supply_item_id: string
  option_type: SupplyOptionType
  seller: string | null
  url: string | null
  is_preferred: boolean
  notes: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}
export type SupplyOptionInsert = Omit<SupplyOption, "supply_option_id" | "created_at" | "updated_at">

export interface TaskTemplateSupply {
  task_template_supply_id: string
  task_template_id: string
  supply_item_id: string
  quantity: string | null
  notes: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}
export type TaskTemplateSupplyInsert = Omit<
  TaskTemplateSupply,
  "task_template_supply_id" | "created_at" | "updated_at"
>

export interface CleaningSession {
  session_id: string
  home_id: string
  room_id: string | null
  name: string | null
  started_at: string | null
  ended_at: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}
export type CleaningSessionInsert = Omit<CleaningSession, "session_id" | "created_at" | "updated_at">

export interface CleaningSessionTask {
  session_task_id: string
  session_id: string
  task_instance_id: string | null
  task_template_id: string | null
  status: CleaningSessionTaskStatus
  completed_at: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}
export type CleaningSessionTaskInsert = Omit<
  CleaningSessionTask,
  "session_task_id" | "created_at" | "updated_at"
>

export interface TroubleshootingCase {
  case_id: string
  home_id: string
  item_unit_id: string
  user_report: string
  symptoms: Json | null
  status: TroubleshootingCaseStatus
  resolution_summary: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}
export type TroubleshootingCaseInsert = Omit<
  TroubleshootingCase,
  "case_id" | "created_at" | "updated_at"
>

export interface TroubleshootingStep {
  step_id: string
  case_id: string
  source: TroubleshootingStepSource
  knowledge_chunk_id: string | null
  web_source_url: string | null
  content: string
  user_feedback: UserFeedback | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}
export type TroubleshootingStepInsert = Omit<TroubleshootingStep, "step_id" | "created_at" | "updated_at">

export interface WebRetrieval {
  web_retrieval_id: string
  query: string
  results: Json
  created_at: string
  updated_at: string
  deleted_at: string | null
}
export type WebRetrievalInsert = Omit<WebRetrieval, "web_retrieval_id" | "created_at" | "updated_at">

// Legacy type aliases (for backward compat during migration - old tables dropped)
export type Property = { id: string; name: string; type?: string; address?: string | null; created_at?: string; updated_at?: string }
export type PropertyMember = { property_id: string; user_id: string; role: string; is_primary: boolean }
export type Location = { id: string; property_id: string; name: string; created_at?: string }
export type Category = { id: string; property_id: string; name: string; is_default?: boolean; created_at?: string }
export type Item = {
  id: string
  property_id: string
  location_id: string | null
  category_id: string | null
  item_category: ItemCategory | null
  sub_type: string | null
  category_fields: Json | null
  name: string
  brand: string | null
  model: string | null
  serial_number: string | null
  purchase_date: string | null
  purchase_price: number | null
  store_name: string | null
  warranty_expiration_date: string | null
  notes: string | null
  status: ItemStatus
  specs: Json | null
  created_at: string
  updated_at: string
  archived_at: string | null
}
