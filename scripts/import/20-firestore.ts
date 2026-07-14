/**
 * 20-firestore — import all v1 data tables into the v2 Firestore model
 * (docs/firestore-model.md). Writes mirror scripts/seed-emulator.ts exactly.
 *
 * Design:
 *   - v1 UUIDs are PRESERVED as v2 doc ids → every FK reference (itemUnitId,
 *     taskTemplateId, assignedTo, …) stays valid with no id remapping. v1 PKs are
 *     `<table>_id` (home_id, item_unit_id, manual_id, task_template_id, …) with a
 *     few `id` exceptions — see PK usage per section below. `req()` throws if any
 *     id resolves to undefined, so a schema mismatch fails loudly (never writes to
 *     a `.../undefined` path).
 *   - schedule_rule is collapsed to the latest row and INLINED as `schedule` on
 *     the template; task_template_supply is INLINED as `supplies[]` (with the
 *     supply name denormalized).
 *   - taskInstances carry the §5 denorm set (title/priorityTier/careType/
 *     scopeType/estimatedMinutes/scheduleType from the template; itemName/roomName
 *     from the item + room).
 *   - Idempotent: deterministic ids overwrite, so re-running is safe.
 *
 *   CONFIRM=IMPORT npx tsx scripts/import/20-firestore.ts
 */
import { Timestamp, type WriteBatch } from "firebase-admin/firestore"
import { banner, DRY_RUN } from "./lib/env.js"
import { fetchAll } from "./lib/source.js"
import { db } from "./lib/target.js"
import { mapRow, withStamps, ts, ymd } from "./lib/transform.js"

type Row = Record<string, unknown>
const NOW = Timestamp.now()
const counts: Record<string, number> = {}

/** Doc-id / path-segment guard: a v1 PK must be present, or the import would
 *  silently collapse rows onto a `.../undefined` path. Fail loudly instead. */
function req(val: unknown, what: string): string {
  if (val == null || val === "") throw new Error(`missing id for ${what} — check the v1 primary-key column name`)
  return String(val)
}

// ── batched writer (flush at 450 ops; dry-run just counts) ───────────────────
let batch: WriteBatch | null = null
let ops = 0
async function flush(): Promise<void> {
  if (batch && ops > 0 && !DRY_RUN) await batch.commit()
  batch = null
  ops = 0
}
async function put(coll: string, path: string, body: Row): Promise<void> {
  counts[coll] = (counts[coll] ?? 0) + 1
  if (DRY_RUN) return
  if (!batch) batch = db().batch()
  batch.set(db().doc(path), body)
  if (++ops >= 450) await flush()
}
const mapByKey = <T extends Row>(rows: T[], key: string) => new Map(rows.map((r) => [String(r[key]), r]))
const groupBy = <T extends Row>(rows: T[], key: string) => {
  const m = new Map<string, T[]>()
  for (const r of rows) {
    const k = String(r[key])
    ;(m.get(k) ?? m.set(k, []).get(k)!).push(r)
  }
  return m
}

async function main(): Promise<void> {
  banner("20-firestore")

  // ── Load source ────────────────────────────────────────────────────────────
  const [
    profiles, homes, homeProfiles, members, invites, rooms, items, manuals, chunks,
    entities, faqs, templates, scheduleRules, templateSupplies, instances, supplyItems,
    supplyOptions, shopping, cleaningSessions, cleaningTasks, careNotes, providers,
    conversations, messages, tsCases, tsSteps, tierLog, prefs,
  ] = await Promise.all([
    fetchAll("profiles"), fetchAll("home"), fetchAll("home_profile"), fetchAll("home_members"),
    fetchAll("home_invite"), fetchAll("room"), fetchAll("item_unit"), fetchAll("manual_document"),
    fetchAll("knowledge_chunk"), fetchAll("manual_entity"), fetchAll("chat_faq"), fetchAll("task_template"),
    fetchAll("schedule_rule"), fetchAll("task_template_supply"), fetchAll("task_instance"), fetchAll("supply_item"),
    fetchAll("supply_option"), fetchAll("shopping_list_item"), fetchAll("cleaning_session"), fetchAll("cleaning_session_task"),
    fetchAll("care_note"), fetchAll("service_provider"), fetchAll("conversation"), fetchAll("conversation_message"),
    fetchAll("troubleshooting_case"), fetchAll("troubleshooting_step"), fetchAll("task_tier_change_log"), fetchAll("user_preferences"),
  ])

  // ── Lookup maps (keyed by v1 PK) ─────────────────────────────────────────────
  const roomName = new Map(rooms.map((r) => [String(r.room_id), String(r.name ?? "")]))
  const itemHome = new Map(items.map((i) => [String(i.item_unit_id), String(i.home_id ?? "")]))
  const itemInfo = new Map(items.map((i) => [String(i.item_unit_id), { displayName: String(i.display_name ?? ""), roomName: roomName.get(String(i.room_id)) ?? null }]))
  const manualHome = new Map(manuals.map((m) => [String(m.manual_id), String(m.home_id ?? itemHome.get(String(m.item_unit_id)) ?? "")]))
  const homeProfileByHome = mapByKey(homeProfiles, "home_id")
  // schedule_rule: latest per template (v1 is effectively 1:1; take newest created_at).
  const schedByTemplate = new Map<string, Row>()
  for (const s of scheduleRules) {
    const tid = String(s.task_template_id)
    const prev = schedByTemplate.get(tid)
    if (!prev || String(s.created_at ?? "") > String(prev.created_at ?? "")) schedByTemplate.set(tid, s)
  }
  const suppliesByTemplate = groupBy(templateSupplies, "task_template_id")
  const supplyItemName = new Map(supplyItems.map((s) => [String(s.supply_item_id), String(s.name ?? "")]))
  const templateInfo = mapByKey(templates, "task_template_id")

  // ── Users (profiles + prefs) ─────────────────────────────────────────────────
  for (const p of profiles) {
    await put("users", `users/${req(p.id, "profile")}`, withStamps(mapRow(p, { drop: ["id"] }), NOW))
  }
  for (const pr of prefs) {
    const uid = req(pr.user_id, "user_preferences")
    const level = pr.interface_level
    await put("users/private", `users/${uid}/private/preferences`, {
      interface_level: level && typeof level === "object" ? level : { level: level ?? "guided" },
      tour_completed: pr.tour_completed ?? false,
      updatedAt: ts(pr.updated_at) ?? NOW,
    })
  }

  // ── Homes (+ folded home_profile) + members + invites + rooms ─────────────────
  for (const h of homes) {
    const hid = req(h.home_id, "home")
    const profile = homeProfileByHome.get(hid)
    const body = withStamps(mapRow(h, { drop: ["home_id"] }), NOW)
    if (profile) Object.assign(body, mapRow(profile, { drop: ["id", "home_id", "created_at", "updated_at"] }))
    await put("homes", `homes/${hid}`, body)
  }
  for (const m of members) {
    const hid = req(m.home_id, "home_members.home_id")
    const uid = req(m.user_id, "home_members.user_id")
    await put("members", `homes/${hid}/members/${uid}`, {
      uid, // enables the collectionGroup("members").where("uid","==",…) lookup
      ...mapRow(m, { drop: ["home_id", "user_id"] }),
    })
  }
  for (const iv of invites) {
    const hid = req(iv.home_id, "home_invite.home_id")
    await put("invites", `homes/${hid}/invites/${req(iv.invite_id, "home_invite")}`, withStamps(mapRow(iv, { drop: ["home_id", "invite_id"] }), NOW))
  }
  for (const r of rooms) {
    const hid = req(r.home_id, "room.home_id")
    await put("rooms", `homes/${hid}/rooms/${req(r.room_id, "room")}`, withStamps(mapRow(r, { drop: ["home_id", "room_id"] }), NOW))
  }

  // ── Items ──────────────────────────────────────────────────────────────────
  for (const it of items) {
    const hid = req(it.home_id, "item_unit.home_id")
    await put("items", `homes/${hid}/items/${req(it.item_unit_id, "item_unit")}`, withStamps(mapRow(it, {
      drop: ["home_id", "item_unit_id"],
      dates: ["purchase_date", "warranty_expiry_date"],
      renames: { photo_storage_ref: "photoPath", receipt_storage_path: "receiptPath" },
    }), NOW))
  }

  // ── Manuals (+ chunks, entities) ─────────────────────────────────────────────
  for (const m of manuals) {
    const mid = req(m.manual_id, "manual_document")
    const home = manualHome.get(mid)
    if (!home) { console.warn(`  · manual ${mid}: no home — skipping`); continue }
    const body = withStamps(mapRow(m, { drop: ["home_id", "manual_id"] }), NOW)
    // Imported manuals were already parsed in v1 → mark done so the UI shows them
    // as parsed; 40-reparse overwrites this to re-extract with the v2 worker.
    body.parse = { stage: "done", stageAt: ts(m.parsed_at) ?? NOW, requestId: "import", mode: "commit", model: "import", attempt: 1, error: null }
    await put("manuals", `homes/${home}/manuals/${mid}`, body)
  }
  for (const c of chunks) {
    const home = manualHome.get(String(c.manual_id))
    if (!home) continue
    await put("chunks", `homes/${home}/manuals/${c.manual_id}/chunks/${req(c.chunk_id, "knowledge_chunk")}`, withStamps(mapRow(c, { drop: ["chunk_id"] }), NOW))
  }
  for (const e of entities) {
    const home = manualHome.get(String(e.manual_id))
    if (!home) continue
    await put("entities", `homes/${home}/manuals/${e.manual_id}/entities/${req(e.entity_id, "manual_entity")}`, withStamps(mapRow(e, { drop: ["entity_id"] }), NOW))
  }

  // ── Task templates (inline schedule + supplies) ──────────────────────────────
  for (const t of templates) {
    const hid = req(t.home_id, "task_template.home_id")
    const tid = req(t.task_template_id, "task_template")
    const sched = schedByTemplate.get(tid)
    const supplies = (suppliesByTemplate.get(tid) ?? []).map((s) => ({
      supplyItemId: s.supply_item_id ?? null,
      name: supplyItemName.get(String(s.supply_item_id)) ?? s.name ?? null,
      quantity: s.quantity ?? null,
      notes: s.notes ?? null,
    }))
    const body = withStamps(mapRow(t, { drop: ["home_id", "task_template_id"] }), NOW)
    body.schedule = sched
      ? {
          scheduleType: sched.schedule_type ?? "as_needed",
          intervalDays: sched.interval_days ?? null,
          anchorDate: ymd(sched.anchor_date),
          season: sched.season ?? null,
          windowDaysBefore: sched.window_days_before ?? 7,
          windowDaysAfter: sched.window_days_after ?? 14,
        }
      : { scheduleType: "as_needed", intervalDays: null, anchorDate: null, season: null, windowDaysBefore: 7, windowDaysAfter: 14 }
    body.supplies = supplies
    await put("taskTemplates", `homes/${hid}/taskTemplates/${tid}`, body)
  }

  // ── Task instances (denorm §5) ───────────────────────────────────────────────
  for (const inst of instances) {
    const hid = req(inst.home_id, "task_instance.home_id")
    const tpl = templateInfo.get(String(inst.task_template_id))
    const sched = tpl ? schedByTemplate.get(String(tpl.task_template_id)) : null
    const item = inst.item_unit_id ? itemInfo.get(String(inst.item_unit_id)) : null
    const body = withStamps(mapRow(inst, {
      drop: ["home_id", "task_instance_id"],
      dates: ["due_date", "window_start", "window_end"],
      instants: ["snoozed_until"],
    }), NOW)
    // Denormalized display fields — from the template + item.
    body.title = tpl?.title ?? inst.title ?? null
    body.priorityTier = tpl?.priority_tier ?? null
    body.careType = tpl?.care_type ?? null
    body.scopeType = tpl?.scope_type ?? null
    body.estimatedMinutes = tpl?.estimated_minutes ?? null
    body.scheduleType = sched?.schedule_type ?? null
    body.itemName = item?.displayName ?? null
    body.roomName = item?.roomName ?? null
    await put("taskInstances", `homes/${hid}/taskInstances/${req(inst.task_instance_id, "task_instance")}`, body)
  }

  // ── Global supply catalog (+ options) ────────────────────────────────────────
  for (const s of supplyItems) {
    await put("supplyCatalog", `supplyCatalog/${req(s.supply_item_id, "supply_item")}`, withStamps(mapRow(s, { drop: ["supply_item_id"] }), NOW))
  }
  for (const o of supplyOptions) {
    await put("supplyOptions", `supplyCatalog/${o.supply_item_id}/options/${req(o.supply_option_id, "supply_option")}`, withStamps(mapRow(o, { drop: ["supply_option_id"] }), NOW))
  }

  // ── Home-scoped aux collections ──────────────────────────────────────────────
  for (const n of careNotes) await put("careNotes", `homes/${req(n.home_id, "care_note.home_id")}/careNotes/${req(n.note_id, "care_note")}`, withStamps(mapRow(n, { drop: ["home_id", "note_id"] }), NOW))
  for (const f of faqs) await put("chatFaqs", `homes/${req(f.home_id, "chat_faq.home_id")}/chatFaqs/${req(f.faq_id, "chat_faq")}`, withStamps(mapRow(f, { drop: ["home_id", "faq_id"] }), NOW))
  for (const s of shopping) await put("shoppingList", `homes/${req(s.home_id, "shopping.home_id")}/shoppingList/${req(s.shopping_list_item_id ?? s.id, "shopping_list_item")}`, withStamps(mapRow(s, { drop: ["home_id", "shopping_list_item_id", "id"] }), NOW))
  for (const p of providers) await put("serviceProviders", `homes/${req(p.home_id, "service_provider.home_id")}/serviceProviders/${req(p.provider_id, "service_provider")}`, withStamps(mapRow(p, { drop: ["home_id", "provider_id"] }), NOW))
  for (const l of tierLog) await put("tierChangeLog", `homes/${req(l.home_id, "tier_log.home_id")}/tierChangeLog/${req(l.id, "task_tier_change_log")}`, withStamps(mapRow(l, { drop: ["home_id", "id"] }), NOW))

  const sessionHome = new Map(cleaningSessions.map((s) => [String(s.session_id), String(s.home_id ?? "")]))
  for (const s of cleaningSessions) await put("cleaningSessions", `homes/${req(s.home_id, "cleaning_session.home_id")}/cleaningSessions/${req(s.session_id, "cleaning_session")}`, withStamps(mapRow(s, { drop: ["home_id", "session_id"] }), NOW))
  for (const t of cleaningTasks) {
    const sid = String(t.session_id)
    const home = sessionHome.get(sid)
    if (!home) continue
    await put("cleaningSessionTasks", `homes/${home}/cleaningSessions/${sid}/tasks/${req(t.session_task_id, "cleaning_session_task")}`, withStamps(mapRow(t, { drop: ["session_task_id"] }), NOW))
  }

  const convoHome = new Map(conversations.map((c) => [String(c.id), String(c.home_id ?? "")]))
  for (const c of conversations) await put("chatConversations", `homes/${req(c.home_id, "conversation.home_id")}/chatConversations/${req(c.id, "conversation")}`, withStamps(mapRow(c, { drop: ["home_id", "id"] }), NOW))
  for (const msg of messages) {
    const home = convoHome.get(String(msg.conversation_id))
    if (!home) continue
    await put("conversationMessages", `homes/${home}/chatConversations/${msg.conversation_id}/messages/${req(msg.id, "conversation_message")}`, withStamps(mapRow(msg, { drop: ["id"] }), NOW))
  }

  const caseHome = new Map(tsCases.map((c) => [String(c.case_id), String(c.home_id ?? "")]))
  for (const c of tsCases) await put("troubleshootingCases", `homes/${req(c.home_id, "troubleshooting_case.home_id")}/troubleshootingCases/${req(c.case_id, "troubleshooting_case")}`, withStamps(mapRow(c, { drop: ["home_id", "case_id"] }), NOW))
  for (const st of tsSteps) {
    const cid = String(st.case_id)
    const home = caseHome.get(cid)
    if (!home) continue
    await put("troubleshootingSteps", `homes/${home}/troubleshootingCases/${cid}/steps/${req(st.step_id, "troubleshooting_step")}`, withStamps(mapRow(st, { drop: ["step_id"] }), NOW))
  }

  await flush()

  console.log("Documents written per collection:")
  for (const [k, v] of Object.entries(counts).sort()) console.log(`  ${k.padEnd(24)} ${v}`)
  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  console.log(DRY_RUN ? `\n(dry run) would write ${total} docs.` : `\n✓ wrote ${total} docs.`)
}

main().then(() => process.exit(0)).catch((e) => { console.error("\n✖ Firestore import failed:", e); process.exit(1) })
