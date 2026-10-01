/**
 * Every server entry point validates its input (H3a) — the cases that need
 * real Firestore, against the emulator. The pure file (inputValidation.test.mjs)
 * proves malformed input never reaches Firestore at all; this one proves what
 * WELL-FORMED but hostile input can and cannot do once it does:
 *
 *  - classifyExistingTasks: a forged apply row — another home's task, mixed
 *    into a real batch, or carrying fields the dry run never sends — is refused
 *    as a whole, and nothing is written in either home;
 *  - a manual whose stored source points into ANOTHER home's Storage folder is
 *    refused before any charge (ingestReference, detectDocType);
 *  - stored data of the wrong shape (an invite expiry, an invite-code doc, a
 *    template id with a slash, a string interval, a ledger entry) is read as
 *    what it is instead of crashing as "internal" or writing garbage.
 *
 * Every home here is this file's own (prefix `iv-`) and is removed after.
 * Run via `npm run test:worker:emu` (compiles first; FIRESTORE_EMULATOR_HOST set).
 */
import { test, after } from "node:test"
import assert from "node:assert/strict"
import { getApps, initializeApp } from "firebase-admin/app"
import { getFirestore, Timestamp } from "firebase-admin/firestore"

assert.ok(process.env.FIRESTORE_EMULATOR_HOST, "FIRESTORE_EMULATOR_HOST must be set (run via emulators:exec)")
if (getApps().length === 0) initializeApp({ projectId: "demo-homehub" })
const db = getFirestore()

const lib = (p) => import(`../lib/firebase/functions/src/${p}.js`)
const { classifyExistingTasks } = await lib("ai/classifyExistingTasks")
const { ingestReference } = await lib("ai/ingestReference")
const { detectDocType } = await lib("ai/detectDocType")
const { commitManualDraft } = await lib("parse/commitManualDraft")
const { acceptInvite, getInviteDetails } = await lib("invites/inviteActions")
const { redeemInviteCode } = await lib("growth/redeemInviteCode")
const { handleCompleteTask } = await lib("tasks/completeTask")
const { runRollForward } = await lib("schedule/rollForward")
const { refundParseCharge } = await lib("lib/parseCharges")

const RUN = `${Date.now()}`
const homes = []
const home = (label) => {
  const id = `iv-${label}-${RUN}`
  homes.push(id)
  return id
}
after(async () => {
  await Promise.all(homes.map((h) => db.recursiveDelete(db.doc(`homes/${h}`))))
})

const codeOf = async (promise) => {
  try {
    await promise
    return "resolved"
  } catch (e) {
    return e?.code ?? `threw ${e?.message}`
  }
}

/** Every document under a path, as data — the before/after of "nothing written". */
async function subtree(ref) {
  const out = {}
  const snap = await ref.get()
  if (snap.exists) out[ref.path] = snap.data()
  for (const col of await ref.listCollections()) {
    for (const d of await col.listDocuments()) Object.assign(out, await subtree(d))
  }
  return out
}
const usageOf = async (uid) => (await db.collection(`usage/${uid}/daily`).get()).docs.map((d) => d.data())

async function seedMember(H, uid, role = "owner") {
  await db.doc(`homes/${H}`).set({ name: H, createdBy: uid, timezone: "America/Los_Angeles" }, { merge: true })
  await db.doc(`homes/${H}/members/${uid}`).set({ uid, role })
}

/** A classifier candidate, as the parser and the app store templates. */
async function seedTemplate(H, id, over = {}) {
  await db.doc(`homes/${H}/taskTemplates/${id}`).set({
    title: "Clean the filter",
    careType: "cleaning",
    symptomTags: [],
    schedule: { scheduleType: "monthly", intervalDays: null },
    justification: null,
    careTypeOverriddenAt: null,
    deletedAt: null,
    isActive: true,
    defaultAssignee: null,
    ...over,
  })
}

/** A dry-run row, exactly as the computed path builds one. */
const row = (id, over = {}) => ({
  task_template_id: id,
  title: "Clean the filter",
  item_name: null,
  current_schedule_type: "monthly",
  proposed_schedule_type: "quarterly",
  current_care_type: "cleaning",
  proposed_care_type: "maintenance",
  current_symptom_tags: [],
  proposed_symptom_tags: ["drainage"],
  justification: "A clogged filter strains the pump.",
  care_change: true,
  schedule_change: true,
  symptom_tags_change: true,
  proposed_is_reference: false,
  change: true,
  ...over,
})
const applyAs = (uid, homeId, results) => classifyExistingTasks.run({ data: { homeId, dryRun: false, results }, auth: { uid } })

// ─── classifyExistingTasks: the precomputed apply path ──────────────────────

test("classify apply: a row naming ANOTHER home's task is refused, and nothing is written anywhere", async () => {
  const A = home("cls-mine"), B = home("cls-theirs")
  await seedMember(A, "iv-u1")
  await seedMember(B, "iv-u2")
  await seedTemplate(A, "a1")
  await seedTemplate(B, "b1")
  const before = { a: await subtree(db.doc(`homes/${A}`)), b: await subtree(db.doc(`homes/${B}`)) }

  // Alone…
  assert.equal(await codeOf(applyAs("iv-u1", A, [row("b1")])), "invalid-argument")
  // …and hidden in a real batch: the whole apply is refused, so a1 is untouched too.
  assert.equal(await codeOf(applyAs("iv-u1", A, [row("a1"), row("b1")])), "invalid-argument")
  // Asking for B outright is a membership failure, not a write.
  assert.equal(await codeOf(applyAs("iv-u1", B, [row("b1")])), "permission-denied")

  assert.deepEqual(await subtree(db.doc(`homes/${A}`)), before.a, "my home: unchanged")
  assert.deepEqual(await subtree(db.doc(`homes/${B}`)), before.b, "their home: unchanged")
})

test("classify apply: a real dry-run row writes exactly the four fields it names — nothing it smuggles", async () => {
  const A = home("cls-apply")
  await seedMember(A, "iv-u1")
  await seedTemplate(A, "a1", { defaultAssignee: null, priorityTier: "recommended" })
  const before = (await db.doc(`homes/${A}/taskTemplates/a1`).get()).data()

  const res = await applyAs("iv-u1", A, [
    row("a1", { isActive: false, defaultAssignee: "intruder", priorityTier: "essential", deletedAt: Timestamp.now() }),
  ])
  assert.equal(res.writes, 1)
  const after = (await db.doc(`homes/${A}/taskTemplates/a1`).get()).data()
  assert.equal(after.careType, "maintenance")
  assert.deepEqual(after.symptomTags, ["drainage"])
  assert.equal(after.schedule.scheduleType, "quarterly")
  assert.equal(after.schedule.intervalDays, null)
  assert.equal(after.justification, "A clogged filter strains the pump.")
  // Everything outside the whitelist is as it was.
  for (const k of ["isActive", "defaultAssignee", "priorityTier", "deletedAt", "title", "careTypeOverriddenAt"]) {
    assert.deepEqual(after[k], before[k], k)
  }
  const changed = Object.keys(after).filter((k) => JSON.stringify(after[k]) !== JSON.stringify(before[k])).sort()
  assert.deepEqual(changed, ["careType", "justification", "schedule", "symptomTags", "updatedAt"])

  // Idempotent: the same report again finds it no longer a candidate.
  assert.equal((await applyAs("iv-u1", A, [row("a1")])).writes, 0)
})

test("classify apply: a reference row only deactivates; a deleted or overridden template is left alone", async () => {
  const A = home("cls-ref")
  await seedMember(A, "iv-u1")
  await seedTemplate(A, "ref1")
  await seedTemplate(A, "gone", { deletedAt: Timestamp.now() })
  await seedTemplate(A, "mine", { careTypeOverriddenAt: Timestamp.now() })
  const goneBefore = (await db.doc(`homes/${A}/taskTemplates/gone`).get()).data()
  const mineBefore = (await db.doc(`homes/${A}/taskTemplates/mine`).get()).data()

  const res = await applyAs("iv-u1", A, [
    row("ref1", { proposed_is_reference: true, care_change: false, schedule_change: false, symptom_tags_change: false, justification: "A how-to, not a task." }),
    row("gone"),
    row("mine"),
  ])
  assert.equal(res.writes, 1)
  const ref1 = (await db.doc(`homes/${A}/taskTemplates/ref1`).get()).data()
  assert.equal(ref1.isActive, false)
  assert.equal(ref1.careType, "cleaning", "a reference row writes no classification")
  assert.equal(ref1.schedule.scheduleType, "monthly")
  assert.deepEqual((await db.doc(`homes/${A}/taskTemplates/gone`).get()).data(), goneBefore, "deleted since the preview: stays as it was")
  assert.deepEqual((await db.doc(`homes/${A}/taskTemplates/mine`).get()).data(), mineBefore, "the user's own override wins")
})

// ─── manual sources: never another home's Storage folder ───────────────────

test("a manual pointing into another home's Storage folder is refused before any charge", async () => {
  const A = home("src-mine"), B = home("src-theirs")
  const uid = `iv-src-${RUN}`
  await seedMember(A, uid)
  await db.doc(`homes/${A}/manuals/mX`).set({
    itemUnitId: "i1",
    sourceType: "upload",
    sourceRef: `homes/${B}/manuals/someone/i9/their-warranty.pdf`,
    deletedAt: null,
  })

  assert.equal(await codeOf(ingestReference.run({ data: { homeId: A, manualId: "mX" }, auth: { uid } })), "failed-precondition")
  const doc = await detectDocType.run({ data: { homeId: A, manualId: "mX" }, auth: { uid } })
  assert.equal(doc.docType, "other")
  assert.equal(doc.reason, "Manual file not found")

  assert.deepEqual(await usageOf(uid), [], "no unit was charged for a file we would not fetch")
  assert.equal((await db.collection(`homes/${A}/manuals/mX/chunks`).get()).size, 0, "nothing was ingested")
})

test("commitManualDraft: a manual with no item is a clear failed-precondition, and the manual is untouched", async () => {
  const A = home("draft-noitem")
  await seedMember(A, "iv-u1")
  await db.doc(`homes/${A}/manuals/m1`).set({ sourceType: "upload", sourceRef: "manuals/x.pdf", previewDraft: { chunks: [], tasks: [] } })
  const before = await subtree(db.doc(`homes/${A}`))
  const r = await codeOf(
    commitManualDraft.run({ data: { homeId: A, manualId: "m1", chunks: [], tasks: [{ title: "Clean the filter" }] }, auth: { uid: "iv-u1" } }),
  )
  assert.equal(r, "failed-precondition", "it used to reach the commit as `undefined` and fail as internal")
  assert.deepEqual(await subtree(db.doc(`homes/${A}`)), before)
})

// ─── invites and invite codes ───────────────────────────────────────────────

test("an invite whose expiry isn't a Timestamp is refused as invalid — not a crash, and nobody joins", async () => {
  const A = home("inv-expiry")
  await seedMember(A, "iv-owner")
  const token = `iv-tok-${RUN}`
  await db.doc(`homes/${A}/invites/inv1`).set({ token, role: "member", createdBy: "iv-owner", expiresAt: "2099-01-01" })

  const res = await acceptInvite.run({ data: { token }, auth: { uid: "iv-joiner" } })
  assert.equal(res.success, false)
  assert.match(res.error, /invalid/i)
  assert.equal((await db.doc(`homes/${A}/members/iv-joiner`).get()).exists, false)
  assert.equal((await db.doc(`homes/${A}/invites/inv1`).get()).get("acceptedBy"), undefined)

  const details = await getInviteDetails.run({ data: { token }, auth: { uid: "iv-joiner" } })
  assert.equal(details.found, true)
  assert.equal(details.expires_at, "", "shown without an expiry rather than throwing")
})

test("an invite code stored in the wrong shape admits nobody; a well-formed one still does", async () => {
  const bad = `IVBAD${RUN.slice(-6)}`.replace(/[^A-Z0-9]/g, "")
  const good = `IVGOOD${RUN.slice(-6)}`.replace(/[^A-Z0-9]/g, "")
  await db.doc(`inviteCodes/${bad}`).set({ maxUses: "lots", uses: 0, expiresAt: null })
  await db.doc(`inviteCodes/${good}`).set({ maxUses: 1, uses: 0, expiresAt: null })
  const u1 = `iv-redeem-a-${RUN}`, u2 = `iv-redeem-b-${RUN}`

  assert.equal(await codeOf(redeemInviteCode.run({ data: { code: bad }, auth: { uid: u1 } })), "permission-denied")
  assert.equal((await db.doc(`admissions/${u1}`).get()).exists, false)
  assert.equal((await db.doc(`inviteCodes/${bad}`).get()).get("uses"), 0, "a refused code is not spent")

  const ok = await redeemInviteCode.run({ data: { code: good.toLowerCase() }, auth: { uid: u2 } })
  assert.deepEqual(ok, { ok: true, alreadyAdmitted: false })
  assert.equal((await db.doc(`admissions/${u2}`).get()).exists, true)

  await Promise.all([bad, good].map((c) => db.doc(`inviteCodes/${c}`).delete()))
  await Promise.all([u1, u2].map((u) => db.doc(`admissions/${u}`).delete()))
})

// ─── completeTask: the stored instance and template ─────────────────────────

const LA_EVENING = new Date("2026-09-30T19:00:00Z") // 2026-09-30 in Los Angeles

async function seedInstance(H, id, templateId, over = {}) {
  // Due far in the future, so the app-wide roll-forward suite never sees it.
  await db.doc(`homes/${H}/taskInstances/${id}`).set({
    taskTemplateId: templateId,
    status: "scheduled",
    dueDate: "2099-06-18",
    deletedAt: null,
    priorityTier: "recommended",
    careType: "maintenance",
    scopeType: "item_unit",
    title: "Flush the water heater",
    ...over,
  })
}

test("completeTask: a template id with a slash completes the task with no next — it used to throw 'internal'", async () => {
  const H = home("ct-slash")
  await seedMember(H, "iv-u1")
  await seedInstance(H, "i1", "x/y")
  const res = await handleCompleteTask(db, "iv-u1", { homeId: H, taskInstanceId: "i1", completedOn: "2026-09-30" }, LA_EVENING)
  assert.equal(res.nextInstanceId, null)
  assert.equal((await db.doc(`homes/${H}/taskInstances/i1`).get()).get("status"), "done")
})

test("completeTask: a string interval reads as no interval (30 days), not as date-string arithmetic", async () => {
  const H = home("ct-interval")
  await seedMember(H, "iv-u1")
  await seedTemplate(H, "t1", { schedule: { scheduleType: "every_n_days", intervalDays: "45" }, defaultAssignee: "a/b" })
  await seedInstance(H, "i1", "t1")
  const res = await handleCompleteTask(db, "iv-u1", { homeId: H, taskInstanceId: "i1", completedOn: "2026-09-30" }, LA_EVENING)
  const next = (await db.doc(`homes/${H}/taskInstances/${res.nextInstanceId}`).get()).data()
  assert.equal(next.dueDate, "2026-10-30")
  assert.equal(next.assignedTo, null, "a stored assignee with a slash is no assignee — it used to be a path")
  assert.equal(next.title, "Flush the water heater")
})

// ─── the schedulers ─────────────────────────────────────────────────────────

test("rollForward: an instance with no template id is skipped and counted — the run goes on", async () => {
  const H = home("rf-malformed")
  // Due before 2000, and the run's "today" is 2000-01-01: this run sees only
  // instances this old, so it never re-anchors another suite's rows.
  await db.doc(`homes/${H}/taskInstances/orphan`).set({ status: "scheduled", deletedAt: null, dueDate: "1999-01-01" })
  const res = await runRollForward(db, "2000-01-01")
  assert.ok(res.skippedMalformed >= 1)
  assert.equal((await db.doc(`homes/${H}/taskInstances/orphan`).get()).get("dueDate"), "1999-01-01")
})

test("a ledger entry of the wrong shape refunds nothing — no stray counter write", async () => {
  const requestId = `iv-ledger-${RUN}`
  await db.doc(`parseCharges/${requestId}`).set({ state: "held", uid: "iv/../victim", fn: "enqueueParse", units: "10", day: "2026-09-30", month: "2026-09" })
  assert.equal(await refundParseCharge(db, requestId, { from: ["held"], reason: "test" }), false)
  assert.equal((await db.doc(`parseCharges/${requestId}`).get()).get("state"), "held", "nothing moved")
  await db.doc(`parseCharges/${requestId}`).delete()
})
