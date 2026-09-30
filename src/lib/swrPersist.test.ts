/**
 * swrPersist — the cross-restart warm-start contract: hand the last Home, Items
 * list and Tasks agenda back as SWR `fallback`, persist ONLY resolved data under
 * allowlisted keys, and clear on sign-out. These are the failure modes that
 * would silently break reopen speed, hand a page a payload it can't render, or
 * leak one user's home to the next.
 *
 * The provider-based version of this module wedged Home forever in dev (SWRConfig
 * tears a custom cache provider down in a layout-effect cleanup, which React
 * StrictMode runs mid-mount). `fallback` has no lifecycle — these tests pin the
 * plain-data contract that replaced it.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import {
  readPersistedSwrFallback,
  persistSwrSnapshot,
  clearPersistedSwrCache,
  ITEMS_KEY_PREFIX,
  WEEK_KEY_PREFIX,
} from "./swrPersist"

const CACHE_KEY = "hh-swr-dashboard-cache"

const ITEMS = {
  items: [{ item_unit_id: "i1", display_name: "Furnace", brand: "Carrier" }],
  rooms: [{ room_id: "r1", name: "Basement" }],
}
const WEEK = {
  items: [{ taskInstanceId: "t1", title: "Replace the furnace filter", dueDate: "2026-10-01" }],
  hiddenCleaning: 0,
}

describe("swrPersist", () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => localStorage.clear())

  it("returns a keyed fallback map for SWR", () => {
    persistSwrSnapshot("dashboard:h1", { stats: 7 })
    expect(readPersistedSwrFallback()).toEqual({ "dashboard:h1": { stats: 7 } })
  })

  it("keeps snapshots for multiple homes", () => {
    persistSwrSnapshot("dashboard:h1", { stats: 1 })
    persistSwrSnapshot("dashboard:h2", { stats: 2 })
    expect(readPersistedSwrFallback()).toEqual({
      "dashboard:h1": { stats: 1 },
      "dashboard:h2": { stats: 2 },
    })
  })

  it("overwrites a home's snapshot on the next success", () => {
    persistSwrSnapshot("dashboard:h1", { stats: 1 })
    persistSwrSnapshot("dashboard:h1", { stats: 99 })
    expect(readPersistedSwrFallback()["dashboard:h1"]).toEqual({ stats: 99 })
  })

  it("persists ONLY allowlisted keys, and never an undefined payload", () => {
    persistSwrSnapshot("other:thing", "should-not-persist")
    // Prefix-alikes are not the allowlisted keys: SWR's other `week:` keys
    // (useWeekReminders) and un-versioned `items:` keys stay in memory only.
    persistSwrSnapshot("week:reminders:h1:curated:30", { all: [] })
    persistSwrSnapshot("items:h1", ITEMS)
    persistSwrSnapshot("dashboard:h2", undefined)
    expect(readPersistedSwrFallback()).toEqual({})
    expect(localStorage.getItem(CACHE_KEY)).toBeNull()
  })

  it("round-trips the Items list and the Tasks agenda alongside the dashboard", () => {
    persistSwrSnapshot("dashboard:core:h1", { stats: 3 })
    persistSwrSnapshot(`${ITEMS_KEY_PREFIX}h1`, ITEMS)
    persistSwrSnapshot(`${WEEK_KEY_PREFIX}h1`, WEEK)
    expect(readPersistedSwrFallback()).toEqual({
      "dashboard:core:h1": { stats: 3 },
      "items:v1:h1": ITEMS,
      "week:v1:h1": WEEK,
    })
  })

  it("ignores a snapshot written under another VERSION of a key, and drops it on the next write", () => {
    // What an older (or newer) build left behind: same page, different payload shape.
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify([
        ["items:v0:h1", { list: ["an older shape"] }],
        ["week:v2:h1", { rows: [] }],
        ["dashboard:h1", { stats: 5 }],
      ]),
    )
    expect(readPersistedSwrFallback()).toEqual({ "dashboard:h1": { stats: 5 } })

    persistSwrSnapshot(`${ITEMS_KEY_PREFIX}h1`, ITEMS)
    const stored = localStorage.getItem(CACHE_KEY) ?? ""
    expect(stored).not.toContain("items:v0:")
    expect(stored).not.toContain("week:v2:")
    expect(readPersistedSwrFallback()).toEqual({ "dashboard:h1": { stats: 5 }, "items:v1:h1": ITEMS })
  })

  it("drops a versioned snapshot that doesn't have the shape its page indexes into", () => {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify([
        // A row with no display_name would throw in the list's search filter.
        ["items:v1:h1", { items: [{ item_unit_id: "i1" }], rooms: [] }],
        ["items:v1:h2", { items: "not a list", rooms: [] }],
        ["week:v1:h1", { items: [{ taskInstanceId: "t1", title: "x", dueDate: "2026-10-01" }] }], // no hiddenCleaning
        ["week:v1:h2", WEEK],
      ]),
    )
    expect(readPersistedSwrFallback()).toEqual({ "week:v1:h2": WEEK })
  })

  it("returns {} (never throws) with no cache, corrupt JSON, or a non-array payload", () => {
    expect(readPersistedSwrFallback()).toEqual({})
    localStorage.setItem(CACHE_KEY, "{not json")
    expect(readPersistedSwrFallback()).toEqual({})
    localStorage.setItem(CACHE_KEY, JSON.stringify({ nope: true }))
    expect(readPersistedSwrFallback()).toEqual({})
    localStorage.setItem(CACHE_KEY, JSON.stringify(["bad-entry", 42]))
    expect(readPersistedSwrFallback()).toEqual({})
  })

  it("still reads a Home cache written by the provider-era format ({ data })", () => {
    // Users upgrading carry the old shape in localStorage; unwrap it rather than
    // handing SWR a fallback of `{ data: … }` that Home would render as garbage.
    localStorage.setItem(CACHE_KEY, JSON.stringify([["dashboard:h1", { data: { stats: 7 } }]]))
    expect(readPersistedSwrFallback()).toEqual({ "dashboard:h1": { stats: 7 } })
  })

  it("never unwraps a newer key's payload as if it were the provider-era format", () => {
    // Only dashboard keys existed in that era; a `data` field anywhere else is
    // the payload's own, and the shape check sees the payload as written.
    const withData = { ...WEEK, data: "its own field" }
    persistSwrSnapshot(`${WEEK_KEY_PREFIX}h1`, withData)
    expect(readPersistedSwrFallback()[`${WEEK_KEY_PREFIX}h1`]).toEqual(withData)
  })

  it("clearPersistedSwrCache removes every persisted page (sign-out)", () => {
    persistSwrSnapshot("dashboard:h1", { stats: 1 })
    persistSwrSnapshot(`${ITEMS_KEY_PREFIX}h1`, ITEMS)
    persistSwrSnapshot(`${WEEK_KEY_PREFIX}h1`, WEEK)
    clearPersistedSwrCache()
    expect(localStorage.getItem(CACHE_KEY)).toBeNull()
    expect(readPersistedSwrFallback()).toEqual({})
  })
})
