/**
 * A notification payload is untrusted input that arrives from outside the app,
 * so the only question that matters is what it is allowed to make the app open.
 */
import { describe, it, expect, beforeEach } from "vitest"
import { sanitizeDeepLink, parkDeepLink, claimDeepLink } from "./pushDeepLink"

describe("sanitizeDeepLink", () => {
  it("accepts in-app paths", () => {
    expect(sanitizeDeepLink("/tasks/abc123")).toBe("/tasks/abc123")
    expect(sanitizeDeepLink("/maintenance")).toBe("/maintenance")
  })

  it("rejects anything that could leave the app", () => {
    // The classic: passes a naive startsWith("/") check, goes to another origin.
    expect(sanitizeDeepLink("//evil.com/steal")).toBeNull()
    expect(sanitizeDeepLink("https://evil.com")).toBeNull()
    expect(sanitizeDeepLink("javascript:alert(1)")).toBeNull()
    expect(sanitizeDeepLink("/tasks\\..\\admin")).toBeNull()
  })

  it("rejects non-strings and empties", () => {
    expect(sanitizeDeepLink(undefined)).toBeNull()
    expect(sanitizeDeepLink(null)).toBeNull()
    expect(sanitizeDeepLink(42)).toBeNull()
    expect(sanitizeDeepLink("")).toBeNull()
  })
})

describe("park / claim", () => {
  beforeEach(() => sessionStorage.clear())

  it("a parked link is claimed exactly once", () => {
    parkDeepLink("/tasks/xyz")
    expect(claimDeepLink()).toBe("/tasks/xyz")
    // Claiming again must not re-navigate on the next mount.
    expect(claimDeepLink()).toBeNull()
  })

  it("never parks something unsafe", () => {
    parkDeepLink("//evil.com")
    expect(claimDeepLink()).toBeNull()
  })
})
