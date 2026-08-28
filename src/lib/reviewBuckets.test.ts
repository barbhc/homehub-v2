/**
 * Review bucketing — the corpus is the owner's REAL task titles (audited
 * 2026-07-31), because that audit is what proved priority alone couldn't sort
 * them: 52 tasks were marked Essential, including "Remove Protective Shipping
 * Film" and "Connect Gas Supply".
 */
import { describe, it, expect } from "vitest"
import {
  reviewBucketFor,
  isScheduledTask,
  willNotify,
  remindsWhenDue,
  sortWithinBucket,
  summarize,
  isSafetyCritical,
  type ReviewTaskLike,
} from "../../shared/tasks/reviewBuckets"

const t = (o: Partial<ReviewTaskLike>): ReviewTaskLike => ({
  care_type: "maintenance", priority_tier: "recommended", schedule_type: "monthly", ...o,
})

describe("reviewBucketFor — the KIND decides the section (round 18)", () => {
  it("one-time install steps are setup even when marked essential", () => {
    // All real titles from the owner's home, all stored as essential.
    for (const title of ["Connect Gas Supply", "Verify Proper Grounding", "Remove Protective Shipping Film"]) {
      expect(reviewBucketFor(t({ schedule_type: "setup", priority_tier: "essential" })), title).toBe("setup")
    }
  })

  it("condition-triggered maintenance is Maintenance, and says 'when needed'", () => {
    // Nespresso descaling: essential + prevent_damage, but the manual ties it to
    // the alert light, so a monthly reminder would be a lie. Under tier grouping
    // it was exiled to a "When needed" section below three others; now it leads,
    // because it is maintenance — and it still cannot be scheduled.
    const nespresso = t({ schedule_type: "as_needed", priority_tier: "essential" })
    expect(reviewBucketFor(nespresso)).toBe("maintenance")
    expect(isScheduledTask(nespresso)).toBe(false)
  })

  it("per-use habits are Usage — you do them at the machine", () => {
    expect(reviewBucketFor(t({ schedule_type: "after_each_use", priority_tier: "essential" }))).toBe("usage")
  })

  it("operating steps are Usage regardless of cadence", () => {
    expect(reviewBucketFor(t({ care_type: "operating", schedule_type: "monthly" }))).toBe("usage")
  })

  it("SAFETY work is never filed as Usage, whatever cadence the manual gave it", () => {
    // "Furnace Combustion Cycle Testing" arrived as after_each_use and was once
    // silently filed as a tip on a gas furnace. It now lands in Maintenance —
    // more visible than the old "When needed", never less.
    const combustion = t({ schedule_type: "after_each_use", risk_level: "safety" })
    expect(reviewBucketFor(combustion)).toBe("maintenance")
    expect(reviewBucketFor(t({ schedule_type: "after_each_use", actor: "pro" }))).toBe("maintenance")
    expect(reviewBucketFor(t({ care_type: "operating", actor: "hazardous" }))).toBe("maintenance")
  })

  it("cleaning is Cleaning whether or not it repeats", () => {
    expect(reviewBucketFor(t({ care_type: "cleaning", schedule_type: "weekly" }))).toBe("cleaning")
    expect(reviewBucketFor(t({ care_type: "cleaning", schedule_type: "as_needed" }))).toBe("cleaning")
  })

  it("priority no longer decides the section at all", () => {
    // The heart of round 18: three tiers, one section.
    for (const tier of ["essential", "recommended", "optional", null, "bogus"]) {
      expect(reviewBucketFor(t({ schedule_type: "monthly", priority_tier: tier })), String(tier)).toBe("maintenance")
    }
  })

  it("the user's keep-as-task override beats the Usage rules", () => {
    expect(reviewBucketFor(t({ care_type: "operating", schedule_type: "monthly", keep_as_task: true, priority_tier: "essential" }))).toBe("maintenance")
    // ...but a per-use override still can't be scheduled — it has no cadence.
    const perUse = t({ schedule_type: "after_each_use", keep_as_task: true })
    expect(reviewBucketFor(perUse)).toBe("maintenance")
    expect(isScheduledTask(perUse)).toBe(false)
  })
})

describe("willNotify — the promise the UI makes", () => {
  it("defaults: scheduled essentials remind, nothing else does", () => {
    expect(willNotify(t({ schedule_type: "monthly", priority_tier: "essential" }))).toBe(true)
    expect(willNotify(t({ schedule_type: "monthly", priority_tier: "recommended" }))).toBe(false)
    expect(willNotify(t({ schedule_type: "as_needed", priority_tier: "essential" }))).toBe(false)
    expect(willNotify(t({ schedule_type: "setup", priority_tier: "essential" }))).toBe(false)
    expect(willNotify(t({ schedule_type: "after_each_use", priority_tier: "essential" }))).toBe(false)
  })

  it("a Recommended task can be given a reminder without inflating its priority", () => {
    // The owner's case: they want to be reminded to descale, but descaling is not
    // safety work and calling it Essential would corrupt every tier-based sort.
    const descale = t({ schedule_type: "quarterly", priority_tier: "recommended", remind_enabled: true })
    expect(willNotify(descale)).toBe(true)
    // Round 18: it sits in Maintenance and keeps its Recommended tier — which is
    // the point. The tier is a property of the row, not the section it lives in.
    expect(reviewBucketFor(descale)).toBe("maintenance")
    expect(descale.priority_tier).toBe("recommended")
    expect(willNotify(t({ schedule_type: "annual", priority_tier: "optional", remind_enabled: true }))).toBe(true)
  })

  it("an Essential reminder can be switched off — the default is reversible", () => {
    expect(willNotify(t({ schedule_type: "monthly", priority_tier: "essential", remind_enabled: false }))).toBe(false)
  })

  it("null means 'never chose', so the default still applies", () => {
    expect(willNotify(t({ schedule_type: "monthly", priority_tier: "essential", remind_enabled: null }))).toBe(true)
    expect(willNotify(t({ schedule_type: "monthly", priority_tier: "recommended", remind_enabled: null }))).toBe(false)
  })

  it("an unscheduled task NEVER reminds, flag or not — there is no due date to fire on", () => {
    for (const schedule_type of ["setup", "as_needed", "after_each_use"]) {
      expect(willNotify(t({ schedule_type, priority_tier: "essential", remind_enabled: true })), schedule_type).toBe(false)
    }
    // Including the safety escape hatch, which is visible but still unscheduled.
    expect(willNotify(t({ schedule_type: "after_each_use", risk_level: "safety", remind_enabled: true }))).toBe(false)
  })
})

describe("isScheduled", () => {
  it("scheduling is a property of the TASK now, not of its section", () => {
    // The section can no longer answer this: a Cleaning row may be weekly or
    // when-needed, and both are Cleaning.
    expect(isScheduledTask(t({ care_type: "cleaning", schedule_type: "weekly" }))).toBe(true)
    expect(isScheduledTask(t({ care_type: "cleaning", schedule_type: "as_needed" }))).toBe(false)
    expect(isScheduledTask(t({ schedule_type: "monthly" }))).toBe(true)
    expect(isScheduledTask(t({ schedule_type: "setup" }))).toBe(false)
    expect(isScheduledTask(t({ schedule_type: "after_each_use" }))).toBe(false)
    expect(isScheduledTask(t({ care_type: "operating", schedule_type: "monthly" }))).toBe(false)
  })
})

describe("sortWithinBucket", () => {
  it("dated rows lead, then the most important", () => {
    // Every section now mixes both, so the old "only sort unscheduled sections"
    // rule had nothing left to key on.
    const rows = [
      t({ schedule_type: "as_needed", priority_tier: "essential" }),
      t({ schedule_type: "monthly", priority_tier: "optional" }),
      t({ schedule_type: "monthly", priority_tier: "essential" }),
    ]
    expect(sortWithinBucket("maintenance", rows).map((r) => [r.schedule_type, r.priority_tier])).toEqual([
      ["monthly", "essential"],
      ["monthly", "optional"],
      ["as_needed", "essential"],
    ])
  })
  it("within one half, importance decides", () => {
    const rows = [t({ priority_tier: "optional" }), t({ priority_tier: "essential" }), t({ priority_tier: "recommended" })]
    expect(sortWithinBucket("maintenance", rows).map((r) => r.priority_tier)).toEqual(["essential", "recommended", "optional"])
  })
  it("does not mutate the input", () => {
    const rows = [t({ priority_tier: "optional" }), t({ priority_tier: "essential" })]
    const before = rows.map((r) => r.priority_tier)
    sortWithinBucket("setup", rows)
    expect(rows.map((r) => r.priority_tier)).toEqual(before)
  })
})

describe("summarize — drives the lead-in and the primary button", () => {
  it("splits scheduled / unscheduled / tips", () => {
    const rows = [
      t({ schedule_type: "monthly", priority_tier: "essential" }),
      t({ schedule_type: "monthly", priority_tier: "recommended" }),
      t({ schedule_type: "setup" }),
      t({ schedule_type: "as_needed" }),
      t({ schedule_type: "after_each_use" }),
      t({ care_type: "operating" }),
    ]
    // `notifying` is round 18's second fact: what will actually reach the phone,
    // stated separately from what merely shows up in Tasks.
    expect(summarize(rows)).toEqual({ scheduled: 2, unscheduled: 2, tips: 2, notifying: 1, total: 6 })
  })

  it("reproduces the shape of the owner's Nespresso parse", () => {
    // 1 weekly + 1 setup + 4 as-needed + 2 operating tips
    const rows: ReviewTaskLike[] = [
      t({ schedule_type: "weekly" }),
      t({ schedule_type: "setup" }),
      ...Array.from({ length: 4 }, () => t({ schedule_type: "as_needed" })),
      ...Array.from({ length: 2 }, () => t({ care_type: "operating", schedule_type: "after_each_use" })),
    ]
    // Nothing notifies: the one weekly row is Recommended, and Essential is the
    // only default. Exactly the "3 show up in Tasks, none notify" case.
    expect(summarize(rows)).toEqual({ scheduled: 1, unscheduled: 5, tips: 2, notifying: 0, total: 8 })
  })
})

describe("safety work is never auto-demoted to a tip", () => {
  it("a per-use SAFETY task goes to Maintenance, never Usage", () => {
    // Real regression: "Furnace Combustion Cycle Testing" arrived as
    // after_each_use and was filed as a tip on a GAS FURNACE.
    expect(reviewBucketFor({ schedule_type: "after_each_use", risk_level: "safety" })).toBe("maintenance")
  })

  it("a per-use PRO/HAZARDOUS task goes to Maintenance, never Usage", () => {
    expect(reviewBucketFor({ schedule_type: "after_each_use", actor: "pro" })).toBe("maintenance")
    expect(reviewBucketFor({ schedule_type: "after_each_use", actor: "hazardous" })).toBe("maintenance")
  })

  it("ordinary per-use habits are Usage — the lint filter case still works", () => {
    expect(reviewBucketFor({ schedule_type: "after_each_use", actor: "diy", risk_level: "performance" })).toBe("usage")
  })

  it("safety work keeps its priority visible instead of vanishing", () => {
    const task = { schedule_type: "after_each_use", risk_level: "safety", priority_tier: "essential" }
    expect(reviewBucketFor(task)).toBe("maintenance")
    expect(isScheduledTask(task)).toBe(false) // no cadence to fire on — but it IS shown
  })

  it("isSafetyCritical identifies what must not be demoted", () => {
    expect(isSafetyCritical({ risk_level: "safety" })).toBe(true)
    expect(isSafetyCritical({ actor: "hazardous" })).toBe(true)
    expect(isSafetyCritical({ risk_level: "performance", actor: "diy" })).toBe(false)
  })
})

/**
 * The send-side rule. HH-102 found the push job filtering on due date and
 * agenda eligibility alone — it never read the reminder switch at all, so the
 * app promised "Off by default — turn it on if you want one" beside every
 * Recommended task and then pushed anyway.
 */
describe("remindsWhenDue — what the push job is allowed to send", () => {
  it("follows the tier when the owner never chose", () => {
    expect(remindsWhenDue("essential", null)).toBe(true)
    expect(remindsWhenDue("recommended", null)).toBe(false)
    expect(remindsWhenDue("optional", null)).toBe(false)
    expect(remindsWhenDue("essential", undefined)).toBe(true)
  })

  it("lets an explicit choice win in BOTH directions", () => {
    expect(remindsWhenDue("recommended", true)).toBe(true)
    expect(remindsWhenDue("essential", false)).toBe(false)
  })

  it("treats an unknown or missing tier as Recommended — quiet, never a surprise alert", () => {
    expect(remindsWhenDue(null, null)).toBe(false)
    expect(remindsWhenDue("urgent", null)).toBe(false)
  })

  it("does NOT re-bucket: a promoted per-use task still notifies", () => {
    // Templates do not store keepAsTask, so willNotify would call this a "tip"
    // and silence it — the exact reason the send side has its own rule.
    expect(remindsWhenDue("essential", true)).toBe(true)
  })
})
