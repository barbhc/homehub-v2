import { describe, it, expect } from "vitest"
import {
  DEFAULT_NOTIFICATION_PREFS,
  normalizeNotificationPrefs,
  taskNotifies,
  type PushMode,
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

describe("taskNotifies — the ONE decision every lane and preview imports", () => {
  // The switch: explicit On, explicit Off, never chose (null — and undefined,
  // which is how a missing field reads).
  const ON = true, OFF = false, NEVER = null
  type Why = "ordinary" | "deadline" | "lapsed safety"
  const why = (w: Why) => ({ isDeadline: w === "deadline", lapsedSafety: w === "lapsed safety" })
  const ask = (mode: PushMode, remindEnabled: boolean | null | undefined, priorityTier: string, w: Why) =>
    taskNotifies(mode, { remindEnabled, priorityTier, ...why(w) })

  // Every mode × switch × kind of message. Rows: [mode, switch, tier, kind, notifies?]
  const table: Array<[PushMode, boolean | null, string, Why, boolean]> = [
    // An explicit Off is silent everywhere — the owner's 2026-10-28 decision
    // ("Off wins, no exceptions"), INCLUDING deadlines and lapsed safety work.
    ...(["curated", "curated+essential", "all"] as const).flatMap((m) =>
      (["ordinary", "deadline", "lapsed safety"] as const).flatMap((w) =>
        (["essential", "recommended"] as const).map((tier) => [m, OFF, tier, w, false] as [PushMode, boolean | null, string, Why, boolean])
      )
    ),
    // An explicit On notifies everywhere.
    ...(["curated", "curated+essential", "all"] as const).flatMap((m) =>
      (["ordinary", "deadline", "lapsed safety"] as const).map((w) => [m, ON, "recommended", w, true] as [PushMode, boolean | null, string, Why, boolean])
    ),
    // Never chose, deadline or lapsed safety: "Just my list" means ONLY what was
    // switched On (owner, 2026-10-28 follow-up) — silent; the other two modes
    // notify, as before.
    ...(["deadline", "lapsed safety"] as const).flatMap((w) =>
      (["essential", "recommended"] as const).map((tier) => ["curated", NEVER, tier, w, false] as [PushMode, boolean | null, string, Why, boolean])
    ),
    ...(["curated+essential", "all"] as const).flatMap((m) =>
      (["deadline", "lapsed safety"] as const).flatMap((w) =>
        (["essential", "recommended"] as const).map((tier) => [m, NEVER, tier, w, true] as [PushMode, boolean | null, string, Why, boolean])
      )
    ),
    // Never chose, ordinary reminder: the mode decides.
    ["curated", NEVER, "essential", "ordinary", false],
    ["curated", NEVER, "recommended", "ordinary", false],
    ["curated+essential", NEVER, "essential", "ordinary", true],
    ["curated+essential", NEVER, "recommended", "ordinary", false],
    ["curated+essential", NEVER, "optional", "ordinary", false],
    ["all", NEVER, "essential", "ordinary", true],
    ["all", NEVER, "recommended", "ordinary", true],
    ["all", NEVER, "optional", "ordinary", true],
  ]

  it.each(table)("%s · switch %s · %s · %s → %s", (mode, sw, tier, w, expected) => {
    expect(ask(mode, sw, tier, w)).toBe(expected)
  })

  it("covers every mode × switch × kind of message", () => {
    const seen = new Set(table.map(([m, sw, , w]) => `${m}|${sw}|${w}`))
    expect(seen.size).toBe(3 * 3 * 3)
  })

  it("'Everything on a schedule' means everything you have NOT switched off", () => {
    // This used to be `if (mode === "all") return true` before the switch was
    // read, and this test pinned it as "deliberate: 'all' means all". The owner
    // decided the opposite on 2026-10-28 — an explicit Off is silent in every
    // mode — so the pin is inverted, not deleted: re-adding the short-circuit
    // must fail here.
    expect(ask("all", OFF, "essential", "ordinary")).toBe(false)
    expect(ask("all", NEVER, "recommended", "ordinary")).toBe(true)
  })

  it("'Just my list' is ONLY what was switched On — not a never-chose deadline or lapsed safety check", () => {
    expect(ask("curated", NEVER, "essential", "deadline")).toBe(false)
    expect(ask("curated", NEVER, "essential", "lapsed safety")).toBe(false)
    expect(ask("curated", ON, "optional", "deadline")).toBe(true)
  })

  it("a missing switch (undefined) reads as never chose, not as Off", () => {
    expect(ask("curated+essential", undefined, "essential", "ordinary")).toBe(true)
    expect(ask("curated+essential", undefined, "recommended", "deadline")).toBe(true)
    expect(ask("curated", undefined, "essential", "ordinary")).toBe(false)
    expect(ask("all", undefined, "optional", "ordinary")).toBe(true)
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
