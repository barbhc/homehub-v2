/**
 * swrPersist — the cross-restart warm-start contract: hand the last dashboard
 * back as SWR `fallback`, persist ONLY resolved dashboard:* data, and clear on
 * sign-out. These are the failure modes that would silently break reopen speed or
 * leak one user's Home to the next.
 *
 * The provider-based version of this module wedged Home forever in dev (SWRConfig
 * tears a custom cache provider down in a layout-effect cleanup, which React
 * StrictMode runs mid-mount). `fallback` has no lifecycle — these tests pin the
 * plain-data contract that replaced it.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import {
  readPersistedDashboardFallback,
  persistDashboardSnapshot,
  clearPersistedDashboardCache,
} from "./swrPersist"

const CACHE_KEY = "hh-swr-dashboard-cache"

describe("swrPersist", () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => localStorage.clear())

  it("returns a keyed fallback map for SWR", () => {
    persistDashboardSnapshot("dashboard:h1", { stats: 7 })
    expect(readPersistedDashboardFallback()).toEqual({ "dashboard:h1": { stats: 7 } })
  })

  it("keeps snapshots for multiple homes", () => {
    persistDashboardSnapshot("dashboard:h1", { stats: 1 })
    persistDashboardSnapshot("dashboard:h2", { stats: 2 })
    expect(readPersistedDashboardFallback()).toEqual({
      "dashboard:h1": { stats: 1 },
      "dashboard:h2": { stats: 2 },
    })
  })

  it("overwrites a home's snapshot on the next success", () => {
    persistDashboardSnapshot("dashboard:h1", { stats: 1 })
    persistDashboardSnapshot("dashboard:h1", { stats: 99 })
    expect(readPersistedDashboardFallback()["dashboard:h1"]).toEqual({ stats: 99 })
  })

  it("persists ONLY dashboard:* keys, and never an undefined payload", () => {
    persistDashboardSnapshot("other:thing", "should-not-persist")
    persistDashboardSnapshot("dashboard:h2", undefined)
    expect(readPersistedDashboardFallback()).toEqual({})
    expect(localStorage.getItem(CACHE_KEY)).toBeNull()
  })

  it("returns {} (never throws) with no cache, corrupt JSON, or a non-array payload", () => {
    expect(readPersistedDashboardFallback()).toEqual({})
    localStorage.setItem(CACHE_KEY, "{not json")
    expect(readPersistedDashboardFallback()).toEqual({})
    localStorage.setItem(CACHE_KEY, JSON.stringify({ nope: true }))
    expect(readPersistedDashboardFallback()).toEqual({})
    localStorage.setItem(CACHE_KEY, JSON.stringify(["bad-entry", 42]))
    expect(readPersistedDashboardFallback()).toEqual({})
  })

  it("still reads a cache written by the provider-era format ({ data })", () => {
    // Users upgrading carry the old shape in localStorage; unwrap it rather than
    // handing SWR a fallback of `{ data: … }` that Home would render as garbage.
    localStorage.setItem(CACHE_KEY, JSON.stringify([["dashboard:h1", { data: { stats: 7 } }]]))
    expect(readPersistedDashboardFallback()).toEqual({ "dashboard:h1": { stats: 7 } })
  })

  it("clearPersistedDashboardCache removes the persisted entry", () => {
    persistDashboardSnapshot("dashboard:h1", { stats: 1 })
    clearPersistedDashboardCache()
    expect(localStorage.getItem(CACHE_KEY)).toBeNull()
    expect(readPersistedDashboardFallback()).toEqual({})
  })
})
