/**
 * Ask's chunk budget (askReads.ts planChunkReads): how many chunk candidates a
 * question reads from each in-scope manual. Pure — no emulator.
 *
 * The contract: within CHUNK_READ_BUDGET nothing changes (40 per manual, as
 * before); past it the total never exceeds the budget, the manuals whose ITEM
 * the question names share it first, and the rest split what is left.
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import {
  planChunkReads,
  ReadTally,
  askReadsLogFields,
  CHUNK_READ_BUDGET,
  CANDIDATES_PER_MANUAL,
} from "../lib/firebase/functions/src/ai/askReads.js"

const ITEMS = {
  furnace: "Carrier Infinity Furnace furnace",
  washer: "LG Washer washer",
  dishwasher: "Bosch Dishwasher dishwasher",
  fridge: "LG Refrigerator refrigerator",
}
const text = (id) => ITEMS[id] ?? `Appliance ${id} misc`
const manualsFor = (ids) => ids.map((itemUnitId) => ({ itemUnitId }))
const sum = (xs) => xs.reduce((a, b) => a + b, 0)
/** 25 manuals: the four named appliances plus 21 others. */
const home25 = manualsFor(["washer", "dishwasher", ...Array.from({ length: 21 }, (_, i) => `other-${i}`), "fridge", "furnace"])

test("the budget is 120 candidates a question, 40 a manual", () => {
  assert.equal(CHUNK_READ_BUDGET, 120)
  assert.equal(CANDIDATES_PER_MANUAL, 40)
})

test("up to three manuals: every manual reads its full 40, exactly as before", () => {
  assert.deepEqual(planChunkReads("how do I clean it?", manualsFor(["washer"]), text), [40])
  assert.deepEqual(planChunkReads("how do I clean it?", manualsFor(["washer", "fridge", "furnace"]), text), [40, 40, 40])
})

test("a whole-home question naming the furnace: the furnace manual reads 40, the rest share 80", () => {
  const limits = planChunkReads("How do I safely light my furnace?", home25, text)
  assert.equal(limits[24], 40, "the furnace manual (read last) gets a full share")
  assert.equal(sum(limits), CHUNK_READ_BUDGET)
  for (const [i, n] of limits.entries()) if (i !== 24) assert.ok(n === 3 || n === 4, `manual ${i} reads ${n}`)
})

test("a question naming nothing: the budget is split evenly, first manuals take the remainder", () => {
  const limits = planChunkReads("what should I do this fall?", home25, text)
  assert.equal(sum(limits), CHUNK_READ_BUDGET)
  assert.deepEqual([...new Set(limits)].sort(), [4, 5])
  assert.equal(limits[0], 5)
  assert.equal(limits[24], 4)
})

test("stopwords only: no terms, still an even split, never empty", () => {
  const limits = planChunkReads("how do I do it?", home25, text)
  assert.equal(sum(limits), CHUNK_READ_BUDGET)
  assert.ok(limits.every((n) => n >= 4))
})

test("'washer' names the washer and the dishwasher: both read before the rest", () => {
  const limits = planChunkReads("my washer smells", home25, text)
  assert.equal(limits[0], 40) // washer
  assert.equal(limits[1], 40) // dishwasher (substring match, as the ranking scores it)
  assert.equal(sum(limits), CHUNK_READ_BUDGET)
})

test("more named manuals than full shares: they split the whole budget; the rest read nothing", () => {
  const named = manualsFor(["furnace", "furnace", "furnace", "furnace", "furnace", "other-1"])
  const limits = planChunkReads("furnace filter", named, text)
  assert.deepEqual(limits, [24, 24, 24, 24, 24, 0])
})

test("never more than the budget, whatever the home", () => {
  for (const n of [4, 7, 30, 121, 400]) {
    const manuals = manualsFor(Array.from({ length: n }, (_, i) => (i % 5 === 0 ? "furnace" : `x-${i}`)))
    for (const q of ["furnace", "anything at all", ""]) {
      const limits = planChunkReads(q, manuals, text)
      assert.equal(limits.length, n)
      assert.ok(sum(limits) <= CHUNK_READ_BUDGET, `${n} manuals, "${q}": ${sum(limits)}`)
      assert.ok(limits.every((x) => x >= 0 && x <= CANDIDATES_PER_MANUAL))
    }
  }
})

test("ReadTally bills an empty query as one read and sums per collection", () => {
  const t = new ReadTally()
  t.docs("member", 1)
  t.query("items", 25)
  t.query("notes", 0)
  t.docs("rooms", 2)
  t.query("chunks", 40)
  assert.deepEqual(t.reads, { member: 1, items: 25, notes: 1, rooms: 2, manuals: 0, chunks: 40 })
  assert.equal(t.docsRead, 69)
})

test("the per-question log line: docsRead, and each collection's share of it", () => {
  const t = new ReadTally()
  t.docs("member", 1)
  t.query("items", 25)
  t.query("manuals", 25)
  t.query("chunks", 120)
  assert.deepEqual(askReadsLogFields("h1", "all", "answered", t), {
    homeId: "h1", scope: "all", outcome: "answered",
    docsRead: 171, member: 1, items: 25, notes: 0, rooms: 0, manuals: 25, chunks: 120,
  })
})
