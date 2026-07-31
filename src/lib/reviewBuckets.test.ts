/**
 * Review bucketing — the corpus is the owner's REAL task titles (audited
 * 2026-07-31), because that audit is what proved priority alone couldn't sort
 * them: 52 tasks were marked Essential, including "Remove Protective Shipping
 * Film" and "Connect Gas Supply".
 */
import { describe, it, expect } from "vitest"
import {
  reviewBucketFor,
  isScheduled,
  willNotify,
  sortWithinBucket,
  summarize,
  isSafetyCritical,
  type ReviewTaskLike,
} from "../../shared/tasks/reviewBuckets"

const t = (o: Partial<ReviewTaskLike>): ReviewTaskLike => ({
  care_type: "maintenance", priority_tier: "recommended", schedule_type: "monthly", ...o,
})

describe("reviewBucketFor — schedule decides the section, not priority", () => {
  it("one-time install steps are setup even when marked essential", () => {
    // All real titles from the owner's home, all stored as essential.
    for (const title of ["Connect Gas Supply", "Verify Proper Grounding", "Remove Protective Shipping Film"]) {
      expect(reviewBucketFor(t({ schedule_type: "setup", priority_tier: "essential" })), title).toBe("setup")
    }
  })

  it("condition-triggered work is 'when needed', however important", () => {
    // Nespresso descaling: essential + prevent_damage, but the manual ties it to
    // the alert light, so a monthly reminder would be a lie.
    expect(reviewBucketFor(t({ schedule_type: "as_needed", priority_tier: "essential" }))).toBe("whenNeeded")
  })

  it("per-use habits are tips — you do them at the machine", () => {
    expect(reviewBucketFor(t({ schedule_type: "after_each_use", priority_tier: "essential" }))).toBe("tip")
  })

  it("operating steps are tips regardless of cadence", () => {
    expect(reviewBucketFor(t({ care_type: "operating", schedule_type: "monthly" }))).toBe("tip")
  })

  it("a genuinely recurring task lands on its priority", () => {
    expect(reviewBucketFor(t({ schedule_type: "monthly", priority_tier: "essential" }))).toBe("essential")
    expect(reviewBucketFor(t({ schedule_type: "every_n_days", priority_tier: "recommended" }))).toBe("recommended")
    expect(reviewBucketFor(t({ schedule_type: "seasonal", priority_tier: "optional" }))).toBe("optional")
  })

  it("unknown/missing priority falls back to recommended, never essential", () => {
    expect(reviewBucketFor(t({ priority_tier: null }))).toBe("recommended")
    expect(reviewBucketFor(t({ priority_tier: "bogus" }))).toBe("recommended")
  })

  it("the user's keep-as-task override beats the tip rules", () => {
    expect(reviewBucketFor(t({ care_type: "operating", schedule_type: "monthly", keep_as_task: true, priority_tier: "essential" }))).toBe("essential")
    // ...but a per-use override still can't be scheduled — it has no cadence.
    expect(reviewBucketFor(t({ schedule_type: "after_each_use", keep_as_task: true }))).toBe("whenNeeded")
  })
})

describe("willNotify — the promise the UI makes", () => {
  it("only scheduled essentials notify", () => {
    expect(willNotify(t({ schedule_type: "monthly", priority_tier: "essential" }))).toBe(true)
    expect(willNotify(t({ schedule_type: "monthly", priority_tier: "recommended" }))).toBe(false)
    expect(willNotify(t({ schedule_type: "as_needed", priority_tier: "essential" }))).toBe(false)
    expect(willNotify(t({ schedule_type: "setup", priority_tier: "essential" }))).toBe(false)
    expect(willNotify(t({ schedule_type: "after_each_use", priority_tier: "essential" }))).toBe(false)
  })
})

describe("isScheduled", () => {
  it("only the three priority buckets are scheduled", () => {
    expect(["essential", "recommended", "optional"].every(isScheduled as never)).toBe(true)
    expect(["setup", "whenNeeded", "tip"].some(isScheduled as never)).toBe(false)
  })
})

describe("sortWithinBucket", () => {
  it("unscheduled sections lead with the most important", () => {
    const rows = [t({ priority_tier: "optional" }), t({ priority_tier: "essential" }), t({ priority_tier: "recommended" })]
    expect(sortWithinBucket("whenNeeded", rows).map((r) => r.priority_tier)).toEqual(["essential", "recommended", "optional"])
  })
  it("scheduled sections keep their given order (they're already one priority)", () => {
    const rows = [t({ priority_tier: "essential" }), t({ priority_tier: "essential" })]
    expect(sortWithinBucket("essential", rows)).toEqual(rows)
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
    expect(summarize(rows)).toEqual({ scheduled: 2, unscheduled: 2, tips: 2, total: 6 })
  })

  it("reproduces the shape of the owner's Nespresso parse", () => {
    // 1 weekly + 1 setup + 4 as-needed + 2 operating tips
    const rows: ReviewTaskLike[] = [
      t({ schedule_type: "weekly" }),
      t({ schedule_type: "setup" }),
      ...Array.from({ length: 4 }, () => t({ schedule_type: "as_needed" })),
      ...Array.from({ length: 2 }, () => t({ care_type: "operating", schedule_type: "after_each_use" })),
    ]
    expect(summarize(rows)).toEqual({ scheduled: 1, unscheduled: 5, tips: 2, total: 8 })
  })
})

describe("safety work is never auto-demoted to a tip", () => {
  it("a per-use SAFETY task goes to 'when needed', not tips", () => {
    // Real regression: "Furnace Combustion Cycle Testing" arrived as
    // after_each_use and was filed as a tip on a GAS FURNACE.
    expect(reviewBucketFor({ schedule_type: "after_each_use", risk_level: "safety" })).toBe("whenNeeded")
  })

  it("a per-use PRO/HAZARDOUS task goes to 'when needed', not tips", () => {
    expect(reviewBucketFor({ schedule_type: "after_each_use", actor: "pro" })).toBe("whenNeeded")
    expect(reviewBucketFor({ schedule_type: "after_each_use", actor: "hazardous" })).toBe("whenNeeded")
  })

  it("ordinary per-use habits are still tips — the lint filter case still works", () => {
    expect(reviewBucketFor({ schedule_type: "after_each_use", actor: "diy", risk_level: "performance" })).toBe("tip")
  })

  it("safety work keeps its priority visible instead of vanishing", () => {
    const b = reviewBucketFor({ schedule_type: "after_each_use", risk_level: "safety", priority_tier: "essential" })
    expect(b).toBe("whenNeeded")
    expect(isScheduled(b)).toBe(false) // no cadence to fire on — but it IS shown
  })

  it("isSafetyCritical identifies what must not be demoted", () => {
    expect(isSafetyCritical({ risk_level: "safety" })).toBe(true)
    expect(isSafetyCritical({ actor: "hazardous" })).toBe(true)
    expect(isSafetyCritical({ risk_level: "performance", actor: "diy" })).toBe(false)
  })
})
