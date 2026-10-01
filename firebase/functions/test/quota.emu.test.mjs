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
  enforceCallLimits,
  utcDayKey,
  utcMonthKey,
  rateLimitFor,
  BURST_UNIT_LIMIT,
  DEFAULT_DAILY_UNITS,
} from "../lib/firebase/functions/src/lib/quota.js"
import { chargeFindManual } from "../lib/firebase/functions/src/products/findManual.js"
import { runBrandOnlyLookup } from "../lib/firebase/functions/src/ai/productLookup.js"
import { DAILY_CALL_CAP } from "../lib/shared/quota/policy.js"

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
  // All 1-unit endpoints with a 10/min window each. (suggestCareNotes held this
  // slot until it was retired on 2026-09-30; proposeReminders prices the same.)
  const spread = ["chatQuery", "discussTask", "proposeReminders", "productLookup", "findManual", "searchProductImages"]

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

// ─── config/spend: the caps are data now (C5) ────────────────────────────────
//
// Each test reads its OWN caps document (`configDoc`), never config/spend:
// node --test runs the test files in parallel against one emulator, and a
// thrown kill switch in the shared document would refuse every charge in the
// files running beside this one.

let c = 0
const ownConfig = async (data) => {
  const path = `config/spend-test-${Date.now()}-${c++}`
  if (data !== undefined) await db.doc(path).set(data)
  return path
}
const seedSpent = (uid, units) => dailyDoc(uid).set({ units, count: units }, { merge: true })

test("with no caps document, a user is held to the 50-unit default day", async () => {
  const uid = freshUid("default")
  const configDoc = await ownConfig(undefined) // absent
  await seedSpent(uid, DEFAULT_DAILY_UNITS)
  await assert.rejects(
    () => chargeAiQuota(db, uid, "chatQuery", { configDoc }),
    (err) => {
      assert.equal(err.details?.kind, "quota_exhausted")
      assert.equal(err.details?.scope, "daily")
      return true
    },
  )
})

test("an override in the document lifts ONE user's day — the owner's 1,000", async () => {
  const owner = freshUid("owner")
  const tester = freshUid("tester")
  const configDoc = await ownConfig({ dailyUnitsOverrides: { [owner]: 1000 } })
  await seedSpent(owner, 400)
  await seedSpent(tester, 50)
  await chargeAiQuota(db, owner, "chatQuery", { configDoc }) // must not throw
  await assert.rejects(() => chargeAiQuota(db, tester, "chatQuery", { configDoc }))
})

test("the kill switch: monthlyCeilingUnits 0 refuses every paid call as the app's budget, and charges nothing", async () => {
  const uid = freshUid("killswitch")
  const configDoc = await ownConfig({ monthlyCeilingUnits: 0 })
  const before = await dailyUnits(uid)
  for (const fn of ["enqueueParse", "chatQuery", "ocr"]) {
    await assert.rejects(
      () => chargeAiQuota(db, uid, fn, { configDoc }),
      (err) => {
        assert.equal(err.code, "resource-exhausted")
        assert.equal(err.details?.scope, "global", `${fn} must read as the app's budget, not a failure`)
        assert.match(err.message, /monthly AI budget/)
        assert.doesNotMatch(err.message, /misconfigured/)
        return true
      },
    )
  }
  assert.equal(await dailyUnits(uid), before, "a refused call spends nothing")
})

test("a kill switch typed as the STRING \"0\" still kills (fails closed)", async () => {
  const uid = freshUid("killstring")
  const configDoc = await ownConfig({ monthlyCeilingUnits: "0" })
  await assert.rejects(
    () => chargeAiQuota(db, uid, "chatQuery", { configDoc }),
    (err) => err.details?.scope === "global",
  )
})

test("scansPerDay comes from the document", async () => {
  const uid = freshUid("scans")
  const configDoc = await ownConfig({ scansPerDay: 1 })
  await chargeAiQuota(db, uid, "enqueueParse", { configDoc })
  await assert.rejects(
    () => chargeAiQuota(db, uid, "enqueueParse", { configDoc }),
    (err) => {
      assert.match(err.message, /1 manual scans today/)
      return true
    },
  )
})

// ─── findManual draws on the shared pool (C6 regression) ─────────────────────

test("findManual works for a user who has spent more than 60 units today (the old private '60' refused them)", async () => {
  // The owner at 1,000/day, after a busy add session. The old call passed 60 as
  // the limit and the transaction compared it with ALL of today's units.
  const uid = freshUid("findmanual-owner")
  const configDoc = await ownConfig({ dailyUnitsOverrides: { [uid]: 1000 } })
  await seedSpent(uid, 61)
  const hold = await chargeFindManual(db, uid, { configDoc })
  assert.equal(hold.units, 1)
  assert.equal(await dailyUnits(uid), 62)
})

test("…and findManual cannot run past a default user's day either (the old '60' let it)", async () => {
  const uid = freshUid("findmanual-tester")
  const configDoc = await ownConfig(undefined)
  await seedSpent(uid, DEFAULT_DAILY_UNITS)
  await assert.rejects(
    () => chargeFindManual(db, uid, { configDoc }),
    (err) => err.details?.scope === "daily",
  )
})

test("productLookup keeps its 3x headroom on the same counter, relative to the user's own limit", async () => {
  const uid = freshUid("lookup-headroom")
  const configDoc = await ownConfig(undefined)
  await seedSpent(uid, DEFAULT_DAILY_UNITS + 10)
  await chargeAiQuota(db, uid, "productLookup", { units: 1, configDoc }) // 61 ≤ 150
  await assert.rejects(() => chargeAiQuota(db, uid, "chatQuery", { configDoc }))
})

// ─── partial release (C4's unfetchable-PDF refund) ───────────────────────────

test("release() hands back part of a charge; refund() then returns only what is still held", async () => {
  const uid = freshUid("release")
  const hold = await chargeAiQuota(db, uid, "chatQuery", { units: 11 })
  assert.equal(await dailyUnits(uid), 11)
  await hold.release(5)
  assert.equal(await dailyUnits(uid), 6)
  assert.equal(hold.units, 6)
  // The call happened: its count stays.
  assert.equal((await dailyDoc(uid).get()).get("count"), 1)
  await hold.release(100) // never more than is held
  assert.equal(await dailyUnits(uid), 0)
  await hold.refund()
  assert.equal(await dailyUnits(uid), 0, "nothing left to refund, and a refund never mints quota")
})

// ─── enforceCallLimits: proxyPdf's egress limits (C7b) ───────────────────────

test("enforceCallLimits: the per-minute limit, without touching the AI counters", async () => {
  const uid = freshUid("proxy-rate")
  const limit = rateLimitFor("proxyPdf")
  for (let i = 0; i < limit; i++) await enforceCallLimits(db, uid, "proxyPdf")
  await assert.rejects(
    () => enforceCallLimits(db, uid, "proxyPdf"),
    (err) => err.details?.kind === "rate_limited",
  )
  const snap = await dailyDoc(uid).get()
  assert.equal(snap.get("units") ?? 0, 0, "egress spends no AI units")
  assert.equal(snap.get("count") ?? 0, 0)
  assert.equal(snap.get("fns.proxyPdf"), limit)
})

test("enforceCallLimits: the per-day cap", async () => {
  const uid = freshUid("proxy-day")
  await dailyDoc(uid).set({ fns: { proxyPdf: DAILY_CALL_CAP.proxyPdf } })
  await assert.rejects(
    () => enforceCallLimits(db, uid, "proxyPdf"),
    (err) => {
      assert.equal(err.details?.kind, "call_cap")
      return true
    },
  )
})

// ─── productLookup brand-only mode is charged (C7c) ──────────────────────────

const braveHit = async () => ({
  ok: true,
  status: 200,
  json: async () => ({
    web: { results: [{ title: "LG WM3900HBA Washer", description: "LG front load washer", url: "https://www.lg.com/us/washers/lg-WM3900HBA" }] },
  }),
})

test("brand-only: no Brave key or a generic model → no search, no charge", async () => {
  const uid = freshUid("brand-free")
  const configDoc = await ownConfig(undefined)
  assert.equal(await runBrandOnlyLookup(db, uid, "WM3900HBA", { braveKey: "", fetchJson: braveHit, configDoc }), null)
  assert.equal(await runBrandOnlyLookup(db, uid, "300", { braveKey: "k", fetchJson: braveHit, configDoc }), null)
  assert.equal(await dailyUnits(uid), 0)
})

test("brand-only: a search that runs is charged 1 unit under its own key", async () => {
  const uid = freshUid("brand-paid")
  const configDoc = await ownConfig(undefined)
  const derived = await runBrandOnlyLookup(db, uid, "WM3900HBA", { braveKey: "k", fetchJson: braveHit, configDoc })
  assert.equal(derived?.brand, "LG", "the suggestion itself is unchanged by the charge")
  const snap = await dailyDoc(uid).get()
  assert.equal(snap.get("units"), 1)
  assert.equal(snap.get("fns.brandFromModel"), 1)
})

test("brand-only: a failed search is refunded", async () => {
  const uid = freshUid("brand-failed")
  const configDoc = await ownConfig(undefined)
  const down = async () => {
    throw new Error("ECONNRESET")
  }
  assert.equal(await runBrandOnlyLookup(db, uid, "WM3900HBA", { braveKey: "k", fetchJson: down, configDoc }), null)
  assert.equal(await dailyUnits(uid), 0)
  const non2xx = async () => ({ ok: false, status: 503, json: async () => ({}) })
  assert.equal(await runBrandOnlyLookup(db, uid, "WM3900HBA", { braveKey: "k", fetchJson: non2xx, configDoc }), null)
  assert.equal(await dailyUnits(uid), 0)
})

test("brand-only: rate-limited like the other Brave calls", async () => {
  const uid = freshUid("brand-rate")
  const configDoc = await ownConfig(undefined)
  for (let i = 0; i < rateLimitFor("brandFromModel"); i++) {
    await runBrandOnlyLookup(db, uid, "WM3900HBA", { braveKey: "k", fetchJson: braveHit, configDoc })
  }
  await assert.rejects(
    () => runBrandOnlyLookup(db, uid, "WM3900HBA", { braveKey: "k", fetchJson: braveHit, configDoc }),
    (err) => err.details?.kind === "rate_limited",
  )
})
