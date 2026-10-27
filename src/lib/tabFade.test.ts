import { describe, expect, it } from "vitest"
import { shouldFadeTab, tabOf } from "./tabFade"

describe("tab content fade", () => {
  it("maps each path to the tab that owns it", () => {
    expect(tabOf("/home")).toBe("home")
    expect(tabOf("/maintenance")).toBe("tasks")
    expect(tabOf("/inventory")).toBe("items")
    expect(tabOf("/inventory/add")).toBe("items")
    expect(tabOf("/items/abc")).toBe("items")
    expect(tabOf("/chat")).toBe("ask")
    expect(tabOf("/settings")).toBe("settings")
    expect(tabOf("/tasks/t1")).toBeNull()
    expect(tabOf("/clean")).toBeNull()
  })

  it("fades a forward switch to another tab", () => {
    expect(shouldFadeTab("home", "tasks", "PUSH")).toBe(true)
    expect(shouldFadeTab(null, "home", "PUSH")).toBe(true)
  })

  it("never on the first render or a move within one tab (prev === next)", () => {
    expect(shouldFadeTab("home", "home", "PUSH")).toBe(false)
    expect(shouldFadeTab("items", tabOf("/items/abc"), "PUSH")).toBe(false)
  })

  it("never on Back/Forward, and never into a pushed page", () => {
    expect(shouldFadeTab("tasks", "home", "POP")).toBe(false)
    expect(shouldFadeTab("home", null, "PUSH")).toBe(false)
  })
})
