/**
 * Ask pays for the manuals it attaches (C4) — against the Firestore emulator.
 *
 * An item-scoped question sends Claude the WHOLE manual PDF (~100K tokens,
 * ≈ $0.20 on Sonnet 5) and used to cost 1 unit, the same as a sentence. It now
 * costs 1 + 5 per attached PDF, charged through the same transactional quota
 * path as everything else: the base unit before any reads (so the rate limit
 * still refuses a loop before it costs a query), the PDFs as one top-up before
 * the stream opens, and a release for any PDF that could not be fetched.
 *
 * Drives the exact helpers the handler calls, with a fake PDF fetch.
 *
 * Run via `npm run test:worker:emu` (compiles first; FIRESTORE_EMULATOR_HOST set).
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import { getApps, initializeApp } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"
import { chargeAiQuota, utcDayKey, BURST_UNIT_LIMIT } from "../lib/firebase/functions/src/lib/quota.js"
import { chargeAndFetchPdfs, planPdfAttachments } from "../lib/firebase/functions/src/ai/chatQuery.js"

assert.ok(process.env.FIRESTORE_EMULATOR_HOST, "FIRESTORE_EMULATOR_HOST must be set (run via emulators:exec)")
if (getApps().length === 0) initializeApp({ projectId: "demo-homehub" })
const db = getFirestore()

let n = 0
const freshUid = (label) => `chat-${label}-${Date.now()}-${n++}`
// Every test reads its own (absent) caps document — the defaults — so nothing
// another test file does to config/spend can change these numbers.
const configDoc = () => `config/spend-chat-${Date.now()}-${n++}`
const daily = async (uid) => (await db.doc(`usage/${uid}/daily/${utcDayKey()}`).get()).data() ?? {}

const manual = (id, sourceType = "upload", sourceRef = `manuals/${id}.pdf`) => ({ manualId: id, itemUnitId: "item", sourceType, sourceRef })
const fetchOk = async () => "JVBERi0xLjQK" // "%PDF-1.4"
const fetchFailsFor = (badId) => async (m) => {
  if (m.manualId === badId) throw new Error("storage: No such object")
  return "JVBERi0xLjQK"
}

test("planning: one or two manuals are attached whole; three or more are answered from excerpts", () => {
  assert.equal(planPdfAttachments([manual("a")]).length, 1)
  assert.equal(planPdfAttachments([manual("a"), manual("b")]).length, 2)
  assert.equal(planPdfAttachments([manual("a"), manual("b"), manual("c")]).length, 0)
})

test("planning: a URL the SSRF guard refuses is never fetched, so never priced", () => {
  const planned = planPdfAttachments([manual("a"), manual("b", "url", "http://169.254.169.254/latest/manual.pdf")])
  assert.deepEqual(planned.map((m) => m.manualId), ["a"])
})

test("two attached PDFs cost 1 + 5 + 5", async () => {
  const uid = freshUid("two")
  const hold = await chargeAiQuota(db, uid, "chatQuery", { configDoc: configDoc() })
  const attached = await chargeAndFetchPdfs(hold, [manual("a"), manual("b")], fetchOk)
  assert.equal(attached.length, 2)
  assert.equal((await daily(uid)).units, 11)
  assert.equal(hold.units, 11)
  // One call, however many units it cost.
  assert.equal((await daily(uid)).count, 1)
  assert.equal((await daily(uid)).fns.chatQuery, 1)
})

test("a question with no PDF still costs exactly the base unit", async () => {
  const uid = freshUid("none")
  const hold = await chargeAiQuota(db, uid, "chatQuery", { configDoc: configDoc() })
  assert.deepEqual(await chargeAndFetchPdfs(hold, [], fetchOk), [])
  assert.equal((await daily(uid)).units, 1)
})

test("a PDF that cannot be fetched is not attached and not paid for", async () => {
  const uid = freshUid("missing")
  const hold = await chargeAiQuota(db, uid, "chatQuery", { configDoc: configDoc() })
  const attached = await chargeAndFetchPdfs(hold, [manual("good"), manual("gone")], fetchFailsFor("gone"))
  assert.deepEqual(attached.map((a) => a.manual.manualId), ["good"])
  assert.equal((await daily(uid)).units, 6)
})

test("a failed stream refunds everything — base unit and PDFs", async () => {
  const uid = freshUid("refund")
  const hold = await chargeAiQuota(db, uid, "chatQuery", { configDoc: configDoc() })
  await chargeAndFetchPdfs(hold, [manual("a"), manual("b")], fetchOk)
  await hold.refund() // what the handler's stream catch does
  const d = await daily(uid)
  assert.equal(d.units, 0)
  assert.equal(d.count, 0)
})

test("PDFs that do not fit the user's day are refused before the stream opens, and charge nothing extra", async () => {
  const uid = freshUid("capped")
  const cfg = configDoc()
  await db.doc(`usage/${uid}/daily/${utcDayKey()}`).set({ units: 45, count: 45 })
  const hold = await chargeAiQuota(db, uid, "chatQuery", { configDoc: cfg }) // 46 of 50
  await assert.rejects(
    () => chargeAndFetchPdfs(hold, [manual("a"), manual("b")], fetchOk),
    (err) => {
      assert.equal(err.details?.scope, "daily")
      assert.doesNotMatch(err.message, /queued/i, "nothing is queued for an Ask question")
      return true
    },
  )
  assert.equal((await daily(uid)).units, 46, "the refused top-up charged nothing")
  await hold.refund() // what the handler does next
  assert.equal((await daily(uid)).units, 45)
})

test("the PDF units count toward the burst window — a loop of whole-manual questions is throttled", async () => {
  const uid = freshUid("burst")
  const cfg = configDoc()
  let asked = 0
  let refused = null
  for (let i = 0; i < 10 && !refused; i++) {
    const hold = await chargeAiQuota(db, uid, "chatQuery", { configDoc: cfg })
    try {
      await chargeAndFetchPdfs(hold, [manual("a"), manual("b")], fetchOk)
      asked += 1
    } catch (err) {
      refused = err
      await hold.refund()
    }
  }
  assert.ok(refused, "ten 11-unit questions in a minute must be stopped")
  assert.equal(refused.details?.kind, "rate_limited")
  assert.equal(refused.details?.reason, "burst")
  assert.ok(asked * 11 <= BURST_UNIT_LIMIT, `${asked} questions got through, ${asked * 11} units in one window`)
})
