/**
 * Per-field provenance on the server writers (decision C, step 1 —
 * shared/tasks/fieldProvenance.ts, docs/firestore-model.md "Field provenance").
 *
 * What a parse writes is UNCHANGED in this step: a re-scan still overwrites the
 * four fields exactly as before. What these prove is the record that now rides
 * along — `manualSuggestion` and a "manual" stamp for every field it writes,
 * a house rule's rewrite stamped "system", a reviewer's edit in the draft
 * review stamped as theirs (the real commitManualDraft callable), and the
 * classifier backfill stamping only the fields it changes.
 *
 * Run: `npm run test:worker:emu` (builds lib, wraps emulators:exec).
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import { getApps, initializeApp } from "firebase-admin/app"
import { getFirestore, Timestamp } from "firebase-admin/firestore"
import { normalizeTaskRow } from "../lib/shared/parse/parseCore.js"
import { sourceOf } from "../lib/shared/tasks/fieldProvenance.js"
import { commitDraft } from "../lib/firebase/functions/src/parse/commitDraft.js"
import { commitManualDraft } from "../lib/firebase/functions/src/parse/commitManualDraft.js"
import { classifyExistingTasks } from "../lib/firebase/functions/src/ai/classifyExistingTasks.js"

assert.ok(process.env.FIRESTORE_EMULATOR_HOST, "FIRESTORE_EMULATOR_HOST must be set (run via emulators:exec)")
if (getApps().length === 0) initializeApp({ projectId: "demo-homehub" })
const db = getFirestore()
const NOW = new Date("2026-06-23T00:00:00Z")
const FIELDS = ["priorityTier", "schedule", "remindEnabled", "careType"]

const row = (over) =>
  normalizeTaskRow({
    title: "Task", description: null, care_type: "maintenance", priority_tier: "recommended",
    risk_level: "performance", estimated_minutes: 10, schedule_type: "monthly", interval_days: null,
    instructions_text: null, symptom_tags: [], re_check_triggers: [], applies_to: [], supplies: [],
    ...over,
  })
const itemFacts = (id) => ({ itemUnitId: id, item_category: "major_appliance", sub_type: null, display_name: "Washer", model: null, accessories: [] })
const byTitle = async (H) =>
  Object.fromEntries((await db.collection(`homes/${H}/taskTemplates`).get()).docs.map((d) => [d.get("title"), d]))
const stampOf = (d, f) => d.get("fieldSources")?.[f]

test("a fresh parse stamps every field it writes as the manual's, and records the suggestion", async () => {
  const H = "prov-fresh"
  await db.doc(`homes/${H}`).set({ name: "Fresh", freezeRisk: true })
  await db.doc(`homes/${H}/manuals/m1`).set({ itemUnitId: "item1", title: "Manual" })
  await commitDraft(db, {
    homeId: H, manualId: "m1", item: itemFacts("item1"), requestId: "fresh-1", chunks: [], now: NOW,
    tasks: [
      row({ title: "Replace the water filter", priority_tier: "essential", risk_level: "prevent_damage", schedule_type: "semiannual" }),
      row({ title: "Winterize the supply lines", schedule_type: "seasonal" }),
    ],
  })
  const t = await byTitle(H)
  const filter = t["Replace the water filter"]
  for (const f of FIELDS) {
    const s = stampOf(filter, f)
    assert.equal(s.by, "manual", f)
    assert.equal(s.uid, null, f)
    assert.equal(s.via, "commitDraft", f)
    assert.ok(s.at instanceof Timestamp, f)
    assert.equal(sourceOf(filter.data(), f)?.by, "manual", `${f}: the reader trusts a stamp that matches the stored value`)
  }
  assert.deepEqual(stampOf(filter, "schedule").value, { scheduleType: "semiannual", intervalDays: null, season: null })
  assert.equal(stampOf(filter, "remindEnabled").value, null, "a fresh parse never chooses a reminder")
  const sug = filter.get("manualSuggestion")
  assert.equal(sug.priorityTier, "essential")
  assert.equal(sug.careType, "maintenance")
  assert.equal(sug.remindEnabled, null)
  assert.deepEqual(sug.schedule, { scheduleType: "semiannual", intervalDays: null, season: null })
  assert.equal(sug.manualId, "m1")
  // The season the template stores (inferred from the title) is the season stamped.
  const winter = t["Winterize the supply lines"]
  assert.equal(winter.get("schedule").season, "fall")
  assert.deepEqual(stampOf(winter, "schedule").value, { scheduleType: "seasonal", intervalDays: null, season: "fall" })
})

test("a re-scan still overwrites exactly as before — and now records that the manual set it", async () => {
  const H = "prov-rescan"
  await db.doc(`homes/${H}`).set({ name: "Rescan", freezeRisk: true })
  await db.doc(`homes/${H}/manuals/m1`).set({ itemUnitId: "item1", title: "Manual" })
  const userStamp = (value) => ({ by: "user", uid: "member-a", at: Timestamp.fromDate(new Date("2026-06-01")), via: "updateTaskSchedule", value })
  // Her task: she made it Optional, cleaning, quarterly, reminder ON.
  await db.doc(`homes/${H}/taskTemplates/tpl1`).set({
    title: "Clean the lint filter", itemUnitId: "item1", manualId: "m1", externalKey: null, deletedAt: null, isActive: true,
    priorityTier: "optional", careType: "cleaning", careTypeOverriddenAt: Timestamp.fromDate(new Date("2026-06-01")),
    remindEnabled: true, missedScans: 0,
    schedule: { scheduleType: "quarterly", intervalDays: null, season: null, anchorDate: "2026-06-01" },
    fieldSources: {
      priorityTier: userStamp("optional"),
      careType: userStamp("cleaning"),
      remindEnabled: userStamp(true),
      schedule: userStamp({ scheduleType: "quarterly", intervalDays: null, season: null }),
    },
  })
  const res = await commitDraft(db, {
    homeId: H, manualId: "m1", item: itemFacts("item1"), requestId: "rescan-1", chunks: [], now: NOW,
    tasks: [row({ title: "Clean the lint filter", priority_tier: "essential", risk_level: "prevent_damage" })],
  })
  assert.equal(res.matched, 1)
  const tpl = await db.doc(`homes/${H}/taskTemplates/tpl1`).get()
  assert.equal((await db.collection(`homes/${H}/taskTemplates`).count().get()).data().count, 1, "matched in place, not re-created")
  // Behaviour as on main (decision doc §C table): every one of her choices replaced.
  assert.equal(tpl.get("priorityTier"), "essential")
  assert.equal(tpl.get("careType"), "maintenance")
  assert.equal(tpl.get("careTypeOverriddenAt"), null)
  assert.equal(tpl.get("remindEnabled"), null)
  assert.equal(tpl.get("schedule").scheduleType, "monthly")
  assert.equal(tpl.get("schedule").anchorDate, "2026-06-23")
  // …and the record is now true to it: the manual set all four, here is what it said.
  for (const f of FIELDS) {
    assert.equal(stampOf(tpl, f).by, "manual", f)
    assert.equal(stampOf(tpl, f).uid, null, `${f}: her uid is gone with her value`)
    assert.equal(sourceOf(tpl.data(), f)?.by, "manual", f)
  }
  assert.equal(tpl.get("manualSuggestion").priorityTier, "essential")
  assert.deepEqual(tpl.get("manualSuggestion").schedule, { scheduleType: "monthly", intervalDays: null, season: null })
})

test("a learned house rule's rewrite is stamped system; the suggestion keeps what the manual said", async () => {
  const H = "prov-rule"
  await db.doc(`homes/${H}`).set({ name: "Rules", freezeRisk: true })
  await db.doc(`homes/${H}/manuals/m1`).set({ itemUnitId: "item1", title: "Manual" })
  await db.doc(`homes/${H}/houseRules/r1`).set({
    kind: "tier_remap", match: { by: "seasonalFamily", family: "freeze_prep" }, toTier: "optional", isActive: true, deletedAt: null,
  })
  await commitDraft(db, {
    homeId: H, manualId: "m1", item: itemFacts("item1"), requestId: "rule-1", chunks: [], now: NOW,
    tasks: [row({ title: "Winterize the outdoor faucet", priority_tier: "essential", risk_level: "prevent_damage", schedule_type: "seasonal" })],
  })
  const tpl = (await byTitle(H))["Winterize the outdoor faucet"]
  assert.equal(tpl.get("priorityTier"), "optional", "the rule still applies, as before")
  assert.equal(stampOf(tpl, "priorityTier").by, "system")
  assert.equal(stampOf(tpl, "priorityTier").via, "houseRule")
  assert.equal(stampOf(tpl, "careType").by, "manual", "a field the rule didn't touch stays the manual's")
  assert.equal(tpl.get("manualSuggestion").priorityTier, "essential", "the suggestion is the manual's, before the rule")
})

test("a reviewed draft (the real commitManualDraft): her edits are hers, untouched rows the manual's", async () => {
  const H = "prov-review"
  const REVIEWER = "reviewer-1"
  await db.doc(`homes/${H}`).set({ name: "Review", freezeRisk: true })
  await db.doc(`homes/${H}/members/${REVIEWER}`).set({ uid: REVIEWER, role: "member" })
  await db.doc(`homes/${H}/items/item1`).set({ displayName: "Bosch Dishwasher", itemCategory: "major_appliance" })
  // The worker's preview draft — the manual's suggestion for each row.
  const draft = [
    row({ title: "Replace the water filter", priority_tier: "essential", risk_level: "prevent_damage", schedule_type: "semiannual" }),
    row({ title: "Clean the door gasket", care_type: "cleaning" }),
    row({ title: "Purge Hot Water Lines Before First Use", schedule_type: "as_needed" }),
  ]
  await db.doc(`homes/${H}/manuals/m1`).set({ itemUnitId: "item1", title: "Manual", previewDraft: { chunks: [], tasks: draft } })

  // What the sheet sends back (PreviewTask shape): the filter retiered to
  // Optional with the reminder on; the gasket untouched; the purge step as the
  // review corrected it (setup); and a row the draft never had.
  const sent = (r, over = {}) => ({
    title: r.title, description: r.description, care_type: r.care_type, priority_tier: r.priority_tier,
    risk_level: r.risk_level, estimated_minutes: r.estimated_minutes, schedule_type: r.schedule_type,
    interval_days: r.interval_days, instructions_text: r.instructions_override, symptom_tags: [], re_check_triggers: [],
    applies_to: [], supplies: [], remind_enabled: null, ...over,
  })
  const tasks = [
    sent(draft[0], { priority_tier: "optional", remind_enabled: true }),
    sent(draft[1]),
    sent(draft[2], { schedule_type: "setup" }),
    sent(row({ title: "Check the spray arms" }), { priority_tier: "essential" }),
  ]
  const res = await commitManualDraft.run({ data: { homeId: H, manualId: "m1", chunks: [], tasks }, auth: { uid: REVIEWER } })
  assert.equal(res.ok, true)

  const t = await byTitle(H)
  const filter = t["Replace the water filter"]
  assert.equal(filter.get("priorityTier"), "optional", "what is written is still the reviewed row")
  assert.deepEqual(
    { by: stampOf(filter, "priorityTier").by, uid: stampOf(filter, "priorityTier").uid, via: stampOf(filter, "priorityTier").via },
    { by: "user", uid: REVIEWER, via: "parseReview" },
  )
  assert.equal(stampOf(filter, "remindEnabled").by, "user")
  assert.equal(stampOf(filter, "remindEnabled").uid, REVIEWER)
  assert.equal(stampOf(filter, "careType").by, "manual")
  assert.equal(stampOf(filter, "schedule").by, "manual")
  assert.equal(filter.get("manualSuggestion").priorityTier, "essential", "the manual said Essential")
  assert.equal(filter.get("manualSuggestion").remindEnabled, null)

  for (const f of FIELDS) assert.equal(stampOf(t["Clean the door gasket"], f).by, "manual", `untouched row: ${f}`)
  const purge = t["Purge Hot Water Lines Before First Use"]
  assert.equal(purge.get("schedule").scheduleType, "setup")
  assert.equal(stampOf(purge, "schedule").by, "manual", "the review's own setup correction is not her choice")

  const extra = t["Check the spray arms"]
  for (const f of FIELDS) assert.equal(stampOf(extra, f), null, `no draft row → unknown: ${f}`)
  assert.equal(extra.get("manualSuggestion"), null)
})

// The review sheet's PreviewTask shape for a row, as handleSave sends it.
const sentRow = (r, over = {}) => ({
  title: r.title, description: r.description, care_type: r.care_type, priority_tier: r.priority_tier,
  risk_level: r.risk_level, estimated_minutes: r.estimated_minutes, schedule_type: r.schedule_type,
  interval_days: r.interval_days, instructions_text: r.instructions_override, symptom_tags: [], re_check_triggers: [],
  applies_to: [], supplies: [], remind_enabled: null, ...over,
})

async function reviewHome(H, uid, draft) {
  await db.doc(`homes/${H}`).set({ name: "Season", freezeRisk: true })
  await db.doc(`homes/${H}/members/${uid}`).set({ uid, role: "member" })
  await db.doc(`homes/${H}/items/item1`).set({ displayName: "Outdoor faucet", itemCategory: "plumbing" })
  await db.doc(`homes/${H}/manuals/m1`).set({ itemUnitId: "item1", title: "Manual", previewDraft: { chunks: [], tasks: draft } })
}

test("a season the reviewer picked is kept — not re-derived from the title — and is hers", async () => {
  const H = "prov-season-picked"
  const REVIEWER = "reviewer-season"
  // "Spring startup" puts this task in SPRING by its title (seasonForTask).
  const draft = [row({ title: "Spring startup of the sprinkler system", schedule_type: "seasonal" })]
  await reviewHome(H, REVIEWER, draft)
  const res = await commitManualDraft.run({
    data: { homeId: H, manualId: "m1", chunks: [], tasks: [sentRow(draft[0], { season: "fall" })] },
    auth: { uid: REVIEWER },
  })
  assert.equal(res.ok, true)

  const tpl = (await byTitle(H))["Spring startup of the sprinkler system"]
  assert.equal(tpl.get("schedule").season, "fall", "the reviewer's season is what is stored")
  const s = stampOf(tpl, "schedule")
  assert.deepEqual({ by: s.by, uid: s.uid, via: s.via }, { by: "user", uid: REVIEWER, via: "parseReview" })
  assert.deepEqual(s.value, { scheduleType: "seasonal", intervalDays: null, season: "fall" })
  assert.equal(sourceOf(tpl.data(), "schedule")?.by, "user")
  assert.deepEqual(tpl.get("manualSuggestion").schedule, { scheduleType: "seasonal", intervalDays: null, season: "spring" }, "the manual (by its title) said spring")
  for (const f of ["priorityTier", "remindEnabled", "careType"]) assert.equal(stampOf(tpl, f).by, "manual", `untouched: ${f}`)

  // And it is SCHEDULED on her season: the one instance lands on a fall anchor.
  const inst = await db.collection(`homes/${H}/taskInstances`).where("taskTemplateId", "==", tpl.id).get()
  assert.equal(inst.size, 1)
  assert.match(inst.docs[0].get("dueDate"), /-10-15$/, "fall's anchor, not spring's 04-15")
})

test("no season sent → the title decides, as before, and it is the manual's", async () => {
  const H = "prov-season-absent"
  const REVIEWER = "reviewer-season-2"
  const draft = [row({ title: "Spring startup of the sprinkler system", schedule_type: "seasonal" })]
  await reviewHome(H, REVIEWER, draft)
  // One row sends nothing for season, the other the sheet's untouched null.
  const res = await commitManualDraft.run({
    data: { homeId: H, manualId: "m1", chunks: [], tasks: [sentRow(draft[0])] },
    auth: { uid: REVIEWER },
  })
  assert.equal(res.ok, true)
  const tpl = (await byTitle(H))["Spring startup of the sprinkler system"]
  assert.equal(tpl.get("schedule").season, "spring")
  assert.equal(stampOf(tpl, "schedule").by, "manual")
  const inst = await db.collection(`homes/${H}/taskInstances`).where("taskTemplateId", "==", tpl.id).get()
  assert.match(inst.docs[0].get("dueDate"), /-04-15$/)

  // The sheet's untouched seasonal row sends `season: null` — same outcome.
  const H2 = "prov-season-null"
  await reviewHome(H2, REVIEWER, draft)
  await commitManualDraft.run({
    data: { homeId: H2, manualId: "m1", chunks: [], tasks: [sentRow(draft[0], { season: null })] },
    auth: { uid: REVIEWER },
  })
  const tpl2 = (await byTitle(H2))["Spring startup of the sprinkler system"]
  assert.equal(tpl2.get("schedule").season, "spring")
  assert.equal(stampOf(tpl2, "schedule").by, "manual")
})

test("a season left on a row she moved off seasonal changes nothing", async () => {
  const H = "prov-season-stale"
  const REVIEWER = "reviewer-season-3"
  const draft = [row({ title: "Spring startup of the sprinkler system", schedule_type: "seasonal" })]
  await reviewHome(H, REVIEWER, draft)
  await commitManualDraft.run({
    data: { homeId: H, manualId: "m1", chunks: [], tasks: [sentRow(draft[0], { schedule_type: "annual", season: "fall" })] },
    auth: { uid: REVIEWER },
  })
  const tpl = (await byTitle(H))["Spring startup of the sprinkler system"]
  assert.equal(tpl.get("schedule").scheduleType, "annual")
  assert.equal(tpl.get("schedule").season, "spring", "a non-seasonal row stores the title's season, exactly as before")
})

test("a reviewed row with no draft counterpart keeps the manual's earlier suggestion", async () => {
  const H = "prov-keep-suggestion"
  const REVIEWER = "reviewer-keep"
  await reviewHome(H, REVIEWER, [])
  // An earlier parse of m1 created the task and recorded the manual's word.
  await commitDraft(db, {
    homeId: H, manualId: "m1", item: itemFacts("item1"), requestId: "first-parse", chunks: [], now: NOW,
    tasks: [row({ title: "Drain the supply line", priority_tier: "essential", schedule_type: "annual" })],
  })
  const before = (await byTitle(H))["Drain the supply line"]
  assert.equal(before.get("manualSuggestion").priorityTier, "essential")
  const at = before.get("manualSuggestion").at

  // A review whose draft no longer has that row (nothing to pair it with).
  await db.doc(`homes/${H}/manuals/m1`).set(
    { previewDraft: { chunks: [], tasks: [row({ title: "Something else entirely" })] } },
    { merge: true },
  )
  const res = await commitManualDraft.run({
    data: {
      homeId: H, manualId: "m1", chunks: [],
      tasks: [sentRow(row({ title: "Drain the supply line", priority_tier: "essential", schedule_type: "annual" }), { priority_tier: "optional" })],
    },
    auth: { uid: REVIEWER },
  })
  assert.equal(res.ok, true)
  const after = (await byTitle(H))["Drain the supply line"]
  assert.equal(after.id, before.id, "matched in place, not re-created")
  assert.equal(after.get("priorityTier"), "optional", "what is written is still the reviewed row")
  const sug = after.get("manualSuggestion")
  assert.ok(sug, "the earlier suggestion was kept, not overwritten with null")
  assert.equal(sug.priorityTier, "essential")
  assert.equal(sug.manualId, "m1")
  assert.ok(sug.at.isEqual(at), "untouched — still the first parse's record")
  for (const f of FIELDS) assert.equal(stampOf(after, f), null, `no draft row → unknown: ${f}`)
})

test("the classifier backfill stamps only what it changes, as system", async () => {
  const H = "prov-classify"
  const U = "member-c"
  await db.doc(`homes/${H}`).set({ name: "Classify" })
  await db.doc(`homes/${H}/members/${U}`).set({ uid: U, role: "owner" })
  const herTier = { by: "user", uid: U, at: Timestamp.fromDate(new Date("2026-06-01")), via: "setTaskReminder", value: "optional" }
  await db.doc(`homes/${H}/taskTemplates/tplC`).set({
    title: "Wipe the drum", itemUnitId: null, deletedAt: null, isActive: true, justification: null, careTypeOverriddenAt: null,
    priorityTier: "optional", careType: "maintenance", remindEnabled: null, symptomTags: [],
    schedule: { scheduleType: "monthly", intervalDays: null, season: null },
    fieldSources: { priorityTier: herTier },
  })
  const results = [{
    task_template_id: "tplC", proposed_is_reference: false, justification: "Skipping it lets odor build up.",
    title: "Wipe the drum", item_name: null, current_schedule_type: "monthly", current_care_type: "maintenance", current_symptom_tags: [],
    proposed_care_type: "cleaning", proposed_schedule_type: "weekly", proposed_symptom_tags: [],
    care_change: true, schedule_change: true, symptom_tags_change: false,
  }]
  const res = await classifyExistingTasks.run({ data: { homeId: H, dryRun: false, results }, auth: { uid: U } })
  assert.equal(res.writes, 1)
  const tpl = await db.doc(`homes/${H}/taskTemplates/tplC`).get()
  assert.equal(tpl.get("careType"), "cleaning")
  assert.equal(tpl.get("schedule").scheduleType, "weekly")
  assert.deepEqual(
    { by: stampOf(tpl, "careType").by, via: stampOf(tpl, "careType").via, value: stampOf(tpl, "careType").value },
    { by: "system", via: "classifyExistingTasks", value: "cleaning" },
  )
  assert.deepEqual(stampOf(tpl, "schedule").value, { scheduleType: "weekly", intervalDays: null, season: null })
  assert.equal(sourceOf(tpl.data(), "schedule")?.by, "system")
  // update() with dotted paths: her priority stamp is untouched, the
  // untouched reminder has none.
  assert.deepEqual(stampOf(tpl, "priorityTier"), herTier)
  assert.equal(stampOf(tpl, "remindEnabled"), undefined)
})
