import { describe, expect, it } from "vitest"
import { personInitials, personLabel } from "./personName"

describe("personLabel — no name never reads as a wrong word", () => {
  it("uses the stored name, trimmed", () => {
    expect(personLabel("  Barb Chang ", { isSelf: false })).toBe("Barb Chang")
  })
  it("calls you You and anyone else Member", () => {
    expect(personLabel(null, { isSelf: true, email: "barb@example.com" })).toBe("You")
    expect(personLabel("", { isSelf: false })).toBe("Member")
    expect(personLabel("   ", { isSelf: false })).toBe("Member")
  })
})

describe("personInitials", () => {
  it("takes two initials from a name", () => {
    expect(personInitials("E2E Tester", { isSelf: false })).toBe("ET")
    expect(personInitials("Cher", { isSelf: false })).toBe("C")
  })
  it("falls back to your own email's first letter", () => {
    expect(personInitials(null, { isSelf: true, email: "zoe.k@example.com" })).toBe("Z")
  })
  it("never reads another member's email, and is empty rather than '?'", () => {
    expect(personInitials(null, { isSelf: false, email: "zoe.k@example.com" })).toBe("")
    expect(personInitials(null, { isSelf: true, email: null })).toBe("")
  })
})
