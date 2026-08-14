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
