/**
 * The review, the task page and the server must agree about the same task.
 *
 * Three code paths decide whether a task notifies you, and until now nothing
 * checked they gave the same answer:
 *
 *   the review screen   willNotify(task)                    re-derives the bucket
 *   the task page       remindsByDefault(detail.tier)       reads the tier
 *   the server          remindsWhenDue(tier, remindEnabled) sends the push
 *
 * They agreed only because `remindsByDefault` took a ReviewBucket and compared
 * it to the string "essential", and three tier names happen to match three of
 * the six bucket names. Renaming the buckets — which grouping the review by kind
 * requires — would have made the review answer "no" for every task while the
 * task page and the server carried on saying yes and sending the notification.
 *
 * A screen that says nothing will notify you while your phone buzzes is the
 * worst version of this bug, and no test of any ONE screen catches it, because
 * each screen is individually correct. This file is the check that does: it
 * asks all three the same question about the same task and fails if they differ.
 *
 * If you are renaming buckets and this file goes red, the bug is real — do not
 * relax the assertion.
 */
import { describe, it, expect } from "vitest"
import {
  willNotify, remindsWhenDue, remindsByDefault, asTier, isScheduledTask,
  type ReviewTaskLike,
} from "../../shared/tasks/reviewBuckets"

type Tier = "essential" | "recommended" | "optional"
type Sched = "monthly" | "annual" | "as_needed" | "setup" | "after_each_use"

const task = (
  priority_tier: Tier,
  schedule_type: Sched,
  care_type: "maintenance" | "cleaning" | "operating" = "maintenance",
  remind_enabled: boolean | null = null,
): ReviewTaskLike => ({
  priority_tier, schedule_type, care_type, remind_enabled,
  keep_as_task: care_type !== "operating", risk_level: "performance", actor: "diy",
})

const TIERS: Tier[] = ["essential", "recommended", "optional"]
const SCHEDULES: Sched[] = ["monthly", "annual", "as_needed", "setup", "after_each_use"]
const CHOICES: (boolean | null)[] = [null, true, false]

describe("all three notification paths agree", () => {
  it("gives the same answer for every tier × schedule × explicit choice", () => {
    const disagreements: string[] = []
    for (const tier of TIERS) {
      for (const schedule of SCHEDULES) {
        for (const choice of CHOICES) {
          const t = task(tier, schedule, "maintenance", choice)
          const scheduled = isScheduledTask(t)

          const review = willNotify(t)
          // The task page reads a SAVED template: it already has a due instance,
          // so scheduling is settled and only the tier default is in question.
          const taskPage = t.remind_enabled ?? remindsByDefault(asTier(tier))
          // The server asks the same question at send time.
          const server = remindsWhenDue(tier, t.remind_enabled)

          // The review additionally answers "could this ever notify?", which is
          // false with no cadence to fire on. Compare the three only where a
          // due date exists — that is the state the other two are ever asked in.
          if (!scheduled) {
            expect(review, `${tier}/${schedule}: unscheduled must never notify`).toBe(false)
            continue
          }
          if (!(review === taskPage && taskPage === server)) {
            disagreements.push(
              `${tier} / ${schedule} / choice=${String(choice)} → review=${review} taskPage=${taskPage} server=${server}`,
            )
          }
        }
      }
    }
    expect(disagreements, disagreements.join("\n")).toEqual([])
  })
})

describe("the default itself", () => {
  it("is Essential-only — the owner's decision, 27 Aug 2026", () => {
    expect(remindsByDefault("essential")).toBe(true)
    expect(remindsByDefault("recommended")).toBe(false)
    expect(remindsByDefault("optional")).toBe(false)
  })

  it("takes a TIER — and the COMPILER is what enforces that", () => {
    // Read this one carefully, because the runtime half is the weaker half.
    //
    // A runtime test cannot catch a caller passing a bucket today: for a
    // scheduled row `reviewBucketFor` RETURNS the tier, so the two are the same
    // string and the bug is invisible until the buckets are renamed. I wrote
    // that test first, reintroduced the bug, and it passed — which is how this
    // ended up typed instead.
    //
    // `remindsByDefault` takes `PriorityTierName`. `ReviewBucket` also contains
    // "setup" | "whenNeeded" | "tip", so it is NOT assignable, and any caller
    // reaching for a bucket fails `tsc -b`. These casts are deliberate: they are
    // the only way to ask the question at runtime at all.
    for (const bucket of ["maintenance", "cleaning", "usage", "setup", "whenNeeded", "tip"]) {
      expect(remindsByDefault(bucket as never), `${bucket} is not a tier`).toBe(false)
    }
    expect(remindsByDefault("essential")).toBe(true)
  })

  it("narrows an unknown stored tier to Recommended, which never notifies", () => {
    expect(asTier(null)).toBe("recommended")
    expect(asTier("nonsense")).toBe("recommended")
    expect(asTier("essential")).toBe("essential")
    expect(remindsByDefault(asTier(undefined))).toBe(false)
  })

  it("never promises a notification for work with no due date", () => {
    for (const tier of TIERS) {
      expect(willNotify(task(tier, "as_needed"))).toBe(false)
      expect(willNotify(task(tier, "setup"))).toBe(false)
      // Even an explicit yes cannot be honoured without a date to fire on.
      expect(willNotify(task(tier, "as_needed", "maintenance", true))).toBe(false)
    }
  })

  it("honours an explicit choice in both directions on a scheduled task", () => {
    expect(willNotify(task("optional", "monthly", "maintenance", true))).toBe(true)
    expect(willNotify(task("essential", "monthly", "maintenance", false))).toBe(false)
    expect(remindsWhenDue("optional", true)).toBe(true)
    expect(remindsWhenDue("essential", false)).toBe(false)
  })
})
