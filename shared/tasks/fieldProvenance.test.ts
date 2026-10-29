import { describe, it, expect } from "vitest"
import {
  cadenceValue,
  changedFields,
  draftRowAsReviewed,
  pairReviewedWithDraft,
  pick,
  provenancePatch,
  provenanceUpdatePaths,
  sameValue,
  sourceOf,
  stampFor,
  storedValues,
  type ProvenanceValues,
} from "./fieldProvenance"

const AT = "2026-10-29T00:00:00Z"
const ME = { by: "user", uid: "uid-a" } as const

const tpl = (over: Record<string, unknown> = {}) => ({
  priorityTier: "recommended",
  careType: "maintenance",
  remindEnabled: null,
  schedule: { scheduleType: "monthly", intervalDays: null, season: null, anchorDate: "2026-10-01" },
  ...over,
})

describe("stamps", () => {
  it("a user stamp names the member; manual and system stamps name no one", () => {
    expect(stampFor("priorityTier", ME, "setTaskReminder", "essential", AT)).toEqual({
      by: "user", uid: "uid-a", at: AT, via: "setTaskReminder", value: "essential",
    })
    expect(stampFor("careType", { by: "manual" }, "commitDraft", "cleaning", AT).uid).toBeNull()
    expect(stampFor("careType", { by: "system" }, "houseRule", "cleaning", AT).uid).toBeNull()
  })

  it("every stamp writes every key, so set(merge) can't leave a previous stamp's uid behind", () => {
    const s = stampFor("remindEnabled", { by: "system" }, "library", undefined as unknown as null, AT)
    expect(Object.keys(s).sort()).toEqual(["at", "by", "uid", "value", "via"])
    expect(s.value).toBeNull()
    const c = stampFor("schedule", ME, "setTaskCadence", { scheduleType: "monthly" } as never, AT)
    expect(c.value).toEqual({ scheduleType: "monthly", intervalDays: null, season: null })
  })

  it("provenancePatch stamps exactly the fields given — and nothing when none are", () => {
    const p = provenancePatch(ME, "updateTaskSchedule", { priorityTier: "optional" }, AT)
    expect(Object.keys(p.fieldSources!)).toEqual(["priorityTier"])
    expect(provenancePatch(ME, "updateTaskSchedule", {}, AT)).toEqual({})
    // remindEnabled: null is a real value (hand back to the tier default), so it IS stamped.
    expect(Object.keys(provenancePatch(ME, "setTaskReminder", { remindEnabled: null }, AT).fieldSources!)).toEqual(["remindEnabled"])
  })

  it("update() paths are dotted, so other fields' stamps survive an update()", () => {
    const paths = provenanceUpdatePaths({ by: "system" }, "classifyExistingTasks", { careType: "cleaning" }, AT)
    expect(Object.keys(paths)).toEqual(["fieldSources.careType"])
    expect(paths["fieldSources.careType"]).toMatchObject({ by: "system", value: "cleaning" })
  })
})

describe("changedFields — what a re-saving editor may stamp", () => {
  const before: ProvenanceValues = storedValues(tpl())
  it("an untouched row changes nothing", () => {
    expect(changedFields(before, { ...before })).toEqual([])
  })
  it("names only the fields whose stored value moves", () => {
    const after = { ...before, priorityTier: "essential", remindEnabled: false }
    expect(changedFields(before, after)).toEqual(["priorityTier", "remindEnabled"])
    expect(pick(after, ["remindEnabled"])).toEqual({ remindEnabled: false })
  })
  it("a cadence is compared in every stored part (type, interval, season)", () => {
    expect(changedFields(before, { schedule: { scheduleType: "monthly", intervalDays: null, season: "fall" } })).toEqual(["schedule"])
    expect(changedFields(before, { schedule: { scheduleType: "monthly", intervalDays: 30, season: null } })).toEqual(["schedule"])
    expect(changedFields(before, { schedule: cadenceValue(tpl().schedule) })).toEqual([])
  })
  it("never-chose (missing) and null reminder are the same value", () => {
    expect(sameValue("remindEnabled", undefined, null)).toBe(true)
    expect(sameValue("remindEnabled", false, null)).toBe(false)
  })
})

describe("sourceOf — the one reader rule", () => {
  it("missing provenance is unknown (every task from before this shipped)", () => {
    expect(sourceOf(tpl(), "priorityTier")).toBeNull()
    expect(sourceOf(tpl({ fieldSources: {} }), "careType")).toBeNull()
    expect(sourceOf(null, "careType")).toBeNull()
  })

  it("a stamp whose value still matches the field is trusted", () => {
    const t = tpl({ fieldSources: { priorityTier: stampFor("priorityTier", ME, "updateTaskSchedule", "recommended", AT) } })
    expect(sourceOf(t, "priorityTier")).toMatchObject({ by: "user", uid: "uid-a" })
  })

  it("a stamp a later writer didn't refresh is unknown, never a confident wrong answer", () => {
    // She chose Recommended; something that doesn't stamp (an ops script, an
    // older functions build) then wrote Essential.
    const t = tpl({
      priorityTier: "essential",
      fieldSources: { priorityTier: stampFor("priorityTier", ME, "updateTaskSchedule", "recommended", AT) },
    })
    expect(sourceOf(t, "priorityTier")).toBeNull()
  })

  it("compares a cadence stamp to the stored schedule, ignoring the anchor/window keys", () => {
    const stamp = stampFor("schedule", { by: "manual" }, "commitDraft", { scheduleType: "monthly", intervalDays: null, season: null }, AT)
    expect(sourceOf(tpl({ fieldSources: { schedule: stamp } }), "schedule")?.by).toBe("manual")
    const moved = tpl({ schedule: { scheduleType: "quarterly" }, fieldSources: { schedule: stamp } })
    expect(sourceOf(moved, "schedule")).toBeNull()
  })

  it("malformed stamps are unknown", () => {
    expect(sourceOf(tpl({ fieldSources: { careType: { by: "admin", value: "maintenance" } } }), "careType")).toBeNull()
    expect(sourceOf(tpl({ fieldSources: { careType: { by: "user", uid: null, value: "maintenance" } } }), "careType")).toBeNull()
    expect(sourceOf(tpl({ fieldSources: { careType: { by: "manual" } } }), "careType")).toBeNull()
    expect(sourceOf(tpl({ fieldSources: "nope" }), "careType")).toBeNull()
  })
})

describe("draftRowAsReviewed / pairReviewedWithDraft (the reviewed-draft commit)", () => {
  const draft = (over: Record<string, unknown> = {}) => ({
    title: "Clean the filter", description: null, tags: [], instructions_override: null,
    care_type: "maintenance", priority_tier: "recommended", schedule_type: "monthly", interval_days: null, ...over,
  })

  it("an untouched draft row comes back as the review sends it", () => {
    expect(draftRowAsReviewed(draft({ care_type: "mixed" })).care_type).toBe("maintenance")
    expect(draftRowAsReviewed(draft({ care_type: "cleaning" })).care_type).toBe("cleaning")
    expect(draftRowAsReviewed(draft()).remind_enabled).toBeNull()
    expect(draftRowAsReviewed(draft({ interval_days: 30 })).interval_days).toBeNull()
    expect(draftRowAsReviewed(draft({ schedule_type: "every_n_days", interval_days: 45 })).interval_days).toBe(45)
  })

  it("a first-use step is the manual's setup step (the review's own correction)", () => {
    const r = draftRowAsReviewed(draft({ title: "Purge Hot Water Lines Before First Use", schedule_type: "as_needed" }))
    expect(r.schedule_type).toBe("setup")
  })

  it("pairs by exact title, each draft row once; an unknown title has no suggestion", () => {
    const pairs = pairReviewedWithDraft(
      ["Clean the filter", "Clean the filter", "Something new"],
      [draft({ priority_tier: "essential" }), draft({ priority_tier: "optional" })],
    )
    expect(pairs.map((p) => p?.priority_tier ?? null)).toEqual(["essential", "optional", null])
  })
})
