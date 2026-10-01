/**
 * shared/dates/calendar.ts — the one calendar module.
 *
 * The suite runs in America/Los_Angeles (vitest.config.ts pins `TZ`), where
 * from 17:00 PDT the UTC date is already tomorrow. A test at a fixed instant
 * only has teeth where the local and UTC answers differ, so each such case
 * also asserts what the replaced helper gave — and that it was wrong there.
 *
 * The server keeps its own copies until it imports this module (a follow-up:
 * firebase/functions is out of this change's reach). The parity blocks pin the
 * two to the same answers so that fold-in is a no-op.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { addDays, addMonths, calendarDateIn, diffDays, isCalendarDate, localDateString, localToday } from "./calendar"
import * as completedOn from "../../firebase/functions/src/tasks/completedOn"
import { addCadence } from "../../firebase/functions/src/schedule/cadence"

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] })
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs() // back to the config's Pacific
})

/** Every day from `from` for `count` days, as YYYY-MM-DD — built by hand, not by addDays. */
function days(from: string, count: number): string[] {
  const out: string[] = []
  for (let t = Date.parse(`${from}T00:00:00Z`), i = 0; i < count; i++, t += 86_400_000) {
    out.push(new Date(t).toISOString().slice(0, 10)) // UTC on purpose: a pure calendar walk
  }
  return out
}

describe("the zone this suite runs in", () => {
  it("is Pacific, from the config — not whatever the machine is set to", () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe("America/Los_Angeles")
    expect(new Date("2026-09-30T19:30:00-07:00").getHours()).toBe(19)
  })
})

describe("localToday — the device's day, never the UTC date", () => {
  it("at 19:30 PDT on Sep 30 it is Sep 30, though UTC is on Oct 1", () => {
    vi.setSystemTime(new Date("2026-09-30T19:30:00-07:00"))
    expect(new Date().toISOString().slice(0, 10)).toBe("2026-10-01") // what every todayStr() copy returned
    expect(localToday()).toBe("2026-09-30")
  })

  it("the day turns at LOCAL midnight: 23:59 is still Sep 30, 00:30 is Oct 1", () => {
    vi.setSystemTime(new Date("2026-09-30T23:59:59-07:00"))
    expect(localToday()).toBe("2026-09-30")
    vi.setSystemTime(new Date("2026-10-01T00:30:00-07:00"))
    expect(localToday()).toBe("2026-10-01")
  })

  it("given an IANA zone, answers for that zone", () => {
    vi.setSystemTime(new Date("2026-09-30T22:30:00-07:00")) // 01:30 on Oct 1 in New York
    expect(localToday()).toBe("2026-09-30")
    expect(localToday("America/New_York")).toBe("2026-10-01")
    expect(localToday("Pacific/Honolulu")).toBe("2026-09-30")
    expect(localToday("Asia/Tokyo")).toBe("2026-10-01")
  })

  it("reads the zone on every call, so a device that changes zone gets the new day", () => {
    vi.setSystemTime(new Date("2026-09-30T19:30:00-07:00"))
    expect(localToday()).toBe("2026-09-30")
    vi.stubEnv("TZ", "Asia/Tokyo") // 11:30 on Oct 1 there
    expect(localToday()).toBe("2026-10-01")
  })

  it("refuses a zone ICU doesn't know rather than guessing", () => {
    expect(() => localToday("Mars/Olympus_Mons")).toThrow(RangeError)
  })
})

describe("localDateString — an instant's day on this device", () => {
  it("reads local components, zero-padded", () => {
    expect(localDateString(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05")
    expect(localDateString(new Date("2026-10-01T02:30:00Z"))).toBe("2026-09-30") // 19:30 PDT
    expect(localDateString(new Date("2026-10-01T07:30:00Z"))).toBe("2026-10-01") // 00:30 PDT
  })
})

describe("calendarDateIn — #220's helper, one answer with completeTask's copy", () => {
  const ZONES = ["America/Los_Angeles", "America/New_York", "Pacific/Honolulu", "UTC", "Asia/Tokyo", "Pacific/Auckland", "Pacific/Kiritimati"]

  it.each([
    ["spring-forward", Date.UTC(2026, 2, 7)],
    ["fall-back", Date.UTC(2026, 9, 31)],
    ["Auckland's spring-forward", Date.UTC(2026, 8, 26)],
  ])("every zone, every hour across %s", (_label, start) => {
    for (const tz of ZONES) {
      for (let h = 0; h < 72; h++) {
        const instant = new Date(start + h * 3_600_000 + 30 * 60_000)
        expect(calendarDateIn(tz, instant), `${tz} @ ${instant.toISOString()}`).toBe(completedOn.calendarDateIn(tz, instant))
      }
    }
  })

  it("is what localToday(tz) answers", () => {
    vi.setSystemTime(new Date("2026-03-08T09:30:00Z")) // 01:30 PST, half an hour before the clocks jump
    for (const tz of ZONES) expect(localToday(tz)).toBe(calendarDateIn(tz, new Date()))
  })
})

describe("addDays — component arithmetic, safe across DST", () => {
  it("rolls months, years and leap days", () => {
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01")
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01")
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29")
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01")
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31")
    expect(addDays("2026-09-30", 0)).toBe("2026-09-30")
    expect(addDays("2026-01-10", 365)).toBe("2027-01-10")
  })

  it("spring-forward (Mar 8 2026, a 23-hour day in Pacific) doesn't lose a day", () => {
    expect(addDays("2026-03-07", 1)).toBe("2026-03-08")
    expect(addDays("2026-03-08", 1)).toBe("2026-03-09")
    expect(addDays("2026-03-05", 7)).toBe("2026-03-12")
    expect(addDays("2026-03-05", 14)).toBe("2026-03-19")
    expect(addDays("2026-03-12", -7)).toBe("2026-03-05")
    // The copy in dashboard.ts and Home.tsx parsed UTC midnight (the evening
    // before, here), stepped LOCAL days, and read the result back in UTC: an
    // hour short after the jump, so a day short.
    const replaced = (s: string, n: number) => {
      const d = new Date(s)
      d.setDate(d.getDate() + n)
      return d.toISOString().slice(0, 10)
    }
    expect(replaced("2026-03-05", 7)).toBe("2026-03-11")
  })

  it("fall-back (Nov 1 2026, a 25-hour day) doesn't gain or lose one", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01")
    expect(addDays("2026-11-01", 1)).toBe("2026-11-02")
    expect(addDays("2026-10-25", 14)).toBe("2026-11-08")
    expect(addDays("2026-11-08", -14)).toBe("2026-10-25")
    // 14 × 24 h from local noon (taskService's "due within 14 days") stops at
    // 11:00 on the 14th day — short of a task due that day, which is at noon.
    const noonPlus = new Date(new Date("2026-10-25T12:00:00").getTime() + 14 * 86_400_000)
    expect(noonPlus.getHours()).toBe(11)
  })

  it("is the same answer in every zone, east of UTC included", () => {
    for (const tz of ["America/Los_Angeles", "America/New_York", "UTC", "Asia/Tokyo", "Pacific/Auckland", "Pacific/Kiritimati"]) {
      vi.stubEnv("TZ", tz)
      expect(addDays("2026-03-05", 7), tz).toBe("2026-03-12")
      expect(addDays("2026-10-25", 14), tz).toBe("2026-11-08")
      expect(addDays("2026-09-25", 4), tz).toBe("2026-09-29") // across Auckland's Sep 27 change
    }
    // The tasks-page copy built local noon and read it back as UTC — the day
    // before, wherever noon is already "tomorrow" in UTC terms (UTC+13 here).
    vi.stubEnv("TZ", "Pacific/Auckland")
    const replaced = (s: string, n: number) => {
      const d = new Date(`${s}T12:00:00`)
      d.setDate(d.getDate() + n)
      return d.toISOString().slice(0, 10)
    }
    expect(replaced("2026-10-01", 7)).toBe("2026-10-07")
    expect(addDays("2026-10-01", 7)).toBe("2026-10-08")
  })

  it("throws a RangeError on anything that isn't YYYY-MM-DD, rather than writing NaN-NaN-NaN", () => {
    for (const bad of ["", "2026-9-30", "2026-09-30T12:00:00Z", "Sep 30", "20260-01-01"]) {
      expect(() => addDays(bad, 1), bad).toThrow(RangeError)
      expect(() => addMonths(bad, 1), bad).toThrow(RangeError)
    }
  })
})

describe("addMonths — calendar months, matching what completeTask writes", () => {
  it("rolls a day the target month lacks over, as Date#setMonth did", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-03-03")
    expect(addMonths("2028-01-31", 1)).toBe("2028-03-02")
    expect(addMonths("2028-02-29", 12)).toBe("2029-03-01")
    expect(addMonths("2026-11-15", 3)).toBe("2027-02-15")
    expect(addMonths("2026-03-15", -3)).toBe("2025-12-15")
    expect(addMonths("2026-06-22", 120)).toBe("2036-06-22")
  })

  it("gives the server cadence's next-due date for every cadence, every day of three years", () => {
    const CADENCE: Array<["weekly" | "monthly" | "quarterly" | "semiannual" | "annual" | "every_n_days", (d: string) => string]> = [
      ["weekly", (d) => addDays(d, 7)],
      ["monthly", (d) => addMonths(d, 1)],
      ["quarterly", (d) => addMonths(d, 3)],
      ["semiannual", (d) => addMonths(d, 6)],
      ["annual", (d) => addMonths(d, 12)],
      ["every_n_days", (d) => addDays(d, 45)],
    ]
    for (const day of days("2026-01-01", 365 * 3 + 1)) {
      for (const [cadence, client] of CADENCE) {
        expect(client(day), `${cadence} from ${day}`).toBe(addCadence(day, cadence, 45))
      }
    }
  })
})

describe("diffDays — whole calendar days", () => {
  it("counts signed days", () => {
    expect(diffDays("2026-09-30", "2026-10-01")).toBe(1)
    expect(diffDays("2026-10-01", "2026-09-30")).toBe(-1)
    expect(diffDays("2026-09-30", "2026-09-30")).toBe(0)
    expect(diffDays("2026-01-01", "2027-01-01")).toBe(365)
    expect(diffDays("2028-01-01", "2029-01-01")).toBe(366)
  })

  it("is exact across both DST changes — a 23- and a 25-hour day are each one day", () => {
    expect(diffDays("2026-03-07", "2026-03-09")).toBe(2)
    expect(diffDays("2026-10-31", "2026-11-02")).toBe(2)
    expect(diffDays("2026-03-01", "2026-11-30")).toBe(274)
  })

  it("agrees with completeTask's daysBetween, and inverts addDays", () => {
    const span = days("2026-02-20", 300)
    for (const day of span) {
      expect(diffDays("2026-03-05", day)).toBe(completedOn.daysBetween("2026-03-05", day))
      expect(addDays("2026-03-05", diffDays("2026-03-05", day))).toBe(day)
    }
  })

  it("is NaN for a value that isn't a date — what the Date subtraction it replaced gave", () => {
    expect(diffDays("2026-09-30", "")).toBeNaN()
    expect(diffDays("garbage", "2026-09-30")).toBeNaN()
  })
})

describe("isCalendarDate — one answer with completeTask's", () => {
  it("accepts real days and refuses the rest", () => {
    for (const v of ["2026-09-30", "2028-02-29", "2026-02-29", "2026-02-30", "2026-13-01", "2026-9-30", "2026-09-30T00:00:00Z", "", null, 20260930]) {
      expect(isCalendarDate(v), String(v)).toBe(completedOn.isCalendarDate(v))
    }
    expect(isCalendarDate("2028-02-29")).toBe(true)
    expect(isCalendarDate("2026-02-29")).toBe(false)
  })
})
