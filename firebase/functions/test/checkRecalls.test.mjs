/**
 * checkRecalls core test — the model-first → brand+prefix → brand-alone fallback
 * ladder, the empty brand+model short-circuit, and buildRecallNotes shape.
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import { runCheckRecalls, buildRecallNotes } from "../lib/firebase/functions/src/products/checkRecalls.js"

const RECALL = {
  RecallID: 123,
  RecallNumber: "24-001",
  RecallDate: "2024-05-01",
  Title: "Recalled fridge",
  URL: "https://cpsc.gov/r/123",
  Hazards: [{ Name: "Fire hazard" }],
  Remedies: [{ Name: "Contact manufacturer. Free repair." }],
}

test("empty brand + model returns unknown without querying", async () => {
  let called = false
  const fetcher = async () => { called = true; return [] }
  const res = await runCheckRecalls(fetcher, "  ", "")
  assert.equal(res.recall_status, "unknown")
  assert.equal(called, false)
})

test("model match returns found", async () => {
  const fetcher = async (kw) => (kw === "CGS750P2M3S1" ? [RECALL] : [])
  const res = await runCheckRecalls(fetcher, "GE", "CGS750P2M3S1")
  assert.equal(res.recall_status, "found")
  assert.ok(res.recall_notes)
  assert.equal(JSON.parse(res.recall_notes).recall_number, "24-001")
})

test("falls back to brand + model prefix when model-only misses", async () => {
  const calls = []
  const fetcher = async (kw) => {
    calls.push(kw)
    return kw === "GE CGS750P" ? [RECALL] : []
  }
  const res = await runCheckRecalls(fetcher, "GE", "CGS750P2M3S1")
  assert.equal(res.recall_status, "found")
  assert.deepEqual(calls, ["CGS750P2M3S1", "GE CGS750P"])
})

test("no matches → none_found", async () => {
  const res = await runCheckRecalls(async () => [], "GE", "ZZZ")
  assert.equal(res.recall_status, "none_found")
  assert.equal(res.recall_notes, null)
})

test("buildRecallNotes trims remedy at first sentence", () => {
  const notes = JSON.parse(buildRecallNotes(RECALL))
  assert.equal(notes.remedy, "Contact manufacturer")
  assert.equal(notes.hazard, "Fire hazard")
})
