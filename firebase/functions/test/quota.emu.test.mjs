/**
 * Rate-limit integration tests — chargeAiQuota against the Firestore emulator.
 *
 * The pure rule is unit-tested in shared/quota/policy.test.ts. What can only be
 * proven here is the part that involves the transaction: that a call rejected
 * for going too fast does NOT spend the daily allowance it is protecting. Get
 * that backwards and the limiter becomes a way to lose your day faster, which
 * is worse than having no limiter at all.
 *
 * Imports the COMPILED lib (npm run build first), same as worker.emu.test.mjs.
 *
 * Run: `npm run test:worker:emu` from the repo root.
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import { getApps, initializeApp } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"
import {
  chargeAiQuota,
  utcDayKey,
  utcMonthKey,
  rateLimitFor,
  BURST_UNIT_LIMIT,
} from "../lib/firebase/functions/src/lib/quota.js"

assert.ok(process.env.FIRESTORE_EMULATOR_HOST, "FIRESTORE_EMULATOR_HOST must be set (run via emulators:exec)")
if (getApps().length === 0) initializeApp({ projectId: "demo-homehub" })
const db = getFirestore()

const dailyDoc = (uid) => db.doc(`usage/${uid}/daily/${utcDayKey()}`)
const monthlyDoc = () => db.doc(`aiSpendGlobal/${utcMonthKey()}`)

/** Units on today's counter for `uid` (0 when the doc doesn't exist yet). */
async function dailyUnits(uid) {
  const snap = await dailyDoc(uid).get()
  return snap.get("units") ?? 0
}

/** A uid nobody else in this file uses, so counters can't cross-contaminate. */
let n = 0
const freshUid = (label) => `rate-${label}-${Date.now()}-${n++}`

test("calls under the endpoint limit all go through", async () => {
  const uid = freshUid("under")
  const limit = rateLimitFor("chatQuery")
  for (let i = 0; i < limit; i++) {
    await chargeAiQuota(db, uid, "chatQuery")
  }
  assert.equal(await dailyUnits(uid), limit)
})

test("the call past the endpoint limit is refused as rate_limited", async () => {
  const uid = freshUid("over")
  const limit = rateLimitFor("chatQuery")
  for (let i = 0; i < limit; i++) await chargeAiQuota(db, uid, "chatQuery")

  await assert.rejects(
    () => chargeAiQuota(db, uid, "chatQuery"),
    (err) => {
      // Server side the code is bare; the "functions/" prefix is added by the
      // client SDK, so asserting the prefixed form here would pass forever
      // without proving anything.
      assert.equal(err.code, "resource-exhausted")
      // The structured detail is what lets a client back off for the right
      // duration instead of telling the user to come back tomorrow.
      assert.equal(err.details?.kind, "rate_limited")
      assert.equal(err.details?.reason, "endpoint")
      assert.ok(err.details?.retryAfterSeconds >= 1, "must say how long to wait")
      assert.match(err.message, /wait/i)
      return true
    },
  )
})

test("a throttled call costs the user NOTHING — the whole point", async () => {
  const uid = freshUid("nocharge")
  const limit = rateLimitFor("enqueueParse")
  for (let i = 0; i < limit; i++) await chargeAiQuota(db, uid, "enqueueParse")

  const before = await dailyUnits(uid)
  await assert.rejects(() => chargeAiQuota(db, uid, "enqueueParse"))
  const after = await dailyUnits(uid)

  assert.equal(after, before, "being throttled must not spend the allowance it protects")
})

test("a throttled call does not move the app-wide monthly ceiling either", async () => {
  const uid = freshUid("global")
  const limit = rateLimitFor("enqueueParse")
  for (let i = 0; i < limit; i++) await chargeAiQuota(db, uid, "enqueueParse")

  const before = (await monthlyDoc().get()).get("units") ?? 0
  await assert.rejects(() => chargeAiQuota(db, uid, "enqueueParse"))
  const after = (await monthlyDoc().get()).get("units") ?? 0

  assert.equal(after, before, "a refused call must not consume the app's budget")
})

test("a loop spread across many endpoints still hits the burst cap", async () => {
  // Each endpoint stays under its own limit; the user is still looping. Only
  // the unit-denominated burst window sees it.
  const uid = freshUid("burst")
  const spread = ["chatQuery", "discussTask", "suggestCareNotes", "productLookup", "findManual", "searchProductImages"]

  // Rounds derived from the CAP, not hard-coded. This loop used to be six
  // rounds of six 1-unit calls — exactly 36 units, chosen when the cap was 25.
  // Raising the cap to 45 on 2026-08-28 made the loop stop short of it and the
  // test went red, which is the guard behaving correctly: it proves a runaway
  // is refused, and a runaway sized to yesterday's limit proves nothing.
  const rounds = Math.ceil(BURST_UNIT_LIMIT / spread.length) + 2
  let spent = 0
  let denied = null
  outer: for (let round = 0; round < rounds; round++) {
    for (const fn of spread) {
      try {
        const hold = await chargeAiQuota(db, uid, fn)
        spent += hold.units
      } catch (err) {
        denied = err
        break outer
      }
    }
  }

  assert.ok(denied, `a ${rounds * spread.length}-call loop must be stopped by something`)
  assert.equal(denied.details?.reason, "burst")
  assert.ok(
    spent <= BURST_UNIT_LIMIT,
    `burst window let ${spent} units through, above the ${BURST_UNIT_LIMIT} cap`,
  )
})

test("a refund gives back units but NOT pace", async () => {
  // An Anthropic outage refunds the money — it does not entitle the client to
  // keep retrying at full speed, which is exactly when a retry storm happens.
  const uid = freshUid("refund")
  const limit = rateLimitFor("chatQuery")

  for (let i = 0; i < limit; i++) {
    const hold = await chargeAiQuota(db, uid, "chatQuery")
    await hold.refund()
  }

  assert.equal(await dailyUnits(uid), 0, "every call was refunded, so nothing should be spent")
  await assert.rejects(
    () => chargeAiQuota(db, uid, "chatQuery"),
    (err) => {
      assert.equal(err.details?.reason, "endpoint")
      return true
    },
    "refunding does not reopen the rate window",
  )
})

test("the window reopens on its own once it has expired", async () => {
  // Proven by rewinding the stored windowStart rather than sleeping 60s: the
  // reset is a function of the stored timestamp, and a minute-long test is a
  // minute nobody gets back on every CI run.
  const uid = freshUid("expire")
  const limit = rateLimitFor("chatQuery")
  for (let i = 0; i < limit; i++) await chargeAiQuota(db, uid, "chatQuery")
  await assert.rejects(() => chargeAiQuota(db, uid, "chatQuery"))

  const past = Date.now() - 61_000
  await dailyDoc(uid).set(
    { rate: { fns: { chatQuery: { windowStart: past, value: limit } }, burst: { windowStart: past, value: limit } } },
    { merge: true },
  )

  await chargeAiQuota(db, uid, "chatQuery") // must not throw
})

test("a corrupt rate window fails open rather than locking the user out", async () => {
  const uid = freshUid("corrupt")
  await dailyDoc(uid).set({ rate: { fns: { chatQuery: "not-an-object" }, burst: { windowStart: "nope" } } })
  await chargeAiQuota(db, uid, "chatQuery") // must not throw
})
