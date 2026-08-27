import { describe, it, expect } from "vitest"
import { shouldAskForNotifications, notificationsBlocked, tasksWantingNotification } from "./notifyGate"
import type { PreviewTask } from "@/modules/knowledge/types/previewTypes"

const t = (o: Partial<PreviewTask>): PreviewTask => ({
  title: "x", description: null, care_type: "maintenance", priority_tier: "recommended",
  risk_level: "performance", estimated_minutes: 10, schedule_type: "monthly",
  interval_days: null, instructions_text: null, symptom_tags: [], re_check_triggers: [], ...o,
})

describe("which tasks want a notification", () => {
  it("is Essential-and-scheduled by default — the owner's 27 Aug decision", () => {
    const rows = [
      t({ title: "filter", priority_tier: "essential", schedule_type: "monthly" }),
      t({ title: "coils", priority_tier: "recommended", schedule_type: "monthly" }),
      t({ title: "descale", priority_tier: "essential", schedule_type: "as_needed" }),
      t({ title: "setup", priority_tier: "essential", schedule_type: "setup" }),
    ]
    expect(tasksWantingNotification(rows).map((r) => r.title)).toEqual(["filter"])
  })

  it("honours an explicit switch in both directions", () => {
    const on = t({ priority_tier: "optional", remind_enabled: true } as Partial<PreviewTask>)
    const off = t({ priority_tier: "essential", remind_enabled: false } as Partial<PreviewTask>)
    expect(tasksWantingNotification([on])).toHaveLength(1)
    expect(tasksWantingNotification([off])).toHaveLength(0)
  })

  it("her Sharp — eleven rows, none of them notify", () => {
    const sharp = [
      ...Array.from({ length: 3 }, (_, i) => t({ title: `clean ${i}`, care_type: "cleaning", priority_tier: "optional", schedule_type: "weekly" })),
      ...Array.from({ length: 3 }, (_, i) => t({ title: `asneeded ${i}`, care_type: "cleaning", schedule_type: "as_needed" })),
      ...Array.from({ length: 2 }, (_, i) => t({ title: `setup ${i}`, schedule_type: "setup" })),
      ...Array.from({ length: 3 }, (_, i) => t({ title: `use ${i}`, care_type: "cleaning", schedule_type: "after_each_use" })),
    ]
    expect(tasksWantingNotification(sharp)).toHaveLength(0)
  })
})

describe("when to spend the one prompt iOS gives us", () => {
  const base = { wanting: 2, supported: true, permission: "default" as const, alreadySubscribed: false }

  it("asks when something concrete wants to reach them", () => {
    expect(shouldAskForNotifications(base)).toBe(true)
  })

  it("never asks about nothing", () => {
    expect(shouldAskForNotifications({ ...base, wanting: 0 })).toBe(false)
  })

  it("never asks twice", () => {
    expect(shouldAskForNotifications({ ...base, alreadySubscribed: true })).toBe(false)
    expect(shouldAskForNotifications({ ...base, permission: "granted" })).toBe(false)
  })

  it("does not re-ask after a refusal — the OS will not re-prompt", () => {
    // A sheet offering to turn notifications on here would be a button that
    // cannot work.
    expect(shouldAskForNotifications({ ...base, permission: "denied" })).toBe(false)
  })

  it("does not ask where push cannot be delivered", () => {
    expect(shouldAskForNotifications({ ...base, supported: false })).toBe(false)
  })
})

describe("what the screen admits when it cannot ring the bell", () => {
  it("is blocked after a refusal, and where push is unsupported", () => {
    expect(notificationsBlocked({ permission: "denied", alreadySubscribed: false })).toBe(true)
    expect(notificationsBlocked({ permission: "unsupported", alreadySubscribed: false })).toBe(true)
  })

  it("is not blocked once subscribed, whatever the raw permission reads", () => {
    expect(notificationsBlocked({ permission: "denied", alreadySubscribed: true })).toBe(false)
  })

  it("is not blocked while the question is still open", () => {
    expect(notificationsBlocked({ permission: "default", alreadySubscribed: false })).toBe(false)
  })
})
