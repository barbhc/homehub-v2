/**
 * commitManualDraft integration test — the "re-review then save" path. Drives the
 * SAME normalize + commitDraft the callable runs, but with CLIENT-shaped input
 * (PreviewChunk/PreviewTask, i.e. edited draft rows) to prove those survive
 * normalization and commit to chunks + templates + recurring instances. The
 * onCall wrapper only adds auth + a member check on top of this.
 *
 * Run: `npm run test:worker:emu` (wraps emulators:exec). Build lib first.
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import { getApps, initializeApp } from "firebase-admin/app"
import { getFirestore, Timestamp } from "firebase-admin/firestore"
import { normalizeChunkRow, normalizeTaskRow } from "../lib/shared/parse/parseCore.js"
import { commitDraft, COMMIT_CLAIM_TTL_MS } from "../lib/firebase/functions/src/parse/commitDraft.js"
import { supersededDraft } from "../lib/firebase/functions/src/parse/commitManualDraft.js"

assert.ok(process.env.FIRESTORE_EMULATOR_HOST, "FIRESTORE_EMULATOR_HOST must be set (run via emulators:exec)")
if (getApps().length === 0) initializeApp({ projectId: "demo-homehub" })
const db = getFirestore()
const NOW = new Date("2026-06-23T00:00:00Z")

const count = async (path) => (await db.collection(path).count().get()).data().count

test("commitManualDraft path: edited PreviewTask/Chunk normalize + commit", async () => {
  const H = "home-review"
  await db.doc(`homes/${H}/items/item1`).set({ displayName: "Bosch Dishwasher", itemCategory: "major_appliance", model: "SHPM88" })
  await db.doc(`homes/${H}/manuals/m1`).set({
    itemUnitId: "item1",
    sourceType: "upload",
    sourceRef: "manuals/item1.pdf",
    title: "Manual",
    // a stale previewDraft the commit should clear
    previewDraft: { chunks: [], tasks: [] },
    parse: { stage: "done", stageAt: Timestamp.fromDate(NOW) },
  })

  // Client-edited rows — PreviewChunk/PreviewTask shapes (what the review UI sends).
  const chunks = [
    { chunk_type: "care", title: "Descaling", content: "Run a descaler cycle.", tags: ["care"], source_pages: [4], applies_to: [] },
  ]
  const tasks = [
    {
      title: "Descale the dishwasher",
      description: null,
      care_type: "maintenance",
      priority_tier: "essential",
      risk_level: "prevent_damage",
      estimated_minutes: 15,
      schedule_type: "monthly",
      interval_days: null,
      instructions_text: "1. Empty the machine.\n2. Add descaler.\n3. Run a hot cycle.",
      symptom_tags: ["performance_drop"],
      re_check_triggers: [],
      applies_to: [],
      supplies: [],
    },
  ]

  const item = {
    itemUnitId: "item1", item_category: "major_appliance", sub_type: null,
    display_name: "Bosch Dishwasher", model: "SHPM88", accessories: [],
  }
  const normChunks = chunks.map((c) => normalizeChunkRow(c, "m1"))
  const normTasks = tasks.map((t) => normalizeTaskRow(t))
  const res = await commitDraft(db, { homeId: H, manualId: "m1", item, requestId: "review-1", chunks: normChunks, tasks: normTasks, now: NOW })

  assert.equal(res.chunks, 1)
  assert.equal(res.tasks, 1)
  assert.equal(await count(`homes/${H}/manuals/m1/chunks`), 1)
  assert.equal(await count(`homes/${H}/taskTemplates`), 1)
  // monthly → recurring → one seeded instance carrying the denorm set.
  assert.equal(await count(`homes/${H}/taskInstances`), 1)

  // The committed template preserves the edited fields + derived steps.
  const tpl = (await db.collection(`homes/${H}/taskTemplates`).get()).docs[0]
  assert.equal(tpl.get("title"), "Descale the dishwasher")
  assert.equal(tpl.get("careType"), "maintenance")
  assert.equal(tpl.get("schedule").scheduleType, "monthly")
  assert.ok(Array.isArray(tpl.get("steps")) && tpl.get("steps").length === 3, "instructions → 3 structured steps")
})

// ── Phase B: learned house rules applied during commit ───────────────────────
function previewTask(over) {
  return {
    title: "Task", description: null, care_type: "maintenance", priority_tier: "essential",
    risk_level: "comfort", estimated_minutes: 10, schedule_type: "annual", interval_days: null,
    instructions_text: null, symptom_tags: [], re_check_triggers: [], applies_to: [], supplies: [],
    ...over,
  }
}

test("houseRules apply during commit: suppress drops, tier_remap rewrites, others pass", async () => {
  const H = "home-rules"
  await db.doc(`homes/${H}`).set({ name: "Rules Home", freezeRisk: true })
  await db.doc(`homes/${H}/manuals/m1`).set({ itemUnitId: "item1", title: "Manual" })
  await db.doc(`homes/${H}/houseRules/r1`).set({ kind: "suppress", match: { by: "symptomTags", tags: ["odor"] }, isActive: true, deletedAt: null })
  await db.doc(`homes/${H}/houseRules/r2`).set({ kind: "tier_remap", match: { by: "seasonalFamily", family: "freeze_prep" }, toTier: "optional", isActive: true, deletedAt: null })

  const tasks = [
    previewTask({ title: "Clean the drain trap", symptom_tags: ["odor"] }),           // suppressed
    previewTask({ title: "Winterize the outdoor faucet", schedule_type: "seasonal" }), // → optional
    previewTask({ title: "Test smoke & CO detectors", risk_level: "safety" }),         // untouched
  ]
  const item = { itemUnitId: "item1", item_category: "major_appliance", sub_type: null, display_name: "X", model: null, accessories: [] }
  const res = await commitDraft(db, { homeId: H, manualId: "m1", item, requestId: "rules-1", chunks: [], tasks: tasks.map((t) => normalizeTaskRow(t)), now: NOW })

  assert.equal(res.tasks, 2, "suppressed row is not committed")
  const tpls = (await db.collection(`homes/${H}/taskTemplates`).get()).docs
  const byTitle = Object.fromEntries(tpls.map((d) => [d.get("title"), d]))
  assert.equal(tpls.length, 2)
  assert.ok(!byTitle["Clean the drain trap"], "odor task suppressed")
  assert.equal(byTitle["Winterize the outdoor faucet"].get("priorityTier"), "optional", "freeze_prep retiered")
  assert.equal(byTitle["Test smoke & CO detectors"].get("priorityTier"), "essential", "untouched task keeps its tier")
})

test("climate: freezeRisk=false suppresses winterizing at parse time", async () => {
  const H = "home-climate"
  await db.doc(`homes/${H}`).set({ name: "Mild Home", freezeRisk: false })
  await db.doc(`homes/${H}/manuals/m1`).set({ itemUnitId: "item1", title: "Manual" })

  const tasks = [
    previewTask({ title: "Winterize the sprinkler line", schedule_type: "seasonal" }), // suppressed by climate
    previewTask({ title: "Vacuum the refrigerator coils" }),                            // kept
  ]
  const item = { itemUnitId: "item1", item_category: "major_appliance", sub_type: null, display_name: "X", model: null, accessories: [] }
  const res = await commitDraft(db, { homeId: H, manualId: "m1", item, requestId: "climate-1", chunks: [], tasks: tasks.map((t) => normalizeTaskRow(t)), now: NOW })

  assert.equal(res.tasks, 1, "winterizing suppressed for a freeze-free home")
  const titles = (await db.collection(`homes/${H}/taskTemplates`).get()).docs.map((d) => d.get("title"))
  assert.deepEqual(titles, ["Vacuum the refrigerator coils"])
})

// ── The commit claim: one review, one commit (Codex review 2026-10-29) ───────
//
// Findings 1 and 2 were one root cause. `commitManualDraft` minted
// `review-${uid}-${Date.now()}` per press, so the idempotency commitDraft
// advertised could never fire for the case that happens — two tabs, or two
// household members, pressing Save on the same ready review. And the check
// itself was a read hundreds of lines before its write, so even a shared id
// would not have serialized them.
//
// Every test here owns a `claim-` prefixed home: `node --test` runs these files
// concurrently, and a previous test in this repo wiped every manual in the
// emulator out from under another suite.
const claimHome = (n) => `claim-${n}`

function claimTask(over) {
  return {
    title: "Descale the dishwasher", description: null, care_type: "maintenance",
    priority_tier: "essential", risk_level: "prevent_damage", estimated_minutes: 15,
    schedule_type: "monthly", interval_days: null, instructions_text: null,
    symptom_tags: [], re_check_triggers: [], applies_to: [], supplies: [],
    ...over,
  }
}

async function seedClaimHome(H) {
  await db.doc(`homes/${H}/items/item1`).set({ displayName: "Dishwasher", itemCategory: "major_appliance" })
  await db.doc(`homes/${H}/manuals/m1`).set({
    itemUnitId: "item1", sourceType: "upload", sourceRef: "manuals/item1.pdf", title: "Manual",
    parse: { stage: "done", stageAt: Timestamp.fromDate(NOW) },
  })
  return {
    homeId: H, manualId: "m1",
    item: { itemUnitId: "item1", item_category: "major_appliance", sub_type: null, display_name: "Dishwasher", model: null, accessories: [] },
    chunks: [],
    tasks: [normalizeTaskRow(claimTask())],
    now: NOW,
  }
}

test("two concurrent saves of one review commit the task ONCE", async () => {
  const H = claimHome("concurrent")
  const input = await seedClaimHome(H)
  // Both tabs reviewed the same draft, so both derive the same requestId —
  // which is the point: the id is the draft's, not the moment of the press.
  const req = "review-run-A"
  const results = await Promise.allSettled([
    commitDraft(db, { ...input, requestId: req }),
    commitDraft(db, { ...input, requestId: req }),
  ])

  assert.equal(await count(`homes/${H}/taskTemplates`), 1, "the task must exist exactly once")
  assert.equal(await count(`homes/${H}/taskInstances`), 1, "and be scheduled exactly once")
  // One did the work; the other either lost the claim or found it committed.
  const fulfilled = results.filter((r) => r.status === "fulfilled")
  assert.ok(fulfilled.length >= 1, "at least one save must succeed")
  const rejected = results.filter((r) => r.status === "rejected")
  for (const r of rejected) {
    assert.equal(r.reason?.name, "CommitInProgressError", `unexpected failure: ${r.reason?.message}`)
  }
})

test("the same requestId committed again is a no-op, not a second insert", async () => {
  const H = claimHome("replay")
  const input = await seedClaimHome(H)
  await commitDraft(db, { ...input, requestId: "review-run-B" })
  const again = await commitDraft(db, { ...input, requestId: "review-run-B" })
  assert.equal(await count(`homes/${H}/taskTemplates`), 1)
  assert.equal(again.inserted, 0, "a replay inserts nothing")
})

test("a live claim from another request is refused, and expires rather than wedging", async () => {
  const H = claimHome("held")
  const input = await seedClaimHome(H)

  // Someone else's save is in flight, claimed one second ago.
  await db.doc(`homes/${H}/manuals/m1`).set(
    { parse: { commitClaim: { requestId: "review-other", at: Timestamp.fromMillis(NOW.getTime() - 1000) } } },
    { merge: true },
  )
  await assert.rejects(
    () => commitDraft(db, { ...input, requestId: "review-mine" }),
    (e) => e.name === "CommitInProgressError",
    "a live claim must refuse, not duplicate",
  )
  assert.equal(await count(`homes/${H}/taskTemplates`), 0, "nothing was written")

  // An attempt that died after claiming must not lock the manual for good:
  // losing a paid parse is worse than the duplicate the claim guards against.
  await db.doc(`homes/${H}/manuals/m1`).set(
    { parse: { commitClaim: { requestId: "review-dead", at: Timestamp.fromMillis(NOW.getTime() - COMMIT_CLAIM_TTL_MS - 1) } } },
    { merge: true },
  )
  await commitDraft(db, { ...input, requestId: "review-mine" })
  assert.equal(await count(`homes/${H}/taskTemplates`), 1, "an expired claim can be taken over")
})

test("a committed manual holds no claim, so the next read can commit", async () => {
  const H = claimHome("released")
  const input = await seedClaimHome(H)
  await commitDraft(db, { ...input, requestId: "review-run-C" })
  const snap = await db.doc(`homes/${H}/manuals/m1`).get()
  assert.equal(snap.get("parse.commitClaim"), null, "the commit write clears its own claim")
  assert.equal(snap.get("parse.committedRequestId"), "review-run-C")
})

test("supersededDraft: a newer read blocks a stale review, unknowns do not", () => {
  // The rule both the Save refusal and the terminal `done` write ask.
  assert.equal(supersededDraft("run-1", "run-2"), true, "a different read owns the draft now")
  assert.equal(supersededDraft("run-1", "run-1"), false, "the same read")
  assert.equal(supersededDraft(undefined, "run-2"), false, "a client that predates the field still saves")
  assert.equal(supersededDraft("run-1", null), false, "a draft written before the run was stamped still saves")
})
