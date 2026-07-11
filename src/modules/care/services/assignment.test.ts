import { describe, it, expect } from "vitest"
import { canAssignTasks, isValidAssignee, resolveInheritedAssignee } from "./assignment"

describe("canAssignTasks", () => {
  it("is false for a solo home", () => {
    expect(canAssignTasks(1)).toBe(false)
    expect(canAssignTasks(0)).toBe(false)
  })
  it("is true once a home has more than one member", () => {
    expect(canAssignTasks(2)).toBe(true)
    expect(canAssignTasks(5)).toBe(true)
  })
})

describe("isValidAssignee", () => {
  const members = ["u1", "u2", "u3"]
  it("treats null/undefined (unassigned) as valid", () => {
    expect(isValidAssignee(null, members)).toBe(true)
    expect(isValidAssignee(undefined, members)).toBe(true)
  })
  it("accepts a current member", () => {
    expect(isValidAssignee("u2", members)).toBe(true)
  })
  it("rejects a non-member (e.g. someone who left)", () => {
    expect(isValidAssignee("gone", members)).toBe(false)
  })
})

describe("resolveInheritedAssignee", () => {
  const members = ["owner", "partner"]
  it("prefers the template default when set and valid", () => {
    expect(resolveInheritedAssignee("partner", "owner", members)).toBe("partner")
  })
  it("falls back to the previous assignee when no template default", () => {
    expect(resolveInheritedAssignee(null, "owner", members)).toBe("owner")
  })
  it("collapses to null when the inherited id is no longer a member", () => {
    expect(resolveInheritedAssignee(null, "gone", members)).toBeNull()
    expect(resolveInheritedAssignee("gone", "owner", members)).toBe("owner")
  })
  it("is null when there is nothing to inherit", () => {
    expect(resolveInheritedAssignee(null, null, members)).toBeNull()
  })
})
