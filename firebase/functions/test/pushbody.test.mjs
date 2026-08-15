// The daily push's copy + destination. Extracted expectations, not the fn itself
// (onSchedule needs a Firebase runtime), so this guards the decision table.
import test from "node:test"
import assert from "node:assert"

function pushFor(tasks) {
  const count = tasks.length
  const only = count === 1 ? tasks[0] : null
  return {
    title: only ? "Due today" : "Home care today",
    body: only ? `${only.title}${only.itemName ? ` · ${only.itemName}` : ""}` : `You have ${count} tasks due today.`,
    url: only ? `/tasks/${only.id}` : "/maintenance",
  }
}

test("one task names it and links straight to it", () => {
  const p = pushFor([{ id: "abc", title: "Replace the air filter", itemName: "Furnace" }])
  assert.equal(p.title, "Due today")
  assert.equal(p.body, "Replace the air filter · Furnace")
  assert.equal(p.url, "/tasks/abc")
})

test("a home-scoped task still names itself", () => {
  const p = pushFor([{ id: "h1", title: "Test smoke alarms", itemName: null }])
  assert.equal(p.body, "Test smoke alarms")
})

test("several tasks summarise and open the list — picking one would be a guess", () => {
  const p = pushFor([
    { id: "a", title: "A", itemName: null },
    { id: "b", title: "B", itemName: null },
  ])
  assert.equal(p.body, "You have 2 tasks due today.")
  assert.equal(p.url, "/maintenance")
})

// ── initial due-date seeding (commitDraft) ──────────────────────────────────
import { addCadence, seasonalNextDue } from "../lib/firebase/functions/src/schedule/cadence.js"

test("a new item's tasks start one cadence out, not today", () => {
  // The reported bug: 7 tasks "due Today" on a just-added air purifier,
  // including a yearly HEPA filter. The clock starts at add time.
  assert.equal(addCadence("2026-08-15", "weekly", null), "2026-08-22")
  assert.equal(addCadence("2026-08-15", "monthly", null), "2026-09-15")
  assert.equal(addCadence("2026-08-15", "annual", null), "2027-08-15")
  assert.equal(addCadence("2026-08-15", "every_n_days", 14), "2026-08-29")
})

test("seasonal still anchors to the season, not the parse date", () => {
  const d = seasonalNextDue("fall", "2026-08-15")
  assert.ok(d && d > "2026-08-15", `expected a future fall date, got ${d}`)
})
