/**
 * proposeCore with a fake tool call — every "existing templates only" rule is
 * enforced here, in code, not in the prompt. Imports the compiled lib.
 */
import test from "node:test"
import assert from "node:assert/strict"
import { proposeCore, offerableRow, MAX_PROPOSALS, PROPOSE_TOOL } from "../lib/firebase/functions/src/ai/proposeReminders.js"

const row = (id, over = {}) => ({
  id, title: `Task ${id}`, itemName: "Furnace", careType: "maintenance", scopeType: "item_unit", priorityTier: "recommended",
  scheduleType: "quarterly", intervalDays: null, remindEnabled: null, ...over,
})
const rows = [row("a"), row("b", { remindEnabled: true }), row("c", { scheduleType: "every_n_days", intervalDays: 14 })]
const fake = (proposals) => async (args) => {
  assert.equal(args.tool.name, "propose_reminders") // the forced tool, not free text
  return { proposals }
}
/** The ids the model was actually shown — the JSON list is the prompt's last line. */
const offeredIds = (args) => {
  const text = args.content[0].text
  return JSON.parse(text.slice(text.lastIndexOf("\n") + 1)).map((r) => r.task_template_id)
}

test("a hallucinated id is dropped; valid ones keep their real title, item, schedule and flag", async () => {
  const out = await proposeCore(rows, "filters", fake([
    { task_template_id: "ghost", reason: "made up" },
    { task_template_id: "b", reason: "you said filters" },
  ]))
  assert.deepEqual(out.map((p) => p.task_template_id), ["b"])
  assert.equal(out[0].title, "Task b")
  assert.equal(out[0].remind_already_on, true)
  assert.equal(out[0].current_schedule_type, "quarterly")
  assert.equal(out[0].reason, "you said filters")
})

test("duplicates collapse and the list is capped", async () => {
  const many = Array.from({ length: 40 }, (_, i) => row(`t${i}`))
  const out = await proposeCore(many, "everything", fake([
    { task_template_id: "t0", reason: "x" }, { task_template_id: "t0", reason: "again" },
    ...many.slice(1).map((r) => ({ task_template_id: r.id, reason: "y" })),
  ]))
  assert.equal(out.length, MAX_PROPOSALS)
  assert.equal(out.filter((p) => p.task_template_id === "t0").length, 1)
})

test("every_n_days without an interval is not a schedule; setup is never suggested; a no-op suggestion is null", async () => {
  const out = await proposeCore(rows, "x", fake([
    { task_template_id: "a", reason: "r", suggested_schedule_type: "every_n_days" },
    { task_template_id: "b", reason: "r", suggested_schedule_type: "setup" },
    { task_template_id: "c", reason: "r", suggested_schedule_type: "every_n_days", suggested_interval_days: 14 },
  ]))
  assert.equal(out[0].suggested_schedule_type, null)
  assert.equal(out[1].suggested_schedule_type, null)
  assert.equal(out[2].suggested_schedule_type, null) // same as current → nothing to change
})

test("a real schedule change survives, with its interval only when every_n_days", async () => {
  const out = await proposeCore(rows, "x", fake([
    { task_template_id: "a", reason: "r", suggested_schedule_type: "monthly", suggested_interval_days: 30 },
    { task_template_id: "b", reason: "r", suggested_schedule_type: "every_n_days", suggested_interval_days: 45 },
  ]))
  assert.equal(out[0].suggested_schedule_type, "monthly")
  assert.equal(out[0].suggested_interval_days, null)
  assert.equal(out[1].suggested_schedule_type, "every_n_days")
  assert.equal(out[1].suggested_interval_days, 45)
})

test("a malformed tool result yields an empty list, not a throw — the client shows 'nothing matched'", async () => {
  assert.deepEqual(await proposeCore(rows, "x", async () => null), [])
  assert.deepEqual(await proposeCore(rows, "x", async () => ({ proposals: "nope" })), [])
})

test("the tool schema never offers setup and caps the array", () => {
  const items = PROPOSE_TOOL.input_schema.properties.proposals
  assert.equal(items.maxItems, MAX_PROPOSALS)
  assert.ok(!items.items.properties.suggested_schedule_type.enum.includes("setup"))
})

/**
 * Seen live 2026-09-02: "Descale the Machine · Nespresso Coffee · when needed"
 * was proposed, ticked and turned on — and could never notify, because a task
 * with no recurring schedule never comes due. The pick list already refused
 * such tasks (`offerable` on the page); the proposal path now holds the same
 * line on both sides of the model call.
 */
test("only tasks that recur AND would notify are shown to the model — the same rule as the pick list", () => {
  assert.equal(offerableRow(row("recurs")), true)
  assert.equal(offerableRow(row("chore", { careType: "cleaning", scopeType: "home", scheduleType: "weekly" })), true)
  assert.equal(offerableRow(row("tip", { scheduleType: "as_needed" })), false)
  assert.equal(offerableRow(row("habit", { scheduleType: "after_each_use" })), false)
  assert.equal(offerableRow(row("install", { scheduleType: "setup" })), false)
  assert.equal(offerableRow(row("unscheduled", { scheduleType: null })), false)
  // Recurs, but the week and the push lanes never carry item-scoped cleaning.
  assert.equal(offerableRow(row("wipe", { careType: "cleaning", scopeType: "item_unit", scheduleType: "monthly" })), false)
})

test("a 'when needed' task never reaches the model, and its id is dropped on the way back even though the home has it", async () => {
  const mixed = [
    row("recurs"),
    row("tip", { title: "Descale the Machine", scheduleType: "as_needed" }),
    row("habit", { scheduleType: "after_each_use" }),
    row("install", { scheduleType: "setup" }),
    row("unscheduled", { scheduleType: null }),
    row("wipe", { careType: "cleaning", scopeType: "item_unit", scheduleType: "monthly" }),
    row("chore", { careType: "cleaning", scopeType: "home", scheduleType: "weekly" }),
  ]
  let shown = null
  const out = await proposeCore(mixed, "descaling the coffee machine", async (args) => {
    shown = offeredIds(args)
    // The model "returns" every id anyway — the ones it was never shown must not survive.
    return { proposals: mixed.map((r) => ({ task_template_id: r.id, reason: "you said so" })) }
  })
  assert.deepEqual(shown, ["recurs", "chore"])
  assert.deepEqual(out.map((p) => p.task_template_id), ["recurs", "chore"])
})

test("a suggested cadence that never comes due is nulled, and the schema does not offer one", async () => {
  const out = await proposeCore(rows, "x", fake([
    { task_template_id: "a", reason: "r", suggested_schedule_type: "as_needed" },
    { task_template_id: "b", reason: "r", suggested_schedule_type: "after_each_use" },
  ]))
  assert.equal(out[0].suggested_schedule_type, null)
  assert.equal(out[1].suggested_schedule_type, null)
  const allowed = PROPOSE_TOOL.input_schema.properties.proposals.items.properties.suggested_schedule_type.enum
  for (const never of ["as_needed", "after_each_use", "setup"]) assert.ok(!allowed.includes(never), never)
  assert.deepEqual([...allowed], ["weekly", "monthly", "quarterly", "semiannual", "annual", "seasonal", "every_n_days"])
})

test("a home with nothing offerable gets an empty list and the model is never called", async () => {
  let called = false
  const out = await proposeCore([row("tip", { scheduleType: "as_needed" }), row("install", { scheduleType: "setup" })], "x", async () => {
    called = true
    return { proposals: [] }
  })
  assert.deepEqual(out, [])
  assert.equal(called, false)
})
