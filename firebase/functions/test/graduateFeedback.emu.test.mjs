/**
 * graduateFeedback core test — cross-home aggregation of task-feedback into
 * parseEvalCandidates. Proves the ≥N-distinct-homes threshold, that home-count
 * (not event-count) gates graduation, and that a maintainer's triage `status`
 * survives re-runs.
 *
 * Run: `npm run test:worker:emu`. Build lib first.
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import { getApps, initializeApp } from "firebase-admin/app"
import { getFirestore, Timestamp } from "firebase-admin/firestore"
import { runGraduation } from "../lib/firebase/functions/src/schedule/graduateFeedback.js"

assert.ok(process.env.FIRESTORE_EMULATOR_HOST, "FIRESTORE_EMULATOR_HOST must be set (run via emulators:exec)")
if (getApps().length === 0) initializeApp({ projectId: "demo-homehub" })
const db = getFirestore()

const FREEZE = {
  patternKey: "not_relevant|suppress|fam:freeze_prep|",
  pattern: { chip: "not_relevant", action: "suppress", match: { by: "seasonalFamily", family: "freeze_prep" } },
}
const CAND_ID = "not_relevant_suppress_fam_freeze_prep"

async function fb(homeId, id, patternKey, pattern, title, day) {
  await db.doc(`homes/${homeId}/taskFeedback/${id}`).set({
    patternKey, pattern, title, deletedAt: null,
    createdAt: Timestamp.fromDate(new Date(`2026-07-${day}T00:00:00Z`)),
  })
}

test("graduateFeedback: promotes a ≥3-home pattern, ignores a 2-home one", async () => {
  await fb("gh1", "a", FREEZE.patternKey, FREEZE.pattern, "Winterize faucet", "01")
  await fb("gh2", "a", FREEZE.patternKey, FREEZE.pattern, "Winterize washer", "05")
  await fb("gh3", "a", FREEZE.patternKey, FREEZE.pattern, "Freeze-protect backflow", "09")
  // a 2-home pattern → must NOT graduate
  const cadence = { patternKey: "too_often|cadence|tags:odor|annual", pattern: { chip: "too_often", action: "cadence", match: { by: "symptomTags", tags: ["odor"] }, scheduleType: "annual" } }
  await fb("gh1", "b", cadence.patternKey, cadence.pattern, "Clean drain", "02")
  await fb("gh2", "b", cadence.patternKey, cadence.pattern, "Clean trap", "03")

  const res = await runGraduation(db, 3)
  assert.equal(res.candidates, 1, "only the 3-home pattern graduates")

  const cand = await db.doc(`parseEvalCandidates/${CAND_ID}`).get()
  assert.ok(cand.exists)
  assert.equal(cand.get("homeCount"), 3)
  assert.equal(cand.get("status"), "new")
  assert.ok(cand.get("suggestion").includes("3 homes"))

  const two = await db.doc(`parseEvalCandidates/too_often_cadence_tags_odor_annual`).get()
  assert.equal(two.exists, false, "2-home pattern is not persisted")
})

test("graduateFeedback: preserves a maintainer's status across re-runs", async () => {
  await db.doc(`parseEvalCandidates/${CAND_ID}`).set({ status: "dismissed" }, { merge: true })
  await runGraduation(db, 3)
  const cand = await db.doc(`parseEvalCandidates/${CAND_ID}`).get()
  assert.equal(cand.get("status"), "dismissed", "re-run does not reset a triaged candidate")
})

test("graduateFeedback: counts distinct homes, not events", async () => {
  // 3 events from 2 homes for a fresh pattern → below threshold
  const p = { patternKey: "wrong_season|reschedule_season|fam:freeze_prep|winter", pattern: { chip: "wrong_season", action: "reschedule_season", match: { by: "seasonalFamily", family: "freeze_prep" }, season: "winter" } }
  await fb("gh9", "s1", p.patternKey, p.pattern, "T", "01")
  await fb("gh9", "s2", p.patternKey, p.pattern, "T", "02")
  await fb("gh8", "s1", p.patternKey, p.pattern, "T", "03")
  await runGraduation(db, 3)
  const cand = await db.doc(`parseEvalCandidates/wrong_season_reschedule_season_fam_freeze_prep_winter`).get()
  assert.equal(cand.exists, false, "2 homes / 3 events does not graduate")
})
