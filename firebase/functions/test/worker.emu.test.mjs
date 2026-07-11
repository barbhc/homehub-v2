/**
 * Parse-worker integration test — drives the runParse CORE against the Firestore
 * emulator with a FIXTURE Claude response (no API, no cost). Proves the plan's
 * Phase 3 gate: stage sequence, committed docs, and reconciliation behavior
 * (fuzzy-matched rescan title → UPDATE not delete/insert; malformed extraction →
 * refuses to commit; stale delivery → no-op).
 *
 * Imports the COMPILED lib (npm run build first) so shared-parse rootDirs
 * resolution + firebase-admin are the same single instance the worker uses.
 *
 * Run: `npm run test:worker:emu` from the repo root (wraps emulators:exec).
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import { getApps, initializeApp } from "firebase-admin/app"
import { getFirestore, Timestamp } from "firebase-admin/firestore"
import { runParse } from "../lib/firebase/functions/src/parse/runParse.js"

assert.ok(process.env.FIRESTORE_EMULATOR_HOST, "FIRESTORE_EMULATOR_HOST must be set (run via emulators:exec)")

if (getApps().length === 0) initializeApp({ projectId: "demo-homehub" })
const db = getFirestore()
const NOW = new Date("2026-06-23T00:00:00Z")

/** Fixture Claude response: forced tool_use block, the shape extractParsedResult reads. */
function fixture(tasks, chunks = [{ chunk_type: "care", content: "Wipe the seals monthly.", title: "Care", source_pages: [3] }]) {
  return {
    content: [
      {
        type: "tool_use",
        name: "record_extraction",
        input: { chunks, tasks, confidence: { overall: 0.9, safety: 0.9, how_to: 0.9, care: 0.9, troubleshooting: 0.8, notes: "" } },
      },
    ],
  }
}
const deps = (claudeResponse) => ({
  callClaude: async () => claudeResponse,
  fetchPdf: async () => "", // base64 body is irrelevant to the fixture path
})

async function seedManual(homeId, manualId, requestId) {
  await db.doc(`homes/${homeId}/items/item1`).set({ displayName: "Bosch Dishwasher", itemCategory: "major_appliance", model: "SHPM88" })
  await db.doc(`homes/${homeId}/manuals/${manualId}`).set({
    itemUnitId: "item1",
    sourceType: "upload",
    sourceRef: "manuals/item1.pdf",
    title: "Manual",
    parse: { requestId, stage: "queued", stageAt: Timestamp.fromDate(NOW) },
  })
}
const count = async (path, ...wh) => {
  let q = db.collection(path)
  for (const [f, op, v] of wh) q = q.where(f, op, v)
  return (await q.count().get()).data().count
}

test("commit: stage reaches done and writes chunks + templates + instances", async () => {
  const H = "home-commit"
  await seedManual(H, "m1", "req1")
  const tasks = [
    { title: "Descale the dishwasher", schedule_type: "monthly", care_type: "cleaning", priority_tier: "recommended", risk_level: "performance", instructions_text: "Run a hot cycle with descaler." },
    { title: "Clean the filter", schedule_type: "monthly", care_type: "maintenance", priority_tier: "essential", risk_level: "prevent_damage" },
  ]
  const out = await runParse(db, deps(fixture(tasks)), { homeId: H, manualId: "m1", requestId: "req1", mode: "commit", now: NOW })

  assert.equal(out.stage, "done")
  assert.equal(out.summary.tasks, 2)
  const manual = await db.doc(`homes/${H}/manuals/m1`).get()
  assert.equal(manual.get("parse.stage"), "done")
  assert.equal(manual.get("parse.committedRequestId"), "req1")
  assert.equal(manual.get("parsedAt") != null, true)
  assert.equal(await count(`homes/${H}/manuals/m1/chunks`), 1)
  assert.equal(await count(`homes/${H}/taskTemplates`), 2)
  // Both are monthly (recurring) → one initial instance each, carrying denorm.
  assert.equal(await count(`homes/${H}/taskInstances`), 2)
  const inst = (await db.collection(`homes/${H}/taskInstances`).limit(1).get()).docs[0]
  assert.equal(inst.get("itemName"), "Bosch Dishwasher") // denorm stamped
  assert.ok(inst.get("priorityTier"))
})

test("rescan: a fuzzy-retitled task UPDATES in place (no delete/insert)", async () => {
  const H = "home-rescan"
  await seedManual(H, "m1", "reqA")
  const first = [
    { title: "Run Citrus-Only Cycle to Refresh Filters", schedule_type: "monthly", care_type: "cleaning", priority_tier: "recommended", risk_level: "performance" },
    { title: "Test smoke detectors", schedule_type: "semiannual", care_type: "maintenance", priority_tier: "essential", risk_level: "safety" },
  ]
  await runParse(db, deps(fixture(first)), { homeId: H, manualId: "m1", requestId: "reqA", mode: "commit", now: NOW })
  const idsBefore = (await db.collection(`homes/${H}/taskTemplates`).get()).docs.map((d) => d.id).sort()
  assert.equal(idsBefore.length, 2)

  // New enqueue: task 1 retitled (fuzzy match), task 2 identical, task 3 new.
  await db.doc(`homes/${H}/manuals/m1`).set({ parse: { requestId: "reqB" } }, { merge: true })
  const second = [
    { title: "Run Odor-Mitigation Citrus Cycle to Refresh the Filters", schedule_type: "monthly", care_type: "cleaning", priority_tier: "recommended", risk_level: "performance" },
    { title: "Test smoke detectors", schedule_type: "semiannual", care_type: "maintenance", priority_tier: "essential", risk_level: "safety" },
    { title: "Vacuum the coils", schedule_type: "semiannual", care_type: "maintenance", priority_tier: "recommended", risk_level: "performance" },
  ]
  await runParse(db, deps(fixture(second)), { homeId: H, manualId: "m1", requestId: "reqB", mode: "commit", now: NOW })

  const after = await db.collection(`homes/${H}/taskTemplates`).where("deletedAt", "==", null).get()
  // 2 matched (updated in place) + 1 inserted = 3; NOT 4 (no delete-and-reinsert churn).
  assert.equal(after.size, 3)
  const idsAfter = after.docs.map((d) => d.id)
  // The two original template doc IDs survive (matched, not recreated).
  for (const id of idsBefore) assert.ok(idsAfter.includes(id), `original template ${id} should survive rescan`)
})

test("malformed extraction refuses to commit (error stage, no chunk swap)", async () => {
  const H = "home-malformed"
  await seedManual(H, "m1", "reqM")
  // First a good commit so there ARE chunks to (not) clobber.
  await runParse(db, deps(fixture([{ title: "A task", schedule_type: "monthly", care_type: "cleaning", priority_tier: "optional", risk_level: "comfort" }])), { homeId: H, manualId: "m1", requestId: "reqM", mode: "commit", now: NOW })
  assert.equal(await count(`homes/${H}/manuals/m1/chunks`), 1)

  // Now a malformed response (no tool_use, text w/o arrays).
  await db.doc(`homes/${H}/manuals/m1`).set({ parse: { requestId: "reqBad" } }, { merge: true })
  const malformed = { content: [{ type: "text", text: "Sorry, I can't read this PDF." }] }
  const out = await runParse(db, deps(malformed), { homeId: H, manualId: "m1", requestId: "reqBad", mode: "commit", now: NOW })

  assert.equal(out.stage, "error")
  const manual = await db.doc(`homes/${H}/manuals/m1`).get()
  assert.equal(manual.get("parse.stage"), "error")
  assert.ok(manual.get("parse.error.message").includes("malformed"))
  // Chunks from the good commit are untouched (no partial swap).
  assert.equal(await count(`homes/${H}/manuals/m1/chunks`), 1)
})

test("stale delivery is a no-op (requestId superseded)", async () => {
  const H = "home-stale"
  await seedManual(H, "m1", "reqNEW") // manual currently claims reqNEW
  const out = await runParse(db, deps(fixture([{ title: "x", schedule_type: "monthly", care_type: "cleaning", priority_tier: "optional", risk_level: "comfort" }])), { homeId: H, manualId: "m1", requestId: "reqOLD", mode: "commit", now: NOW })
  assert.equal(out.stale, true)
  assert.equal(await count(`homes/${H}/taskTemplates`), 0) // nothing committed
})

test("preview mode writes previewDraft and never commits", async () => {
  const H = "home-preview"
  await seedManual(H, "m1", "reqP")
  const out = await runParse(db, deps(fixture([{ title: "Preview task", schedule_type: "monthly", care_type: "cleaning", priority_tier: "optional", risk_level: "comfort" }])), { homeId: H, manualId: "m1", requestId: "reqP", mode: "preview", now: NOW })
  assert.equal(out.stage, "done")
  const manual = await db.doc(`homes/${H}/manuals/m1`).get()
  assert.ok(manual.get("previewDraft"))
  assert.equal(manual.get("parse.committedRequestId") ?? null, null) // not committed
  assert.equal(await count(`homes/${H}/taskTemplates`), 0)
})
