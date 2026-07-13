/**
 * generateTasks core test — fixture Claude response (no live API, no emulator).
 * Verifies prompt-mode selection (PDF vs no-PDF), output validation/clamping,
 * and the SSRF guard surfacing.
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import { runGenerateTasks } from "../lib/firebase/functions/src/ai/generateTasks.js"

const FIXTURE = JSON.stringify({
  tasks: [
    { title: "Replace HVAC filter", frequencyValue: 3, frequencyUnit: "months", type: "maintenance", priority: "essential", effort: "short", instructions: "Slide out the old filter, insert the new one arrow-toward-blower." },
    { title: "Bad unit", frequencyUnit: "fortnights", type: "nonsense", priority: "critical", effort: "epic" },
  ],
  troubleshooting: [{ problem: "No heat", cause: "Tripped breaker", solution: "Reset the breaker" }],
})

let seq = 0
const deps = { newId: () => `id-${seq++}`, fetchPdf: async () => "BASE64PDF" }

test("no-PDF mode: validates + clamps invalid enum fields to defaults", async () => {
  let captured
  const call = async (args) => { captured = args; return FIXTURE }
  const res = await runGenerateTasks(call, { itemName: "Furnace", itemCategory: "system" }, deps)
  // No document block when no manualUrl.
  assert.equal(captured.content.some((b) => b.type === "document"), false)
  assert.equal(captured.content[0].text.includes("no manual is available"), true)
  assert.equal(res.tasks.length, 2)
  assert.equal(res.tasks[0].type, "maintenance")
  // Second task's invalid enums fall back to defaults.
  assert.equal(res.tasks[1].type, "maintenance")
  assert.equal(res.tasks[1].priority, "recommended")
  assert.equal(res.tasks[1].effort, "medium")
  assert.equal(res.tasks[1].frequencyUnit, null)
  assert.equal(res.troubleshooting[0].problem, "No heat")
})

test("PDF mode: attaches the document block + uses the manual prompt", async () => {
  let captured
  const call = async (args) => { captured = args; return FIXTURE }
  const res = await runGenerateTasks(call, { itemName: "Range", manualUrl: "https://example.com/m.pdf" }, deps)
  assert.equal(captured.content[0].type, "document")
  assert.equal(captured.content[1].text.includes("attached the owner's manual"), true)
  assert.ok(res.tasks.length >= 1)
})

test("SSRF-blocked manual URL rejects", async () => {
  const call = async () => FIXTURE
  await assert.rejects(
    () => runGenerateTasks(call, { manualUrl: "http://169.254.169.254/latest/meta-data" }, { newId: deps.newId }),
    /URL not allowed/
  )
})

test("clamps to the category max (small_appliance → 4)", async () => {
  const many = JSON.stringify({ tasks: Array.from({ length: 10 }, (_, i) => ({ title: `T${i}`, type: "cleaning", priority: "optional", effort: "short" })) })
  const res = await runGenerateTasks(async () => many, { itemCategory: "small_appliance" }, deps)
  assert.equal(res.tasks.length, 4)
})
