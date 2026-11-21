/** The on-device draft is a serialization boundary: only what checks out is believed. */
import { describe, expect, it, vi } from "vitest"

vi.mock("./homeProfileService", async () => {
  // toArea is the real parser; the module's firebase imports are not needed here.
  const { toArea } = await vi.importActual<typeof import("./homeProfileService")>("./homeProfileService")
  return { toArea }
})

const { parseDraft, EMPTY_DRAFT } = await import("./firstMinuteDraft")

describe("parseDraft", () => {
  it("round-trips a real draft", () => {
    const d = {
      ...EMPTY_DRAFT, step: "list" as const,
      profile: { zip: "94110", home_type: "condo" as const, care_facts: { has_air_filter: true } },
      list: { month: 11, answers: { "home.air_filter": "yes" as const }, checked: {}, removed: { "home.quake": "not_for_me" as const }, corrections: { freeze: null, hazardsOff: ["earthquake" as const] }, exteriorMine: false },
      pending: { kind: "add" as const, patch: { zip: "94110" }, tasks: [{ key: "home.alarm_test", due: "2026-11-21" }] },
      createdHomeId: "h1", addedKeys: ["home.alarm_test"],
    }
    expect(parseDraft(JSON.stringify(d))).toEqual(d)
  })

  it("nothing, garbage, or another version is no draft", () => {
    expect(parseDraft(null)).toBeNull()
    expect(parseDraft("{not json")).toBeNull()
    expect(parseDraft(JSON.stringify({ v: 2, step: "list" }))).toBeNull()
    expect(parseDraft(JSON.stringify([1, 2]))).toBeNull()
  })

  it("drops fields that don't hold up instead of trusting them", () => {
    const d = parseDraft(JSON.stringify({
      v: 1, step: "nowhere",
      profile: { zip: "9411", home_type: "castle", climate: "cold", care_facts: { has_air_filter: "yes", has_fireplace: false } },
      list: { month: 13 },
      pending: { kind: "add", patch: {}, tasks: [{ key: "x", due: "tomorrow" }] },
      createdHomeId: 7, addedKeys: ["a", 3],
    }))
    expect(d).toEqual({
      v: 1, step: "zip", profile: { climate: "cold", care_facts: { has_fireplace: false } },
      list: null, pending: null, createdHomeId: null, addedKeys: ["a"],
    })
  })
})
