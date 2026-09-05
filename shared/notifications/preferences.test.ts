import { describe, it, expect } from "vitest"
import {
  DEFAULT_NOTIFICATION_PREFS,
  normalizeNotificationPrefs,
  notifiesInMode,
  isWithinQuietHours,
} from "./preferences"

describe("normalizeNotificationPrefs — round 19 keys", () => {
  it("fills a pre-mode legacy blob with defaults that reproduce old behavior", () => {
    // A blob written before push_mode / weekly_digest / buy_ahead existed.
    const legacy = {
      events: { task_reminders: { push: false }, warranty_expiring: { push: true }, safety_recalls: { push: false } },
      quiet_hours: { start: "22:00", end: "07:00", tz: "America/Los_Angeles" },
      lead_time_days: 3,
    }
    const p = normalizeNotificationPrefs(legacy)
    expect(p.push_mode).toBe("curated+essential") // today's remindsWhenDue behavior
    expect(p.weekly_digest).toEqual({ enabled: true, day: 0, hour: 17 })
    expect(p.events.buy_ahead.push).toBe(true)
    // and the legacy fields survive untouched
    expect(p.events.task_reminders.push).toBe(false)
    expect(p.quiet_hours?.start).toBe("22:00")
    expect(p.lead_time_days).toBe(3)
  })

  it("safety_recalls stays locked on whatever the blob says", () => {
    const p = normalizeNotificationPrefs({ events: { safety_recalls: { push: false } } })
    expect(p.events.safety_recalls.push).toBe(true)
  })

  it("clamps digest day and hour to real values", () => {
    const p = normalizeNotificationPrefs({ weekly_digest: { enabled: false, day: 9, hour: 26 } })
    expect(p.weekly_digest.enabled).toBe(false)
    expect(p.weekly_digest.day).toBe(0)
    expect(p.weekly_digest.hour).toBe(17)
    const q = normalizeNotificationPrefs({ weekly_digest: { day: 6, hour: 0 } })
    expect(q.weekly_digest.day).toBe(6)
    expect(q.weekly_digest.hour).toBe(0)
  })

  it("rejects an unknown push_mode back to the default", () => {
    expect(normalizeNotificationPrefs({ push_mode: "everything!!" }).push_mode).toBe("curated+essential")
    expect(normalizeNotificationPrefs({ push_mode: "curated" }).push_mode).toBe("curated")
    expect(normalizeNotificationPrefs({ push_mode: "all" }).push_mode).toBe("all")
  })

  it("empty input is exactly the defaults", () => {
    expect(normalizeNotificationPrefs(undefined)).toEqual(DEFAULT_NOTIFICATION_PREFS)
  })
})

describe("notifiesInMode — the one breadth predicate", () => {
  // rows: [remindEnabled, tier]
  const explicitOn = [true, "recommended"] as const
  const explicitOff = [false, "essential"] as const
  const neverChoseEssential = [null, "essential"] as const
  const neverChoseRecommended = [null, "recommended"] as const

  it("curated: only an explicit yes notifies", () => {
    expect(notifiesInMode("curated", ...explicitOn)).toBe(true)
    expect(notifiesInMode("curated", ...explicitOff)).toBe(false)
    expect(notifiesInMode("curated", ...neverChoseEssential)).toBe(false)
    expect(notifiesInMode("curated", ...neverChoseRecommended)).toBe(false)
  })

  it("curated+essential: today's remindsWhenDue — explicit choice wins, else Essential-only", () => {
    expect(notifiesInMode("curated+essential", ...explicitOn)).toBe(true)
    expect(notifiesInMode("curated+essential", ...explicitOff)).toBe(false) // explicit no beats tier
    expect(notifiesInMode("curated+essential", ...neverChoseEssential)).toBe(true)
    expect(notifiesInMode("curated+essential", ...neverChoseRecommended)).toBe(false)
  })

  it("all: everything notifies, even an explicit off is overridden by the mode", () => {
    expect(notifiesInMode("all", ...explicitOn)).toBe(true)
    expect(notifiesInMode("all", ...neverChoseRecommended)).toBe(true)
    // Deliberate: "all" means all — a user who wants exceptions uses curated modes.
    expect(notifiesInMode("all", ...explicitOff)).toBe(true)
  })
})

describe("isWithinQuietHours (unchanged behavior, now shared)", () => {
  const quiet = { start: "22:00", end: "07:00", tz: "UTC" }
  it("wraps midnight", () => {
    expect(isWithinQuietHours("23:30", quiet)).toBe(true)
    expect(isWithinQuietHours("06:59", quiet)).toBe(true)
    expect(isWithinQuietHours("07:00", quiet)).toBe(false)
    expect(isWithinQuietHours("12:00", quiet)).toBe(false)
  })
})
