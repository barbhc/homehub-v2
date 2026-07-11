# Firestore data model (v2)

**This document is the coding contract for Phases 3–6.** It maps every v1 Supabase
(Postgres) table to its Firestore home, records every read-model join and its v2
composition, and freezes the parse state-machine contract. `firestore.rules`,
`firestore.indexes.json`, and the Phase 5 service swap all derive from here. When v1
and this doc disagree, this doc wins for v2 — but any behavioral divergence from v1 is
called out explicitly under **Divergences from v1** so nothing drifts silently.

Source of truth for v1: `../homehub/src/integrations/supabase/types.ts` (curated) +
`../homehub/supabase/migrations/*`. The curated type NAMES are preserved verbatim in
`src/integrations/types.ts` (see CLAUDE.md) so components don't change in Phase 5.

---

## 0. Conventions

- **Field naming:** Firestore docs use **camelCase** (`itemUnitId`, `dueDate`,
  `priorityTier`). v1 snake_case (`item_unit_id`, `due_date`) maps 1:1. The Phase 5
  service layer does the case translation at the edge; component-facing types keep the
  v1 shapes (`src/integrations/types.ts`), so mapping lives only in each service.
- **IDs:** v1 UUID PKs become Firestore document IDs (the `*_id` column is the doc id, not
  a stored field — except where a child needs to reference itself for a collection-group
  query, noted inline). The import (Phase 6) **preserves v1 UUIDs as doc IDs** so storage
  paths and cross-references survive unchanged.
- **Timestamps vs. calendar dates — two representations, deliberately:**
  - **Instants** (a moment in time) are stored as Firestore `Timestamp`: `createdAt`, `updatedAt`,
    `completedAt`, `parsedAt`, `parse.stageAt`, `recallCheckedAt`, `startedAt`/`endedAt`,
    `acceptedAt`, `expiresAt`, `userModifiedAt`, `careTypeOverriddenAt`, `setupRevealedAt`,
    `warrantyRegisteredAt`. Services convert to/from ISO strings at the edge (v1 components
    traffic in ISO strings).
  - **Calendar dates** (a day, no time/zone) stay **`"YYYY-MM-DD"` strings**, exactly as v1's
    Postgres `date` columns: `dueDate`, `windowStart`/`windowEnd`, `snoozedUntil`, `purchaseDate`,
    `installDate`, `anchorDate`, `warrantyExpiryDate`. This is what keeps the `SEED_TODAY` agenda/
    overdue math and the visual baselines deterministic (string date comparison, no TZ drift) and
    matches how components already consume these fields. **The emulator seed and the Phase 6 import
    both follow this split; the Phase 5 services read to it.**
  - `createdAt`/`updatedAt` on every doc.
- **Soft delete:** every soft-deletable collection carries `deletedAt: Timestamp | null`.
  **Always write `null`, never omit** — every list query filters `deletedAt == null`, and
  Firestore only matches `== null` when the field is present. Hard deletes are reserved for
  knowledge chunks on re-parse (§7) and are the only place docs are physically removed.
- **Tenancy = path.** Home-scoped data lives UNDER `homes/{homeId}/…`. A query on a
  subcollection is therefore already home-scoped — `homeId` is **not** a query field in v2
  (it was the primary RLS filter in v1). This shrinks every composite index by one column.
  Only genuinely global data (`supplyCatalog`, `webRetrievals`, caches) sits at the root.
- **Joins move to the service layer.** Firestore has no server joins. Hot display fields are
  **denormalized** onto the reading doc (see §5 for the exact set, derived query-by-query);
  cold/detail fields are fetched with a follow-up `get()` in the service. Rules do auth +
  shape only — **never joins** (§6).

---

## 1. Collection tree

```
users/{uid}                         ← v1 profiles + user_preferences (merged; self-owned)
  private/{docId}                    ← preferences, fcmTokens (self-only subtree)

homes/{homeId}                       ← home
  members/{uid}                      ← home_members (composite PK → uid is the doc id)
  invites/{inviteId}                 ← home_invite
  rooms/{roomId}                     ← room
  items/{itemUnitId}                 ← item_unit  (photoPath = photo_storage_ref)
  manuals/{manualId}                 ← manual_document  (+ parse state machine, §8)
    chunks/{chunkId}                 ← knowledge_chunk  (hard-delete+reinsert on re-parse)
    entities/{entityId}              ← manual_entity
  taskTemplates/{tplId}              ← task_template + schedule_rule (inlined) +
                                        task_template_supply (inlined supplies[])
  taskInstances/{instId}             ← task_instance  (+ denormalized display fields, §5)
  careNotes/{noteId}                 ← care_note
  chatFaqs/{faqId}                   ← chat_faq
  chatConversations/{conversationId} ← conversation
    messages/{messageId}             ← conversation_message
  cleaningSessions/{sessionId}       ← cleaning_session
    tasks/{sessionTaskId}            ← cleaning_session_task
  shoppingList/{itemId}              ← shopping_list_item
  troubleshootingCases/{caseId}      ← troubleshooting_case
    steps/{stepId}                   ← troubleshooting_step
  tierChangeLog/{id}                 ← task_tier_change_log
  serviceProviders/{providerId}      ← service_provider (type exists in v1; import if present)

supplyCatalog/{supplyItemId}         ← supply_item  (GLOBAL, server-write only)
  options/{supplyOptionId}           ← supply_option (GLOBAL)
webRetrievals/{id}                   ← web_retrieval (GLOBAL cache, server-only)
productLookupCache/{id}              ← product_lookup_cache (GLOBAL cache, server-only; Phase 4)
```

**Key placement decisions:**
- **manuals hang off the home, not the item.** In v1, `manual_document.item_unit_id → item_unit`.
  Flattening manuals to `homes/{homeId}/manuals` with an `itemUnitId` field lets rules gate the
  whole manual+chunk+entity subtree with a single membership check on `{homeId}` (v1 needed a
  2-level nested subquery for chunks, which have no `home_id`). Chunks/entities inherit tenancy
  from the path; they also carry `manualId` for convenience (never for a collection-group query —
  they're always read by their parent manual).
- **schedule_rule is inlined onto the template.** v1 is effectively 1:1 (every reader takes the
  most-recent rule by `created_at`); v2 stores one `schedule: {…}` object on the template. Import
  collapses multiple rows to the latest.
- **task_template_supply is inlined** as `supplies: SupplyDraft[]` on the template (denormalizing
  the supply `name` for display); the catalog row stays global under `supplyCatalog`.
- **users merges profiles + user_preferences.** Public profile fields (`fullName`, `avatarUrl`) on
  `users/{uid}` (co-member readable); private prefs + FCM tokens under `users/{uid}/private/**`
  (self-only). `interface_level` → `users/{uid}/private/preferences`.

---

## 2. Table-by-table field mapping (19 core + link/aux tables)

Types below reference the curated interfaces in `src/integrations/types.ts`. `→` = "maps to".
FK columns (v1 `*_id`) become either the doc's **path parent** or a stored **reference field**.

| # | v1 table | v2 location | FK disposition | Notes |
|---|---|---|---|---|
| 1 | `profiles` | `users/{uid}` | `id` → doc id (= auth uid) | merged with prefs; `fullName`, `avatarUrl` |
| 2 | `home` | `homes/{homeId}` | `home_id` → doc id | `name`, `timezone`, `deletedAt` |
| 3 | `home_members` | `homes/{homeId}/members/{uid}` | `home_id`→path, `user_id`→doc id | `role`, `isPrimary`, `joinedAt`; **no soft-delete** |
| 4 | `home_invite` | `homes/{homeId}/invites/{inviteId}` | `home_id`→path | `token`, `role`, `createdBy`, `acceptedBy`, `expiresAt` |
| 5 | `room` | `homes/{homeId}/rooms/{roomId}` | `home_id`→path | `name`, `deletedAt` |
| 6 | `item_unit` | `homes/{homeId}/items/{itemUnitId}` | `home_id`→path, `room_id`→field `roomId` | all specs/warranty/recall/tags/variantTags; `photoPath` = `photo_storage_ref`; `receiptPath` = `receipt_storage_path` |
| 7 | `manual_document` | `homes/{homeId}/manuals/{manualId}` | `item_unit_id`→field `itemUnitId` | + `parse` state machine (§8), `parsedAt` |
| 8 | `knowledge_chunk` | `homes/{homeId}/manuals/{manualId}/chunks/{chunkId}` | `manual_id`→path (+field) | `chunkType`, `contentLevel`, `content`, `tags`, `scenarios`, `sourcePages`, `sectionCategory`, `appliesTo`, `externalKey` |
| 9 | `chat_faq` | `homes/{homeId}/chatFaqs/{faqId}` | `home_id`→path, `item_unit_id`→field | `question`, `answer` |
| 10 | `manual_entity` | `homes/{homeId}/manuals/{manualId}/entities/{entityId}` | `manual_id`→path | `entityType`, `name`, `value`, `metadata` |
| 11 | `task_template` | `homes/{homeId}/taskTemplates/{tplId}` | `home_id`→path; `room_id`,`item_unit_id`,`instructions_chunk_id`,`manual_id`,`default_assignee`→fields | + inlined `schedule` (schedule_rule) + inlined `supplies[]` (task_template_supply); `symptomTags`, `reCheckTriggers`, `steps`, `sourcePage`, `externalKey`, `sectionCategory`, `appliesTo` |
| 12 | `schedule_rule` | inlined on template as `schedule: {…}` | `task_template_id`→parent | `scheduleType`, `intervalDays`, `anchorDate`, `season`, `windowDaysBefore`, `windowDaysAfter` |
| 13 | `task_instance` | `homes/{homeId}/taskInstances/{instId}` | `home_id`→path; `task_template_id`,`item_unit_id`,`assigned_to`→fields | + **denormalized display fields** (§5); `status`, `dueDate`, `window*`, `snoozedUntil`, `priorityScore`, `isSafetyCritical`, `completedAt`, `completionNotes`, `completionPhotos` |
| 14 | `supply_item` | `supplyCatalog/{supplyItemId}` | (global) | `name`, `category`, `oemPartNumber`, `brand`, `model`, `spec` |
| 15 | `shopping_list_item` | `homes/{homeId}/shoppingList/{itemId}` | `home_id`→path; `supply_item_id`,`source_task_instance_id`→fields | `name`, `quantity`, `status` |
| 16 | `supply_option` | `supplyCatalog/{supplyItemId}/options/{supplyOptionId}` | `supply_item_id`→path | `optionType`, `seller`, `url`, `isPreferred` |
| 17 | `cleaning_session` | `homes/{homeId}/cleaningSessions/{sessionId}` | `home_id`→path, `room_id`→field | `name`, `startedAt`, `endedAt` |
| 18 | `web_retrieval` | `webRetrievals/{id}` | (global) | server-only cache |
| 19 | `care_note` | `homes/{homeId}/careNotes/{noteId}` | `home_id`→path; `room_id`,`item_unit_id`,`task_template_id`→fields | `scope`, `chunkType`, `title`, `content`, `source`, `sourceUrl` |

**Link / auxiliary tables (present in `types.ts` beyond the core 19):**

| v1 table | v2 disposition |
|---|---|
| `task_template_supply` | inlined `supplies: SupplyDraft[]` on the template (`{supplyItemId, name, quantity, notes}`) |
| `cleaning_session_task` | `homes/{homeId}/cleaningSessions/{sessionId}/tasks/{sessionTaskId}` |
| `troubleshooting_case` | `homes/{homeId}/troubleshootingCases/{caseId}` |
| `troubleshooting_step` | `homes/{homeId}/troubleshootingCases/{caseId}/steps/{stepId}` |
| `task_tier_change_log` | `homes/{homeId}/tierChangeLog/{id}` |
| `conversation` / `conversation_message` | `homes/{homeId}/chatConversations/{cid}` + `messages/{mid}` |
| `service_provider` | `homes/{homeId}/serviceProviders/{providerId}` (import only if rows exist) |
| `user_preferences` | `users/{uid}/private/preferences` |
| `push_subscription` / `native_push_tokens` | `users/{uid}/private/fcmTokens` (Phase 4 FCM) |
| `product_lookup_cache` / `product_lookup_log` | `productLookupCache/{id}` (global, Phase 4) |
| `parse_correction` | deferred (analytics; not on any read path) |
| `home_profile` | fields folded onto `homes/{homeId}` if present at import |

---

## 3. Read-model coverage checklist (Phase 2 gate)

Every table below has a home in §1/§2 and its read path resolved in §4/§5. **19/19 core covered.**

- [x] profiles → users
- [x] home → homes
- [x] home_members → members (rules primitive)
- [x] home_invite → invites
- [x] room → rooms
- [x] item_unit → items
- [x] manual_document → manuals (+ parse contract §8)
- [x] knowledge_chunk → manuals/chunks
- [x] chat_faq → chatFaqs
- [x] manual_entity → manuals/entities
- [x] task_template → taskTemplates (+ inlined schedule + supplies)
- [x] schedule_rule → inlined on template
- [x] task_instance → taskInstances (+ denorm §5)
- [x] supply_item → supplyCatalog
- [x] shopping_list_item → shoppingList
- [x] supply_option → supplyCatalog/options
- [x] cleaning_session → cleaningSessions
- [x] web_retrieval → webRetrievals
- [x] care_note → careNotes

Read models resolved (see §4): `getDashboardTasks`, `getDashboardStats`, `getUpcomingTasks`,
`getAllMaintenanceTasks`, `getExpiringWarranties`, `getHomeNotices`, `getWeekAgenda`,
`getTaskDetail`, `getTaskInstances`, `getCompletionHistory`, `getTierChangeHistory`,
`getCleaningTasks`, `getRoutineTemplates`, `getItemCleanGuide`, `getHomeUpkeep`,
`getCareNotesByScope/ByItem/ByHome`.

---

## 4. Read-model joins → v2 composition (query-by-query)

Each v1 join is listed with the exact tables/FKs it traversed and how v2 satisfies it
(denormalized read vs. service-layer follow-up `get()`).

### Dashboard (`src/lib/dashboard.ts`)
- **getDashboardTasks** — v1: `task_instance → task_template(title, priority_tier, risk_level,
  care_type)` + `item_unit(display_name, room:room_id(name))`; filter `status=scheduled`,
  `deletedAt null`; order `priority_score desc, due_date asc`.
  **v2:** single query on `taskInstances` (home-scoped by path). All four template fields +
  item name + room name are **denormalized on the instance** (§5) → **no follow-up reads**.
  Index: `(status, deletedAt, priorityScore desc, dueDate asc)`.
- **getDashboardStats** — items count + `taskInstances` where `status=done, completedAt >= monthStart`.
  Denorm `careType`/`tier` on instance covers the breakdown. Index `(status, completedAt desc)`.
- **getUpcomingTasks / getAllMaintenanceTasks** — same denorm shape; add `notes` (template) — surface
  from denorm or a detail `get()` (not shown in list rows → denorm not required, fetch on demand).
- **getExpiringWarranties / getHomeNotices / getItemIdsWithTasks** — `items`-only reads; the last
  needs "items that have any active item-scoped template" → maintain a boolean `hasTasks` on the item
  (written when templates are created/deleted) OR query `taskTemplates` by `scopeType=item_unit,
  isActive` and collect `itemUnitId`s. Chosen: **query templates** (avoids a denorm invariant to
  maintain); index `(scopeType, isActive, deletedAt)`.

### Week agenda (`src/modules/care/services/weekAgenda.ts`)
- **getWeekAgenda** — v1: `task_instance → task_template(title, scope_type, care_type, priority_tier,
  estimated_minutes)` + `item_unit(display_name, room(name))`; filter `status IN [scheduled,snoozed]`,
  `deletedAt null`, `due_date <= horizon`; order `due_date asc`.
  **v2:** single `taskInstances` query; denorm provides title, scopeType, careType, tier,
  estimatedMinutes, itemName, roomName. Index `(status, deletedAt, dueDate asc)`.

### Task detail + completion (`src/modules/care/services/taskService.ts`)
- **getTaskDetail** — the deepest v1 join: `task_instance → task_template(…, schedule_rule(…),
  task_template_supply(supply_item(name)), knowledge_chunk:instructions_chunk_id(source_pages))`
  + `item_unit(display_name, room(name))`, plus a separate `status=done` count for `neverCompleted`.
  **v2:** read the `taskInstance` doc, then **one follow-up `get()`** on its `taskTemplates/{tplId}`
  (which already carries inlined `schedule` + `supplies[]` with names + `sourcePage`/`steps`/
  `instructionsOverride`/`justification`). `manualPage = sourcePage ?? metadata.diagram_pages[0].page
  ?? (get chunk.sourcePages[0])` — the chunk fetch only when the first two are absent. Item name/room
  from instance denorm. `neverCompleted` = **count query** on `taskInstances` where
  `taskTemplateId == tpl, status == done` → Firestore `getCountFromServer`. Index
  `(taskTemplateId, status)`.
- **markTaskInstanceDone** — v1 RPC `complete_task_instance`. **v2: `completeTask` callable** (Admin
  SDK transaction). See §9 — this is **not** a client-side transaction, because dup-suppression needs
  a query-in-transaction (Admin SDK only). Callable returns `{completedInstanceId, nextInstanceId}`.
- **getTaskInstances** — `taskInstances` home-scoped, `deletedAt null`, order `priorityScore desc,
  due_date asc`; remaining filters client-side. Same index as getDashboardTasks.
- **getCompletionHistory / getTierChangeHistory** — v1 joins `task_template(title, priority_tier,
  item_unit_id)` then filters to an item client-side. **v2:** `taskInstances`/`tierChangeLog` carry
  denorm `title`+`tier`+`itemUnitId`; filter by `itemUnitId` server-side.

### Clean session (`src/lib/cleanSession.ts`)
- **getCleaningTasks** — v1: `task_instance → task_template(…, schedule_rule(schedule_type),
  knowledge_chunk:instructions_chunk_id(content))` + `item_unit(display_name, room(name))`, plus a
  done-history query and an active-template existence check that **auto-generates missing instances**.
  **v2:** `taskInstances` query with denorm (careType filter now server-side since `careType` is
  denormed); the missing-instance generation stays in the service (reads active `taskTemplates`,
  writes instances) — unchanged logic, Firestore writes. Chunk `content` for the guide → follow-up
  `get()` on the chunk when opening a task, not in the list.
- **getRoutineTemplates** — `taskTemplates` where `scopeType=home, itemUnitId==null, source=user,
  isActive, deletedAt null`; order `createdAt desc`. Index `(scopeType, itemUnitId, source, isActive,
  deletedAt, createdAt desc)`.
- **getItemCleanGuide** — `taskTemplates` where `itemUnitId==id, careType IN [cleaning,mixed],
  isActive, deletedAt null`; inlined `supplies[]` + `steps` cover the guide. Index
  `(itemUnitId, isActive, deletedAt, careType)`.

### Home upkeep (`src/modules/care/services/homeUpkeep.ts`)
- **getHomeUpkeep** — v1: `task_instance → task_template!inner(title, scope_type, item_unit_id,
  care_type, priority_tier, estimated_minutes, schedule_rule(schedule_type, season, interval_days))`;
  filter `item_unit_id IS null, status IN [scheduled,snoozed], deletedAt null`; order `due_date asc`;
  client re-filters `scope_type=home`.
  **v2:** `taskInstances` where `itemUnitId == null, status IN [...], deletedAt null`, order `dueDate`.
  Denorm carries scopeType/careType/tier/estimatedMinutes; `schedule.scheduleType/season/intervalDays`
  come from the template on demand (or denorm `scheduleType` if a list row shows it — it does: the
  upkeep row shows cadence → **denorm `scheduleType` too**, see §5). Index
  `(itemUnitId, status, deletedAt, dueDate asc)`.

### Care notes (`src/modules/care/services/careNoteService.ts`)
- **getCareNotesByScope** — `careNotes` where `scope == X, deletedAt null`; order `category asc,
  createdAt desc`. Index `(scope, deletedAt, category, createdAt desc)`.
- **getCareNotesByItem** — `careNotes` where `itemUnitId == X, deletedAt null`; order `chunkType asc,
  createdAt desc`. Index `(itemUnitId, deletedAt, chunkType, createdAt desc)`.
- **getCareNotesByHome** — `careNotes` where `scope == item_unit, deletedAt null`. Covered by the
  scope index.

---

## 5. Denormalization set (the exact fields to embed)

Almost every task surface reads the same joined fields. To kill the joins, `taskInstances` docs
**embed** the following at write time (created by the parse worker, `completeTask`, roll-forward,
and clean-session generation — every writer of an instance):

**On `taskInstances` (from its template):** `title`, `priorityTier`, `careType`, `scopeType`,
`estimatedMinutes`, `scheduleType`.
**On `taskInstances` (from its item, when `itemUnitId != null`):** `itemName` (= item.displayName),
`roomName` (= room.name of item.roomId).

Detail-only fields **NOT denormalized** (fetched via one `get()` on the template/chunk in
`getTaskDetail`/guides): `justification`, `instructionsOverride`, `steps`, `sourcePage`,
`supplies[]`, `schedule` object, chunk `content`/`sourcePages`.

**Denorm maintenance rule:** when a template's `title`/`priorityTier`/`careType`/`estimatedMinutes`
changes, the writing service updates the denorm on the template's **open** instances (a bounded
query: `taskInstances where taskTemplateId == tpl, status IN [scheduled,snoozed]`). Completed
instances keep their historical denorm (correct — history reflects what the task was when done).
Item rename → update denorm on that item's open instances the same way. These fan-out writes are
small (open instances per template ≈ 1) and live in the Phase 5 services; the tier-change path
already writes `tierChangeLog`, so it piggybacks the denorm update.

---

## 6. Security rules (see `firestore.rules`)

v1 has **78 RLS policies**, but the effective model is simpler than the count suggests:

- **The near-universal v1 data-table policy is `FOR ALL USING (home_id IN (SELECT home_id FROM
  home_members WHERE user_id = auth.uid()))`** — i.e. *any member of the home gets full CRUD on all
  the home's data.* There is **no owner/admin/member distinction enforced on data tables.** Roles are
  used only in the `remove_home_member` RPC (removing *another* member requires `owner`; refuses to
  remove the last owner). v2 mirrors this: **membership at `homes/{homeId}/members/{uid}` grants
  read+write to the home's data**; role only gates member management.
- **The rules primitive** is `isMember(homeId) = exists(homes/{homeId}/members/{request.auth.uid})`.
  Because chunks/entities live under the manual subtree (path-tenanted), the v1 2-level nested subquery
  for chunk reachability collapses to the same single membership check.
- **Assignee-must-be-member** (v1 trigger `enforce_assignee_membership`): enforced in rules on
  `taskInstances` create/update — `assignedTo == null || exists(members/{assignedTo})`. Same guard on
  `taskTemplates.defaultAssignee`.
- **Self-only:** `users/{uid}` writes are `request.auth.uid == uid`; `users/{uid}/private/**` is
  self-only for read too. Member docs: self can create/update own row (bootstrap + self-join +
  `isPrimary`); role changes and removing *other* members require `owner`.
- **Global collections:** `supplyCatalog` (+ options) is **read: authed, write: server-only**
  (Admin SDK). `webRetrievals` / `productLookupCache` are server-only (read+write false for clients).
- **Soft-delete:** rules enforce shape/auth; the `deletedAt == null` list filter is a query concern,
  not a rule.

Rules do **auth + shape only, never joins** (Firestore rules can't count docs → the last-owner guard
and invite-token/expiry validation move to callables; see Divergences).

---

## 7. Atomic chunk swap on re-parse

v1 asymmetry (preserved): **chunks are retire-and-reinsert** (they carry no completion history);
**tasks are upsert-by-`externalKey`** (to preserve `taskInstance` completion history).

v2 chunk swap for a manual (in `commitDraft`, the worker's Firestore executor):
1. Read existing `chunks` under the manual.
2. In a **single batched write** (`writeBatch`, ≤500 ops; chunk sets are ≤60 → always one batch):
   `delete` each stale chunk doc and `set` each fresh chunk. **Hard delete** (lossless — chunks have
   no history), unlike the soft-delete convention elsewhere.
3. The batch is **idempotent, keyed by `parse.requestId`** — the worker records the committed
   requestId on the manual; a redelivered task whose requestId matches skips the swap.

Tasks are **never** swapped: `planTaskReconciliation` (ported verbatim, pure) produces matches
(UPDATE in place, re-stamp `externalKey`), inserts, flags, and deletes; `commitDraft` executes that
plan. Never delete a completion-bearing task; never commit a breadcrumb/`_error` draft (invariants
3 & 5). The chunk swap and the task plan are **not** wrapped in one cross-collection transaction
(neither was v1); each is its own idempotent batch keyed by requestId, so a mid-commit kill leaves a
diagnosable, replayable state (§8, §13).

---

## 8. Parse state-machine contract (FROZEN — Phase 3 builds to this exactly)

Fields on `homes/{homeId}/manuals/{manualId}`:

```ts
parse: {
  stage: "queued" | "started" | "pdf_fetched" | "claude_call" | "claude_responded"
       | "committing" | "done" | "error",
  stageAt: Timestamp,        // written on EVERY transition (staleness detection)
  requestId: string,         // per enqueue; worker claims via transaction, ignores stale deliveries
  mode: "commit" | "preview" | "fill_gaps",
  model: string,             // pickParseModel result (Sonnet 4.6 default → Opus 4.8 for gas/safety)
  attempt: number,
  error: { message: string, stage: string, at: Timestamp } | null,
  summary: { chunks: number, tasks: number, confidence: ParsedConfidence } | null,  // at "done"
} | null
previewDraft: ParseDraft | null   // NEVER committable
draft: ParseDraft | null          // committable ONLY with real extraction arrays (invariant 5)
parsedAt: Timestamp | null
```

**Worker transitions** (Cloud Tasks `onTaskDispatched`, `timeoutSeconds: 1800`, `retryConfig
{maxAttempts: 2}`, queue `rateLimits {maxConcurrentDispatches: 2}`):
`queued` → claim `requestId` in a transaction → `started` → Storage PDF fetch (or `isAllowedUrl`-
guarded URL fetch) → `pdf_fetched` → `claude_call` (buildPrompt + `EXTRACTION_TOOL` +
`samplingParamsFor(pickParseModel(item))`) → `claude_responded` → `extractParsedResult` →
`normalizeChunkRow`/`normalizeTaskRow` → `planTaskReconciliation` → `committing` →
`commitDraft` (chunk swap §7 + task plan, one idempotent batch keyed by requestId) → clear `draft`,
set `summary`/`parsedAt`, `done`. Any throw → `error` with the dying `stage` (breadcrumbs survive;
1800s is finite but generous). **Never auto-retry past `committing` without checking commit markers**
(the requestId idempotency key on the manual).

**Modes:** same worker. `preview` writes `previewDraft` from the shared prompt's draft mode (retires
`preview-manual`'s drifted inline prompt); `fill_gaps` passes `existingTitles`. This delivers one
prompt + one commit implementation (plan B3).

**Client contract** (`parseManualService`, Phase 3): `startParse`/`watchParse`(onSnapshot on
`parse.stage`)/`parseManualAndWait`. The UI advances to review **only on `done`** — because the worker
reaches `done` only after the commit, the v1 empty-review fire-and-forget bug is **impossible by
construction**. State lives in Firestore → survives tab refresh (the trust arc, fix B).

---

## 9. SQL-artifact equivalents (spec here; built Phases 3–4)

### `complete_task_instance` → `completeTask` callable (Admin SDK transaction)
v1 RPC (`SECURITY INVOKER`) does, transactionally: mark instance done (`completedAt = date + 12h`);
bail if template inactive / no schedule / type ∈ {`after_each_use`,`as_needed`,`setup`}; compute next
due (override > seasonal anchor > cadence add from completedOn); **dup-suppress** (skip if any open
instance already exists for the template); compute window + `priorityScore`
(tier 100/60/30 + risk 100/50/20/10 + dueness 60/30/15 − optional-high-effort 20); insert next
instance inheriting assignee = first current member among (template.defaultAssignee, prev.assignedTo).

**v2 is a callable, not a client transaction**, because the dup-suppression step queries for open
instances and **the client Web SDK cannot query inside a transaction; the Admin SDK (Node) can**
(`t.get(query)`). The callable runs an Admin transaction: read instance + template + inlined schedule
→ set done → query open instances for the template (`t.get`) → if none, compute next + insert with the
denorm set (§5) + validated inherited assignee. Returns `{completedInstanceId, nextInstanceId}`.

### pg_cron → Cloud Scheduler functions
- **`sendPushDaily`** (v1 cron `0 15 * * *`): Scheduler-triggered function → FCM (Phase 4).
- **`rollForwardNeverStarted`** (v1 cron `30 5 * * *`, migration `20260701000002`): re-anchor
  never-started, past-due, **recurring** instances to the next cycle from today so a genuinely-未started
  task reads as upcoming, **only when no completed sibling exists** for the template (a real lapse keeps
  its overdue date). Cadence map: `weekly +7d, monthly +1mo, quarterly +3mo, semiannual +6mo, annual
  +12mo, every_n_days +intervalDays(30)`; `after_each_use`/`as_needed`/`seasonal`/`setup` → not rolled.
  Admin SDK: query `taskInstances` (collection-group across homes) `status=scheduled, deletedAt null,
  dueDate < today`, skip those with a `done` sibling for the same template, batch-update `dueDate`.

### Atomic chunk swap → §7 (single idempotent batch).

---

## 10. Composite indexes (see `firestore.indexes.json`)

Home-scoping via path removes `homeId` from every index. All are `COLLECTION` scope (scoped
subcollections), except the roll-forward sweep which needs a **collection-group** index.

| Collection | Fields (order) | Serves |
|---|---|---|
| `taskInstances` | `status` ASC, `deletedAt` ASC, `priorityScore` DESC, `dueDate` ASC | dashboard tasks, getTaskInstances |
| `taskInstances` | `status` ASC, `deletedAt` ASC, `dueDate` ASC | week agenda, all-maintenance, upcoming |
| `taskInstances` | `status` ASC, `completedAt` DESC | done history, stats |
| `taskInstances` | `itemUnitId` ASC, `status` ASC, `deletedAt` ASC, `dueDate` ASC | home upkeep (itemUnitId==null) |
| `taskInstances` | `taskTemplateId` ASC, `status` ASC | neverCompleted count, dup-suppression |
| `taskInstances` (GROUP) | `status` ASC, `deletedAt` ASC, `dueDate` ASC | roll-forward sweep across homes |
| `taskTemplates` | `isActive` ASC, `deletedAt` ASC, `createdAt` DESC | getTaskTemplates |
| `taskTemplates` | `scopeType` ASC, `itemUnitId` ASC, `source` ASC, `isActive` ASC, `deletedAt` ASC, `createdAt` DESC | getRoutineTemplates |
| `taskTemplates` | `itemUnitId` ASC, `isActive` ASC, `deletedAt` ASC, `careType` ASC | getItemCleanGuide, cleaning filter |
| `taskTemplates` | `scopeType` ASC, `isActive` ASC, `deletedAt` ASC | getItemIdsWithTasks |
| `careNotes` | `scope` ASC, `deletedAt` ASC, `category` ASC, `createdAt` DESC | getCareNotesByScope |
| `careNotes` | `itemUnitId` ASC, `deletedAt` ASC, `chunkType` ASC, `createdAt` DESC | getCareNotesByItem |

Single-field indexes (auto-created by Firestore) cover: chunks by `manualId`, manuals by `itemUnitId`,
schedule reads (inlined now), shoppingList/faqs by their single filters. `status IN [scheduled,
snoozed]` is an equality-class query → uses the same index as `status ==`.

---

## Divergences from v1 (deliberate; nothing silent)

1. **Global catalog is server-write-only.** v1 let any authenticated user write `supply_item`/
   `supply_option` (`USING(true) WITH CHECK(true)`). v2 rules set client writes to `false`; the catalog
   is populated by parse/import via Admin SDK (plan §2: "write-server"). No behavioral loss — the app
   never wrote the catalog directly from an unprivileged client path.
2. **Last-owner guard + remove-other-member move to a callable.** v1's `remove_home_member`
   (SECURITY DEFINER) refuses to remove the last owner and lets an owner remove others. Firestore rules
   can't count docs, so: rules allow self-leave + owner-removes-member, and the **last-owner guard lives
   in a `removeMember` callable** (Phase 5, Admin SDK) — the app calls the callable, which is the only
   path that can safely check "is this the last owner?".
3. **Invite acceptance is trust-the-flow in rules, validated in a callable.** v1 accept ran through a
   definer function. v2 rules let a signed-in invitee read an invite (by token) and self-create their
   member doc; token/expiry validation is enforced in the `acceptInvite` callable (Phase 5). Rules are
   the floor, the callable is the gate.
4. **Role self-escalation is blocked** (v1 left self-update of `role` unguarded aside from the
   home_id-pivot guard). v2 rules forbid a member changing their own `role` (owner-only), which is
   stricter and safer.
5. **`completeTask` is a callable, not a client transaction** (§9) — forced by query-in-transaction
   being Admin-SDK-only. Same semantics, server-side.
6. **`users/{uid}` profile read is any-signed-in** (co-member profile display). v1's exact predicate
   was "co-member of a shared home", which needs a cross-home query not expressible in rules; profiles
   are low-sensitivity display data, and private prefs/tokens stay self-only under `private/**`.

---

## Handoff to Phase 3

The parse contract (§8) + chunk-swap (§7) + `commitDraft` spec (§9) are the inputs to the worker.
The denorm set (§5) is what every instance writer must stamp. `completeTask`/`rollForward` specs (§9)
feed Phase 5 `taskService` and Phase 4 scheduler. Indexes (§10) deploy with the rules.
