/**
 * productLookup core test — fixture tool_use input for runProductLookup. Verifies
 * category enum validation, candidate sanitization (bad keys/values dropped, keys
 * outside the category's field schema dropped, hard cap), the low-confidence guard
 * (candidates + subType suppressed), and the no-tool-block fallback. Also
 * exercises the deterministic cacheKey hash.
 *
 * Fixture keys must come from shared/products/specKeys.ts. Invented keys are
 * dropped by the schema gate before any other rule is reached, which silently
 * turns every downstream assertion into a test of the gate instead of the thing
 * named in the test title.
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import { runProductLookup, cacheKey, haikuIdentity } from "../lib/firebase/functions/src/ai/productLookup.js"
import { allSpecKeys } from "../lib/shared/products/specKeys.js"

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
      { key: "wattage", label: "W", value: {} }, // on-schema key, non-primitive value → dropped
      { key: "material", label: "Material", value: "steel" }, // kept
    ],
  })
  const res = await runProductLookup(call, "GE", "XYZ", null)
  assert.equal(res.safe.category, null)
  assert.equal(res.candidates.length, 1)
  assert.equal(res.candidates[0].key, "material")
})

// The gate from PR #88: a key outside the category's field schema cannot be
// rendered by the wizard form, so applying it writes a spec the user can
// neither see nor correct. `power` is the real-world offender — the model
// returned it for an air fryer whose only real field is `wattage`, and the item
// saved carrying both.
test("off-schema spec keys are dropped even when well-formed", async () => {
  const call = async () => ({
    category: "small_appliance",
    sub_type: "air-fryer",
    knowledge_confidence: "high",
    candidate_fields: [
      { key: "power", label: "Power (W)", value: 700 }, // not in small_appliance → dropped
      { key: "material", label: "Material", value: "steel" }, // valid key, wrong category → dropped
      { key: "wattage", label: "Wattage (W)", value: 1690 }, // kept
    ],
  })
  const res = await runProductLookup(call, "Ninja", "AF101", null)
  assert.equal(res.candidates.length, 1)
  assert.equal(res.candidates[0].key, "wattage")
  assert.equal(res.candidates[0].value, 1690)
})

test("candidate list is hard-capped at 12", async () => {
  // Every key has to survive the schema gate first, or the cap is never the
  // thing under test: 20 invented keys drop to zero and the assertion would
  // pass for the wrong reason. Real keys from the shared allowlist, and an
  // explicit precondition so a future schema trim cannot quietly gut this.
  const keys = allSpecKeys()
  assert.ok(keys.length > 12, `need more allowed keys than the cap; got ${keys.length}`)
  const many = keys.slice(0, 20).map((key, i) => ({ key, label: `L${i}`, value: i }))
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

test("variant candidates: extends-only validation, dedupe, cap 3, kept at low confidence", async () => {
  const call = async () => ({
    category: null,
    sub_type: null,
    knowledge_confidence: "low", // knows the family, not the exact model — the fuzzy case
    candidate_fields: [],
    variant_candidates: [
      { model: "WM4000HWA", differentiator: "White" },
      { model: "wm4000hwa", differentiator: "dupe (case)" }, // dedupe vs above
      { model: "WM4000HBA", differentiator: null },
      { model: "RF28R7551SR", differentiator: "wrong family" }, // doesn't extend → dropped
      { model: "WM4000H", differentiator: "same as typed" }, // no extension → dropped
      { model: "WM4000HVA", differentiator: "third" },
      { model: "WM4000HZA", differentiator: "fourth — over cap" },
    ],
  })
  const res = await runProductLookup(call, "LG", "WM4000H", null)
  assert.equal(res.variantCandidates.length, 3)
  assert.deepEqual(
    res.variantCandidates.map((v) => v.model),
    ["WM4000HWA", "WM4000HBA", "WM4000HVA"],
  )
  assert.equal(res.variantCandidates[0].differentiator, "White")
})

test("variant candidates absent from tool input → empty array (legacy fixture shape)", async () => {
  const call = async () => ({ category: null, sub_type: null, knowledge_confidence: "high", candidate_fields: [] })
  const res = await runProductLookup(call, "GE", "XYZ123", null)
  assert.deepEqual(res.variantCandidates, [])
})

test("haikuIdentity: null at low confidence, composed identity otherwise", () => {
  const low = { safe: { category: null, subType: null }, candidates: [], knowledgeConfidence: "low", variantCandidates: [] }
  assert.equal(haikuIdentity(low, "Nomad", "ZZZ-999"), null)

  const high = {
    safe: { category: "small_appliance", subType: "air-purifier" },
    candidates: [],
    knowledgeConfidence: "high",
    variantCandidates: [],
  }
  const id = haikuIdentity(high, "Coway", "AP-1512HH")
  assert.equal(id.name, "Coway AP-1512HH")
  assert.equal(id.rawCategory, "air-purifier")
  assert.equal(id.source, "claude")
  assert.equal(id.confidence, "high")
})
