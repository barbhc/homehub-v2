/**
 * swrPersist — verifies the cross-restart dashboard cache contract: restore from
 * localStorage, persist ONLY resolved dashboard:* data on hide, and clear on
 * sign-out. These are the failure modes that would silently break reopen speed
 * or leak one user's Home to the next.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { localStorageDashboardProvider, clearPersistedDashboardCache } from "./swrPersist"

const CACHE_KEY = "hh-swr-dashboard-cache"

describe("swrPersist", () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => localStorage.clear())

  it("seeds the map from a previously persisted cache", () => {
    localStorage.setItem(CACHE_KEY, JSON.stringify([["dashboard:h1", { data: { stats: 7 } }]]))
    const map = localStorageDashboardProvider()
    expect(map.get("dashboard:h1")).toEqual({ data: { stats: 7 } })
  })

  it("starts empty (never throws) when there is no cache or it's corrupt", () => {
    expect(localStorageDashboardProvider().size).toBe(0)
    localStorage.setItem(CACHE_KEY, "{not json")
    expect(localStorageDashboardProvider().size).toBe(0)
  })

  it("on hide, persists ONLY dashboard:* entries, and only their data", () => {
    const map = localStorageDashboardProvider()
    map.set("dashboard:h1", { data: { tasks: [1, 2] } })
    map.set("other:thing", { data: "should-not-persist" }) // non-dashboard key
    map.set("dashboard:h2", {}) // no data yet (in-flight) → skipped

    window.dispatchEvent(new Event("beforeunload"))

    const persisted = JSON.parse(localStorage.getItem(CACHE_KEY) || "[]")
    const keys = persisted.map(([k]: [string, unknown]) => k)
    expect(keys).toEqual(["dashboard:h1"])
    expect(persisted[0][1]).toEqual({ data: { tasks: [1, 2] } }) // data only, no error/validating
  })

  it("clearPersistedDashboardCache removes the persisted entry", () => {
    localStorage.setItem(CACHE_KEY, JSON.stringify([["dashboard:h1", { data: 1 }]]))
    clearPersistedDashboardCache()
    expect(localStorage.getItem(CACHE_KEY)).toBeNull()
  })
})
