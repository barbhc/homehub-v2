/**
 * "What is it?" ↔ where the row lands.
 *
 * Written from a real failure: reviewing an LG dryer, TEN of 18 tasks were
 * one-time install steps ("Connect Gas Supply", "Level the Dryer", "Reverse the
 * Door"). The chooser offered Maintenance / Cleaning / Tip, none of which says
 * "setup", so the reasonable pick was Tip — the single choice that stops it
 * being a task and rewrites it as a manual note. Leaving it on Maintenance was
 * already correct; the screen never said so.
 */
import { describe, it, expect } from "vitest"
import { reviewBucketFor, isScheduledTask, type ReviewTaskLike } from "../../shared/tasks/reviewBuckets"

/** Mirrors TaskReviewSheet: what the row becomes for bucketing. */
const taskLike = (kind: "maintenance" | "cleaning" | "usage", schedule: string, over: Partial<ReviewTaskLike> = {}): ReviewTaskLike => ({
  care_type: kind === "usage" ? "operating" : kind,
  priority_tier: "essential",
  schedule_type: schedule,
  keep_as_task: kind !== "usage",
  ...over,
})
/** Mirrors `displayKind` — which tile lights up. */
const displayKind = (kind: string, schedule: string) =>
  kind === "usage" ? "usage" : schedule === "setup" ? "setup" : kind

const REAL_SETUP_TASKS = [
  "Connect the Inlet Hose (Steam Models)",
  "Connect electrical supply (Electric Dryers)",
  "Install side vent kit (Optional)",
  "Reverse the Dryer Door Before Stacking",
  "Level the Dryer",
  "Connect Gas Supply",
  "Verify Dryer Is Level After Final Placement",
  "Run the Installation Test (Duct Check)",
  "Reverse the Door",
  "Connect Electric Power Cord",
]

describe("a one-time setup step has a correct answer", () => {
  it("every real dryer setup task shows the Setup tile, not Maintenance", () => {
    for (const title of REAL_SETUP_TASKS) {
      expect(displayKind("maintenance", "setup"), title).toBe("setup")
    }
  })

  it("and lands in First-time setup, whatever its priority", () => {
    for (const tier of ["essential", "recommended", "optional"]) {
      expect(reviewBucketFor(taskLike("maintenance", "setup", { priority_tier: tier }))).toBe("setup")
    }
  })

  it("safety and pro setup work still lands in setup — you do it once, at install", () => {
    // "Connect Gas Supply" is SAFETY + PRO. It must not be promoted onto a
    // recurring schedule just because it is dangerous.
    expect(reviewBucketFor(taskLike("maintenance", "setup", { risk_level: "safety", actor: "pro" }))).toBe("setup")
  })

  it("REGRESSION: filing a setup step as a Tip is what removed it from the checklist", () => {
    // Still true — this is the destructive path the UI now warns about, not a
    // bug in bucketing. The fix is that "setup" is now selectable and the
    // destination is shown, so nobody reaches here by accident.
    expect(reviewBucketFor(taskLike("usage", "setup"))).toBe("usage")
    expect(displayKind("usage", "setup")).toBe("usage")
  })

  it("choosing Setup keeps it a task; only Tip stops it being one", () => {
    expect(taskLike("maintenance", "setup").keep_as_task).toBe(true)
    expect(taskLike("usage", "setup").keep_as_task).toBe(false)
  })

  it("leaving Setup for Maintenance still needs a cadence to be scheduled", () => {
    // Guards the setKind branch that assigns monthly when moving off setup.
    // Round 18: both land in Maintenance — the difference is no longer WHICH
    // section, it is whether the row can be scheduled at all, which is what the
    // cadence chip and the bell now say on the row itself.
    expect(reviewBucketFor(taskLike("maintenance", "as_needed"))).toBe("maintenance")
    expect(isScheduledTask(taskLike("maintenance", "as_needed"))).toBe(false)
    expect(reviewBucketFor(taskLike("maintenance", "monthly"))).toBe("maintenance")
    expect(isScheduledTask(taskLike("maintenance", "monthly"))).toBe(true)
  })
})
