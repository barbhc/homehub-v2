import { describe, it, expect } from "vitest"
import { reminderSwitch } from "./reminderSwitch"
import { taskNotifies, type PushMode } from "./notificationPreferences"

const MODES: PushMode[] = ["curated", "curated+essential", "all"]
const SWITCH = [true, false, null] as const
const TIERS = ["essential", "recommended", "optional"] as const

describe("reminderSwitch — the task page's switch says what the phone will do", () => {
  it("is ON exactly when the morning push would remind, for every style × switch × tier × deadline", () => {
    for (const mode of MODES)
      for (const remindEnabled of SWITCH)
        for (const priorityTier of TIERS)
          for (const isDeadline of [false, true]) {
            const t = { remindEnabled, priorityTier, isDeadline }
            expect(reminderSwitch(mode, t).on, `${mode}/${remindEnabled}/${priorityTier}/${isDeadline}`).toBe(taskNotifies(mode, t))
          }
  })

  it("Off is off in every style — including Everything on a schedule and deadlines (owner, 2026-10-28)", () => {
    for (const mode of MODES) {
      for (const isDeadline of [false, true]) {
        expect(reminderSwitch(mode, { remindEnabled: false, priorityTier: "essential", isDeadline })).toEqual({ on: false, line: "You turned this off" })
      }
    }
  })

  it("never chose: the line names why, per style", () => {
    const never = (mode: PushMode, priorityTier: string, isDeadline = false) => reminderSwitch(mode, { remindEnabled: null, priorityTier, isDeadline })
    expect(never("curated+essential", "essential")).toEqual({ on: true, line: "On by default for Essential — you can turn it off" })
    expect(never("curated+essential", "recommended")).toEqual({ on: false, line: "Off by default — turn it on if you want one" })
    // The owner's own style: an Essential no longer claims a reminder Just my list never sends.
    expect(never("curated", "essential")).toEqual({ on: false, line: "Off — Just my list reminds only what you turn on" })
    expect(never("all", "optional")).toEqual({ on: true, line: "On — Everything on a schedule includes it" })
    expect(never("curated", "recommended", true)).toEqual({ on: true, line: "On by default for deadlines — you can turn it off" })
  })

  it("an explicit On says so in every style", () => {
    for (const mode of MODES) expect(reminderSwitch(mode, { remindEnabled: true, priorityTier: "optional", isDeadline: false })).toEqual({ on: true, line: "You turned this on" })
  })
})
