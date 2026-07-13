/**
 * classifyExistingTasks core test — parseClassifierOutput taxonomy validation
 * (care_type enum, schedule enum, symptom-tag filtering + cap, fence/prose
 * tolerance, required justification) and arraysEqualSet.
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import {
  parseClassifierOutput,
  arraysEqualSet,
} from "../lib/firebase/functions/src/ai/classifyExistingTasks.js"

test("valid array parses; invalid entries dropped", () => {
  const text = JSON.stringify([
    { task_template_id: "a", proposed_is_reference: false, proposed_care_type: "maintenance", proposed_schedule_type: "monthly", proposed_symptom_tags: ["odor", "bogus", "odor"], justification: "Skipping risks pump damage." },
    { task_template_id: "b", proposed_care_type: "not_valid", justification: "x" }, // bad care_type
    { task_template_id: "c", proposed_care_type: "cleaning", justification: "" }, // empty justification
  ])
  const out = parseClassifierOutput(text)
  assert.equal(out.length, 1)
  assert.equal(out[0].task_template_id, "a")
  assert.deepEqual(out[0].proposed_symptom_tags, ["odor"]) // bogus filtered, deduped
})

test("bad schedule_type becomes null; symptom tags capped at 3", () => {
  const text = JSON.stringify([
    { task_template_id: "a", proposed_care_type: "cleaning", proposed_schedule_type: "fortnightly", proposed_symptom_tags: ["odor", "leaking", "noise", "vibration"], justification: "Cosmetic." },
  ])
  const out = parseClassifierOutput(text)
  assert.equal(out[0].proposed_schedule_type, null)
  assert.equal(out[0].proposed_symptom_tags.length, 3)
})

test("tolerates markdown fences + prose preamble", () => {
  const text = 'Here you go:\n```json\n[{"task_template_id":"a","proposed_care_type":"mixed","justification":"Both."}]\n```'
  const out = parseClassifierOutput(text)
  assert.equal(out.length, 1)
  assert.equal(out[0].proposed_care_type, "mixed")
})

test("no array → null", () => {
  assert.equal(parseClassifierOutput("nope"), null)
})

test("arraysEqualSet is order-independent + dedupe-safe", () => {
  assert.equal(arraysEqualSet(["a", "b"], ["b", "a"]), true)
  assert.equal(arraysEqualSet(["a", "a", "b"], ["a", "b"]), true)
  assert.equal(arraysEqualSet(["a"], ["a", "b"]), false)
})
