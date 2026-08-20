/**
 * HH-56 — the clock starts where the user says it does.
 *
 * Chris added an air fryer he had owned for months and every task landed at
 * once. #58 fixed the first half (nothing lands due TODAY any more); this is
 * the second half: an appliance with a history should not restart from zero
 * just because today is the day it got catalogued.
 *
 * Drives the real commitDraft against the Firestore emulator, because the whole
 * change lives in what gets WRITTEN to an instance — a typecheck proves nothing
 * about a due date.
 *
 * Run: `npm run test:worker:emu`.
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import { getApps, initializeApp } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"
import { normalizeTaskRow } from "../lib/shared/parse/parseCore.js"
import { commitDraft } from "../lib/firebase/functions/src/parse/commitDraft.js"
import { parseLastDone } from "../lib/shared/care/lastDone.js"

assert.ok(process.env.FIRESTORE_EMULATOR_HOST, "FIRESTORE_EMULATOR_HOST must be set (run via emulators:exec)")
if (getApps().length === 0) initializeApp({ projectId: "demo-homehub" })
const db = getFirestore()

/** Fixed "now" so the arithmetic below is checkable by hand. */
const NOW = new Date("2026-08-20T00:00:00Z")
const TODAY = "2026-08-20"

const FILTER_TASK = {
  title: "Replace the Water Filter",
  description: "Swap the filter cartridge.",
  care_type: "maintenance",
  priority_tier: "recommended",
  risk_level: "none",
  estimated_minutes: 10,
  schedule_type: "semiannual",
  interval_days: null,
  instructions_text: "Twist out, twist in.",
  symptom_tags: [],
  re_check_triggers: [],
}

async function commitWith(homeId, lastDoneRaw) {
  await db.doc(`homes/${homeId}/items/i1`).set({ displayName: "Fridge", itemCategory: "major_appliance" })
  await db.doc(`homes/${homeId}/manuals/m1`).set({ itemUnitId: "i1", sourceType: "upload", title: "Manual" })
  await commitDraft(db, {
    homeId, manualId: "m1",
    item: { itemUnitId: "i1", item_category: "major_appliance", sub_type: null, display_name: "Fridge", model: null, accessories: [] },
    requestId: `req-${homeId}`,
    chunks: [],
    tasks: [{ ...normalizeTaskRow(FILTER_TASK), last_done_on: parseLastDone(lastDoneRaw, TODAY) }],
    now: NOW,
  })
  const snap = await db.collection(`homes/${homeId}/taskInstances`).get()
  assert.equal(snap.size, 1, "expected exactly one seeded instance")
  return snap.docs[0].data().dueDate
}

test("no answer → one cadence from today, exactly as before", async () => {
  // The shipped behaviour has to survive. semiannual is SIX CALENDAR MONTHS in
  // addCadence, not 182 days — worth pinning, because "roughly half a year"
  // read as a day count is the kind of assumption that quietly drifts a date.
  assert.equal(await commitWith("hh56-none", undefined), "2027-02-20")
})

test("done two months ago → the window comes off THAT, not the add date", async () => {
  // 20 Jun + 6 months = 20 Dec. Two months earlier than the add-date answer,
  // which is the whole point: he had already been maintaining it.
  assert.equal(await commitWith("hh56-recent", "2026-06-20"), "2026-12-20")
})

test("done longer ago than the interval → a target already behind them", async () => {
  // 20 Jan + 6 months = 20 Jul, a month before today. Deliberately NOT clamped
  // to today: the due-window layer reads a passed window-kind target as "been a
  // while", never as red, so the honest date is safe to write.
  const due = await commitWith("hh56-lapsed", "2026-01-20")
  assert.equal(due, "2026-07-20")
  assert.ok(due < TODAY, "a genuinely lapsed task should land behind today")
})

test("a future or malformed date is ignored, never fatal", async () => {
  // Losing a whole reviewed manual to a typo would be the worse failure.
  assert.equal(await commitWith("hh56-future", "2027-01-01"), "2027-02-20")
  assert.equal(await commitWith("hh56-junk", "not-a-date"), "2027-02-20")
  assert.equal(await commitWith("hh56-impossible", "2026-02-30"), "2027-02-20")
})
