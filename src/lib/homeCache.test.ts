/**
 * Primary-home warm start.
 *
 * getPrimaryHome cost 729ms on the owner's phone — the slowest step of the boot
 * and a blocking one, since every dashboard query is keyed by home id. Caching
 * it is safe only if these hold.
 */
import { describe, it, expect, beforeEach } from "vitest"
import { readCachedHome, writeCachedHome, clearCachedHome } from "./homeCache"
import type { Home } from "@/integrations/types"

const HOME = { home_id: "h1", name: "SF Condo", timezone: "America/Los_Angeles",
  created_at: "", updated_at: "", deleted_at: null } as Home

beforeEach(() => localStorage.clear())

describe("homeCache", () => {
  it("returns what was written for the same user", () => {
    writeCachedHome("uid-1", HOME)
    expect(readCachedHome("uid-1")?.home_id).toBe("h1")
  })

  it("NEVER returns another user's home", () => {
    // Two accounts on one device. A stale entry from the previous account is
    // worse than a slow boot — it would show someone else's house.
    writeCachedHome("uid-1", HOME)
    expect(readCachedHome("uid-2")).toBe(null)
  })

  it("returns nothing when signed out", () => {
    writeCachedHome("uid-1", HOME)
    expect(readCachedHome(null)).toBe(null)
  })

  it("clears on sign-out", () => {
    writeCachedHome("uid-1", HOME)
    clearCachedHome()
    expect(readCachedHome("uid-1")).toBe(null)
  })

  it("writing null removes the entry — a user with no home must not keep an old one", () => {
    writeCachedHome("uid-1", HOME)
    writeCachedHome("uid-1", null)
    expect(readCachedHome("uid-1")).toBe(null)
  })

  it("survives a corrupt payload rather than throwing into the boot", () => {
    localStorage.setItem("homehub:primary-home", "{not json")
    expect(readCachedHome("uid-1")).toBe(null)
  })

  it("ignores a payload missing a home id", () => {
    localStorage.setItem("homehub:primary-home", JSON.stringify({ uid: "uid-1", home: {} }))
    expect(readCachedHome("uid-1")).toBe(null)
  })
})
