import { describe, it, expect } from "vitest"
import {
  normalizeNotificationPrefs,
  isWithinQuietHours,
  DEFAULT_NOTIFICATION_PREFS,
  MAX_LEAD_TIME_DAYS,
} from "./notificationPreferences"

describe("normalizeNotificationPrefs", () => {
  it("returns defaults for empty/missing input", () => {
    expect(normalizeNotificationPrefs(null)).toEqual(DEFAULT_NOTIFICATION_PREFS)
    expect(normalizeNotificationPrefs(undefined)).toEqual(DEFAULT_NOTIFICATION_PREFS)
    expect(normalizeNotificationPrefs({})).toEqual(DEFAULT_NOTIFICATION_PREFS)
  })

  it("always forces safety_recalls on, even if stored false", () => {
    const p = normalizeNotificationPrefs({ events: { safety_recalls: { push: false } } })
    expect(p.events.safety_recalls.push).toBe(true)
  })

  it("preserves explicit task_reminders / warranty_expiring choices", () => {
    const p = normalizeNotificationPrefs({
      events: { task_reminders: { push: false }, warranty_expiring: { push: false } },
    })
    expect(p.events.task_reminders.push).toBe(false)
    expect(p.events.warranty_expiring.push).toBe(false)
  })

  it("clamps and rounds lead time to [0, MAX]", () => {
    expect(normalizeNotificationPrefs({ lead_time_days: -5 }).lead_time_days).toBe(0)
    expect(normalizeNotificationPrefs({ lead_time_days: 999 }).lead_time_days).toBe(MAX_LEAD_TIME_DAYS)
    expect(normalizeNotificationPrefs({ lead_time_days: 3.6 }).lead_time_days).toBe(4)
  })

  it("rejects malformed quiet hours and keeps valid ones (defaulting tz)", () => {
    expect(normalizeNotificationPrefs({ quiet_hours: { start: "9am", end: "5pm" } }).quiet_hours).toBeNull()
    expect(
      normalizeNotificationPrefs({ quiet_hours: { start: "22:00", end: "07:00" } }).quiet_hours
    ).toEqual({ start: "22:00", end: "07:00", tz: "UTC" })
    expect(
      normalizeNotificationPrefs({ quiet_hours: { start: "22:00", end: "07:00", tz: "America/Los_Angeles" } })
        .quiet_hours
    ).toEqual({ start: "22:00", end: "07:00", tz: "America/Los_Angeles" })
  })
})

describe("isWithinQuietHours", () => {
  const day = { start: "09:00", end: "17:00", tz: "UTC" }
  const overnight = { start: "22:00", end: "07:00", tz: "UTC" }

  it("returns false when no window set", () => {
    expect(isWithinQuietHours("12:00", null)).toBe(false)
  })

  it("handles a same-day window (inclusive start, exclusive end)", () => {
    expect(isWithinQuietHours("08:59", day)).toBe(false)
    expect(isWithinQuietHours("09:00", day)).toBe(true)
    expect(isWithinQuietHours("12:00", day)).toBe(true)
    expect(isWithinQuietHours("17:00", day)).toBe(false)
  })

  it("handles an overnight window", () => {
    expect(isWithinQuietHours("23:30", overnight)).toBe(true)
    expect(isWithinQuietHours("03:00", overnight)).toBe(true)
    expect(isWithinQuietHours("07:00", overnight)).toBe(false)
    expect(isWithinQuietHours("12:00", overnight)).toBe(false)
  })

  it("treats a zero-length window as off", () => {
    expect(isWithinQuietHours("09:00", { start: "09:00", end: "09:00", tz: "UTC" })).toBe(false)
  })
})
