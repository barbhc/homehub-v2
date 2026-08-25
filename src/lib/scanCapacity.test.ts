import { describe, it, expect, beforeEach } from "vitest"
import {
  isCapacityRefusal,
  isGlobalCapacityRefusal,
  capacityNotice,
  queueScan,
  isScanQueued,
  unqueueScan,
  dueScans,
} from "./scanCapacity"

const T0 = Date.parse("2026-08-25T12:00:00.000Z")

beforeEach(() => localStorage.clear())

describe("telling a ceiling apart from a failure", () => {
  it("recognises the daily and the app-wide ceilings", () => {
    expect(isCapacityRefusal("Daily AI limit reached (50 actions per day).")).toBe(true)
    expect(isCapacityRefusal("Homehub has hit its monthly AI budget.")).toBe(true)
    expect(isCapacityRefusal("RESOURCE-EXHAUSTED")).toBe(true)
  })

  it("does NOT dress a real failure up as one", () => {
    // The whole risk here: promising a scan that will never come.
    expect(isCapacityRefusal("That link opened a web page, not a PDF")).toBe(false)
    expect(isCapacityRefusal("Invalid PDF structure.")).toBe(false)
    expect(isCapacityRefusal("The scan failed")).toBe(false)
    expect(isCapacityRefusal("")).toBe(false)
    expect(isCapacityRefusal(null)).toBe(false)
  })

  it("separates the app-wide budget from this user's day", () => {
    expect(isGlobalCapacityRefusal("Homehub has hit its monthly AI budget.")).toBe(true)
    expect(isGlobalCapacityRefusal("Daily AI limit reached (50 actions per day).")).toBe(false)
  })
})

describe("what the ceiling says", () => {
  const daily = capacityNotice("Daily AI limit reached (50 actions per day).")
  const global = capacityNotice("Homehub has hit its monthly AI budget.")

  it("leads with nothing being lost", () => {
    expect(daily.body).toMatch(/saved and queued/i)
    expect(global.body).toMatch(/saved and queued/i)
  })

  it("never names a clock the user did not choose", () => {
    for (const n of [daily, global]) {
      expect(`${n.title} ${n.body} ${n.eta}`).not.toMatch(/utc|midnight|gmt/i)
    }
  })

  it("promises no time it cannot keep", () => {
    for (const n of [daily, global]) {
      expect(`${n.title} ${n.body} ${n.eta}`).not.toMatch(/\d+\s*(minutes?|hours?|am|pm)\b/i)
    }
  })

  it("says plainly when it is not the user's doing", () => {
    expect(global.body).toMatch(/isn't something you did/i)
  })

  it("reads as a state, not a refusal", () => {
    expect(daily.title).not.toMatch(/error|failed|cannot|can't/i)
    expect(daily.chip).toBe("Queued")
  })
})

describe("the queue survives the refusal", () => {
  it("remembers a refused scan", () => {
    queueScan("m1", "i1", T0)
    expect(isScanQueued("m1")).toBe(true)
    expect(dueScans(T0)).toHaveLength(1)
  })

  it("is idempotent — queuing twice does not double it", () => {
    queueScan("m1", "i1", T0)
    queueScan("m1", "i1", T0 + 1000)
    expect(dueScans(T0 + 1000)).toHaveLength(1)
  })

  it("forgets one once it has run", () => {
    queueScan("m1", "i1", T0)
    unqueueScan("m1")
    expect(isScanQueued("m1")).toBe(false)
    expect(dueScans(T0)).toEqual([])
  })

  it("retries the longest-waiting first", () => {
    queueScan("newer", "i1", T0)
    queueScan("older", "i2", T0 - 60_000)
    expect(dueScans(T0).map((e) => e.manualId)).toEqual(["older", "newer"])
  })

  it("drops entries too old to still be wanted", () => {
    queueScan("ancient", "i1", T0 - 5 * 24 * 60 * 60 * 1000)
    queueScan("fresh", "i2", T0)
    expect(dueScans(T0).map((e) => e.manualId)).toEqual(["fresh"])
  })

  it("survives a corrupt store rather than breaking the page", () => {
    localStorage.setItem("homehub:scans-awaiting-capacity", "{not json")
    expect(dueScans(T0)).toEqual([])
    expect(isScanQueued("m1")).toBe(false)
  })

  it("ignores entries that are not the right shape", () => {
    localStorage.setItem("homehub:scans-awaiting-capacity", JSON.stringify([{ nope: true }, null, 7]))
    expect(dueScans(T0)).toEqual([])
  })
})
