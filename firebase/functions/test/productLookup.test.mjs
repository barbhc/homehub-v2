/**
 * productLookup core test — fixture tool_use input for runProductLookup. Verifies
 * category enum validation, candidate sanitization (bad keys/values dropped, hard
 * cap), the low-confidence guard (candidates + subType suppressed), and the
 * no-tool-block fallback. Also exercises the deterministic cacheKey hash.
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import { runProductLookup, cacheKey } from "../lib/firebase/functions/src/ai/productLookup.js"

test("high-confidence result passes safe fields + valid candidates", async () => {
  const call = async () => ({
    category: "small_appliance",
    sub_type: "air-purifier",
    knowledge_confidence: "high",
    candidate_fields: [
      { key: "wattage", label: "Wattage (W)", value: 60, rationale: "Coway spec sheet" },
      { key: "filter_type", label: "Filter", value: "HEPA", rationale: null },
    ],
  })
  const res = await runProductLookup(call, "Coway", "AP-1512HH", null)
  assert.equal(res.safe.category, "small_appliance")
  assert.equal(res.safe.subType, "air-purifier")
  assert.equal(res.knowledgeConfidence, "high")
  assert.equal(res.candidates.length, 2)
  assert.equal(res.candidates[0].value, 60)
})

test("low confidence suppresses candidates AND subType", async () => {
  const call = async () => ({
    category: "small_appliance",
    sub_type: "air-purifier",
    knowledge_confidence: "low",
    candidate_fields: [{ key: "wattage", label: "W", value: 60 }],
  })
  const res = await runProductLookup(call, "Nomad", "ZZZ-999", null)
  assert.equal(res.candidates.length, 0)
  assert.equal(res.safe.subType, null)
  assert.equal(res.safe.category, "small_appliance") // category still allowed
})

test("invalid category enum + bad candidate keys/values are dropped", async () => {
  const call = async () => ({
    category: "not_a_real_category",
    sub_type: "widget",
    knowledge_confidence: "medium",
    candidate_fields: [
      { key: "Bad Key!", label: "x", value: 1 }, // non-snake_case → dropped
      { key: "voltage", label: "V", value: {} }, // non-primitive value → dropped
      { key: "amps", label: "A", value: 15 }, // kept
    ],
  })
  const res = await runProductLookup(call, "GE", "XYZ", null)
  assert.equal(res.safe.category, null)
  assert.equal(res.candidates.length, 1)
  assert.equal(res.candidates[0].key, "amps")
})

test("candidate list is hard-capped at 12", async () => {
  const many = Array.from({ length: 20 }, (_, i) => ({ key: `spec_${i}`, label: `L${i}`, value: i }))
  const call = async () => ({
    category: null, sub_type: null, knowledge_confidence: "high", candidate_fields: many,
  })
  const res = await runProductLookup(call, "Brand", "Model", null)
  assert.equal(res.candidates.length, 12)
})

test("no tool block → neutral low-confidence result", async () => {
  const call = async () => null
  const res = await runProductLookup(call, "Brand", "Model", null)
  assert.equal(res.knowledgeConfidence, "low")
  assert.equal(res.candidates.length, 0)
  assert.equal(res.safe.category, null)
})

test("cacheKey is stable + case/whitespace-insensitive", () => {
  const a = cacheKey("Coway", "AP-1512HH", "small_appliance", null)
  const b = cacheKey("  coway ", "ap-1512hh", "SMALL_APPLIANCE", null)
  assert.equal(a, b)
  assert.equal(a.length, 64) // sha-256 hex
})
