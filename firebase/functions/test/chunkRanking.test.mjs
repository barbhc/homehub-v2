/**
 * chunkRanking test — the fix for unscoped "Ask about your home" retrieval.
 * v1 pulled chunks in manual order until the budget filled, so later manuals
 * (the Furnace) were never read for a home-wide question. rankChunks scores
 * candidates by query relevance so the relevant manual wins regardless of order.
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import { queryTerms, scoreChunk, rankChunks } from "../lib/firebase/functions/src/ai/chunkRanking.js"

test("queryTerms drops stopwords + short tokens and dedupes", () => {
  assert.deepEqual(queryTerms("How do I safely light my furnace?"), ["safely", "light", "furnace"])
  assert.deepEqual(queryTerms("the a to of"), [])
})

test("scoreChunk weights curated metadata (3) above body (1)", () => {
  assert.equal(scoreChunk(["furnace"], { strong: "furnace heating", body: "nothing" }), 3)
  assert.equal(scoreChunk(["furnace"], { strong: "nothing", body: "the furnace here" }), 1)
  assert.equal(scoreChunk(["furnace"], { strong: "furnace", body: "furnace" }), 4)
})

test("rankChunks surfaces the relevant manual even when it is read last", () => {
  const washer = (i) => ({
    id: "w" + i,
    strong: "washer laundry cleaning drum",
    body: "clean the washer drum and detergent drawer",
  })
  const furnace = {
    id: "f1",
    strong: "furnace hvac heating ignition lighting",
    body: "do not attempt to light this furnace by hand; hot surface ignition",
  }
  // 5 washer chunks first (would fill an old first-N budget), furnace last.
  const candidates = [washer(1), washer(2), washer(3), washer(4), washer(5), furnace]
  const top = rankChunks("How do I safely light my furnace?", candidates, 3)
  assert.equal(top[0].id, "f1", "furnace ranks first despite being last in read order")
})

test("no-signal query preserves original order (never returns empty)", () => {
  const cands = [{ id: "a", strong: "x", body: "y" }, { id: "b", strong: "p", body: "q" }]
  assert.deepEqual(rankChunks("what about the it", cands, 5).map((c) => c.id), ["a", "b"])
})

test("ties break on original order (stable)", () => {
  const cands = [
    { id: "a", strong: "furnace", body: "" },
    { id: "b", strong: "furnace", body: "" },
  ]
  assert.deepEqual(rankChunks("furnace", cands, 2).map((c) => c.id), ["a", "b"])
})
