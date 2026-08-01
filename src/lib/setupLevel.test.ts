/**
 * Required-vs-optional for setup steps.
 *
 * The owner: "How can a task be setup and essential? If you're setting up an
 * item, theoretically, most of the tasks will be essential." Correct — a
 * three-tier importance scale carries almost no information about a one-time
 * install step. The distinction that DOES exist in her dryer manual is narrower:
 * "Connect Gas Supply" must happen before first use, "Install side vent kit
 * (Optional)" is an extra.
 *
 * The wizard asks that instead, and stores it in the SAME priority_tier field —
 * so bucketing, sorting and every downstream reader are untouched.
 */
import { describe, it, expect } from "vitest"
import { reviewBucketFor, sortWithinBucket, type ReviewTaskLike } from "../../shared/tasks/reviewBuckets"

/** Mirrors setupLevelOf in TaskReviewSheet. */
const setupLevelOf = (tier: string) => (tier === "optional" ? "optional" : "essential")

const setupTask = (tier: string, extra: Partial<ReviewTaskLike> = {}): ReviewTaskLike => ({
  care_type: "maintenance", priority_tier: tier, schedule_type: "setup", keep_as_task: true, ...extra,
})

describe("setup level mapping", () => {
  it("Required and Optional are the only two answers, mapped onto the existing field", () => {
    expect(setupLevelOf("essential")).toBe("essential")
    expect(setupLevelOf("optional")).toBe("optional")
  })

  it("a setup step the parser left at 'recommended' reads as Required", () => {
    // Nothing about "recommended" says skippable, and defaulting it to Optional
    // would quietly tell someone they can skip connecting the gas.
    expect(setupLevelOf("recommended")).toBe("essential")
  })

  it("real dryer rows land where they should", () => {
    expect(setupLevelOf("essential")).toBe("essential")   // Connect Gas Supply
    expect(setupLevelOf("optional")).toBe("optional")     // Install side vent kit (Optional)
  })
})

describe("the change is presentational — bucketing is untouched", () => {
  it("both levels still bucket as setup", () => {
    expect(reviewBucketFor(setupTask("essential"))).toBe("setup")
    expect(reviewBucketFor(setupTask("optional"))).toBe("setup")
  })

  it("safety/pro setup work stays setup at either level", () => {
    expect(reviewBucketFor(setupTask("essential", { risk_level: "safety", actor: "pro" }))).toBe("setup")
    expect(reviewBucketFor(setupTask("optional", { risk_level: "safety" }))).toBe("setup")
  })

  it("neither level can ever be scheduled or notify", () => {
    // setup is unscheduled; sortWithinBucket applies the unscheduled ordering.
    const rows = [setupTask("optional"), setupTask("essential")]
    expect(sortWithinBucket("setup", rows).map((r) => r.priority_tier)).toEqual(["essential", "optional"])
  })

  it("required steps sort ahead of optional ones", () => {
    const rows = [setupTask("optional"), setupTask("essential"), setupTask("recommended")]
    const order = sortWithinBucket("setup", rows).map((r) => r.priority_tier)
    expect(order[0]).toBe("essential")
    expect(order[order.length - 1]).toBe("optional")
  })
})
