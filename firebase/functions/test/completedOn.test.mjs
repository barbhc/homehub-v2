/**
 * The completion-date rule (completedOn.ts) — pure, no emulator needed.
 *
 * The bug this pins: `completedOn` was a UTC date on both ends, so a check-off
 * after ~5 pm Pacific was recorded as tomorrow. The server now reads the date
 * against the HOME's calendar and refuses anything more than a day off it —
 * as invalid-argument, which completeTask.emu.test.mjs checks end to end.
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import {
  BACKDATE_MAX_DAYS,
  DEFAULT_HOME_TIMEZONE,
  calendarDateIn,
  checkCompletedOn,
  daysBetween,
  homeTimeZone,
  isCalendarDate,
} from "../lib/firebase/functions/src/tasks/completedOn.js"

const LA = "America/Los_Angeles"

test("calendarDateIn: 7:30 pm Pacific is still the 29th at the home, though UTC says the 30th", () => {
  const evening = new Date("2026-09-30T02:30:00Z") // Sep 29, 19:30 PDT
  assert.equal(calendarDateIn(LA, evening), "2026-09-29")
  assert.equal(calendarDateIn("UTC", evening), "2026-09-30") // what the old code recorded
  assert.equal(calendarDateIn(LA, new Date("2026-09-30T07:30:00Z")), "2026-09-30") // 00:30 PDT
  // East of UTC the error runs the other way: 00:30 in Tokyo is still the 29th in UTC.
  assert.equal(calendarDateIn("Asia/Tokyo", new Date("2026-09-29T15:30:00Z")), "2026-09-30")
  // Standard time (PST, UTC−8) too, and a year boundary.
  assert.equal(calendarDateIn(LA, new Date("2027-01-01T07:30:00Z")), "2026-12-31")
})

test("homeTimeZone: the home's zone when it is one, the default otherwise", () => {
  assert.equal(homeTimeZone("America/New_York"), "America/New_York")
  assert.equal(homeTimeZone(undefined), DEFAULT_HOME_TIMEZONE)
  assert.equal(homeTimeZone(null), DEFAULT_HOME_TIMEZONE)
  assert.equal(homeTimeZone(""), DEFAULT_HOME_TIMEZONE)
  assert.equal(homeTimeZone("Mars/Olympus_Mons", "h1"), DEFAULT_HOME_TIMEZONE)
  assert.equal(homeTimeZone(42, "h1"), DEFAULT_HOME_TIMEZONE)
})

test("isCalendarDate: strict YYYY-MM-DD, and a real day", () => {
  for (const ok of ["2026-09-29", "2028-02-29", "2026-12-31"]) assert.equal(isCalendarDate(ok), true, ok)
  for (const bad of ["", "banana", "2026-9-29", "2026-02-30", "2027-02-29", "2026-13-01", "2026-09-29T00:00:00Z", " 2026-09-29", 20260929, null, undefined, {}]) {
    assert.equal(isCalendarDate(bad), false, JSON.stringify(bad))
  }
})

test("daysBetween counts calendar days across month and year ends", () => {
  assert.equal(daysBetween("2026-09-29", "2026-10-01"), 2)
  assert.equal(daysBetween("2026-09-29", "2026-09-27"), -2)
  assert.equal(daysBetween("2026-12-31", "2027-01-01"), 1)
  assert.equal(daysBetween("2028-02-28", "2028-03-01"), 2) // leap year
})

// ── the tolerance ────────────────────────────────────────────────────────────

const TODAY = "2026-09-29"

test("accepts today and one day either side", () => {
  for (const d of ["2026-09-28", "2026-09-29", "2026-09-30"]) {
    assert.deepEqual(checkCompletedOn({ completedOn: d }, TODAY), { ok: true, completedOn: d }, d)
  }
})

test("rejects two days either side, with a message a person can act on", () => {
  for (const d of ["2026-09-27", "2026-10-01", "2025-09-29", "2026-12-25"]) {
    const res = checkCompletedOn({ completedOn: d }, TODAY)
    assert.equal(res.ok, false, d)
    assert.match(res.message, /today at this home is 2026-09-29/)
    assert.match(res.message, /date and time/)
  }
})

test("the window follows the home's today across a month end", () => {
  assert.equal(checkCompletedOn({ completedOn: "2026-09-30" }, "2026-10-01").ok, true)
  assert.equal(checkCompletedOn({ completedOn: "2026-09-29" }, "2026-10-01").ok, false)
  assert.equal(checkCompletedOn({ completedOn: "2027-01-01" }, "2026-12-31").ok, true)
})

test("no completedOn (absent or null) means the home's today — never a UTC date", () => {
  assert.deepEqual(checkCompletedOn({}, TODAY), { ok: true, completedOn: TODAY })
  assert.deepEqual(checkCompletedOn({ completedOn: null }, TODAY), { ok: true, completedOn: TODAY })
})

test("garbage is refused as a date problem, whatever its type", () => {
  for (const bad of ["", "banana", "2026-9-29", "2026-02-30", "2026-09-29T19:30:00-07:00", 20260929, true, {}, []]) {
    const res = checkCompletedOn({ completedOn: bad }, TODAY)
    assert.equal(res.ok, false, JSON.stringify(bad))
    assert.match(res.message, /isn't a date \(expected YYYY-MM-DD\)/, JSON.stringify(bad))
  }
})

test("an explicitly back-dated completion may reach BACKDATE_MAX_DAYS back, no further, and never the future", () => {
  assert.equal(BACKDATE_MAX_DAYS, 7)
  // "A few days ago" sends device-today − 5: −4…−6 against the home.
  for (const d of ["2026-09-23", "2026-09-24", "2026-09-25", "2026-09-22", "2026-09-29", "2026-09-30"]) {
    assert.equal(checkCompletedOn({ completedOn: d, backdated: true }, TODAY).ok, true, d)
  }
  const tooOld = checkCompletedOn({ completedOn: "2026-09-21", backdated: true }, TODAY)
  assert.equal(tooOld.ok, false)
  assert.match(tooOld.message, /more than 7 days ago/)
  assert.equal(checkCompletedOn({ completedOn: "2026-10-01", backdated: true }, TODAY).ok, false)
  // Without the flag the same five-day-old date is refused.
  assert.equal(checkCompletedOn({ completedOn: "2026-09-24" }, TODAY).ok, false)
  assert.equal(checkCompletedOn({ completedOn: "2026-09-24", backdated: false }, TODAY).ok, false)
})

test("backdated must be a boolean when it is sent", () => {
  const res = checkCompletedOn({ completedOn: TODAY, backdated: "yes" }, TODAY)
  assert.equal(res.ok, false)
  assert.match(res.message, /backdated must be true or false/)
  assert.equal(checkCompletedOn({ completedOn: TODAY, backdated: null }, TODAY).ok, true)
})
