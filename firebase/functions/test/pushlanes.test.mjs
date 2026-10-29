/**
 * The push decision table and copy, driven pure. Imports the COMPILED lib
 * (npm --prefix firebase/functions run build first) like the other tests.
 *
 * Every row here is a promise the app makes in Settings: "Sundays at 5 PM",
 * "held during quiet hours", "only reminders you chose". Before round 19 the
 * server read no preferences at all, so none of those promises were kept.
 */
import test from "node:test"
import assert from "node:assert/strict"
import {
  laParts, decideLanes, composeMorning, composeDigest, composeBuyAhead, buyAheadRows,
} from "../lib/firebase/functions/src/push/lanes.js"
import { normalizeNotificationPrefs } from "../lib/shared/notifications/preferences.js"

const prefs = (over = {}) => normalizeNotificationPrefs(over)
const at = (date, hour, weekday) => ({ date, hhmm: `${String(hour).padStart(2, "0")}:00`, hour, weekday })
const SUN = "2026-09-06", MON = "2026-09-07"

// ── clock ────────────────────────────────────────────────────────────────────
test("laParts renders the delivery timezone, not UTC — the bug the old cron had", () => {
  // 2026-09-06T00:30Z is Saturday 5:30 PM in Los Angeles (PDT, UTC-7).
  const p = laParts(new Date("2026-09-06T00:30:00Z"))
  assert.equal(p.date, "2026-09-05")
  assert.equal(p.hour, 17)
  assert.equal(p.weekday, 6)
  assert.equal(p.hhmm, "17:30")
})

test("laParts: midnight is hour 0, not 24", () => {
  const p = laParts(new Date("2026-09-06T07:05:00Z")) // 00:05 PDT
  assert.equal(p.hour, 0)
  assert.equal(p.hhmm, "00:05")
})

// ── decideLanes ──────────────────────────────────────────────────────────────
test("morning: fires at the first tick at/after 8, once per day", () => {
  const p = prefs()
  assert.equal(decideLanes(at(MON, 7, 1), p, {}).morning, false)
  assert.equal(decideLanes(at(MON, 8, 1), p, {}).morning, true)
  assert.equal(decideLanes(at(MON, 9, 1), p, { lastMorningDate: MON }).morning, false)
  assert.equal(decideLanes(at(MON, 9, 1), p, { lastMorningDate: SUN }).morning, true)
})

test("morning: quiet hours DEFER, they do not drop — the next non-quiet tick fires", () => {
  const p = prefs({ quiet_hours: { start: "22:00", end: "10:00", tz: "America/Los_Angeles" } })
  assert.deepEqual(decideLanes(at(MON, 8, 1), p, {}).morning, false)
  assert.deepEqual(decideLanes(at(MON, 9, 1), p, {}).morning, false)
  assert.deepEqual(decideLanes(at(MON, 10, 1), p, {}).morning, true)
  assert.ok(decideLanes(at(MON, 8, 1), p, {}).reasons.includes("morning:quiet"))
})

test("morning: the task-reminders switch is finally read", () => {
  const p = prefs({ events: { task_reminders: { push: false } } })
  assert.equal(decideLanes(at(MON, 8, 1), p, {}).morning, false)
})

test("digest: exactly the user's weekday + hour, once — and quiet hours do not veto a chosen hour", () => {
  const p = prefs({ weekly_digest: { enabled: true, day: 0, hour: 17 }, quiet_hours: { start: "16:00", end: "20:00", tz: "UTC" } })
  assert.equal(decideLanes(at(SUN, 17, 0), p, {}).digest, true)
  assert.equal(decideLanes(at(SUN, 16, 0), p, {}).digest, false)
  assert.equal(decideLanes(at(MON, 17, 1), p, {}).digest, false)
  assert.equal(decideLanes(at(SUN, 17, 0), p, { lastDigestKey: SUN }).digest, false)
  assert.equal(decideLanes(at(SUN, 17, 0), prefs({ weekly_digest: { enabled: false } }), {}).digest, false)
})

test("digest: a custom day and hour are honored", () => {
  const p = prefs({ weekly_digest: { enabled: true, day: 3, hour: 7 } })
  assert.equal(decideLanes(at("2026-09-09", 7, 3), p, {}).digest, true)
  assert.equal(decideLanes(at(SUN, 17, 0), p, {}).digest, false)
})

test("buy-ahead: morning lane with its own switch and its own once-a-day key", () => {
  assert.equal(decideLanes(at(MON, 9, 1), prefs(), {}).buyAhead, true)
  assert.equal(decideLanes(at(MON, 8, 1), prefs(), {}).buyAhead, false)
  assert.equal(decideLanes(at(MON, 9, 1), prefs(), { lastBuyAheadDate: MON }).buyAhead, false)
  assert.equal(decideLanes(at(MON, 9, 1), prefs({ events: { buy_ahead: { push: false } } }), {}).buyAhead, false)
})

// ── composers ────────────────────────────────────────────────────────────────
const pend = (over = {}) => ({
  id: "i1", taskTemplateId: "t1", itemUnitId: "u1", title: "Replace the furnace filter", itemName: "Furnace",
  dueDate: MON, isDeadline: false, safety: false, remindEnabled: true, priorityTier: "recommended",
  supplies: [], ...over,
})

test("morning copy: a deadline leads, and links straight to it", () => {
  const m = composeMorning([pend({ id: "d1", title: "Warranty claim closes", isDeadline: true })], prefs(), MON, "h1")
  assert.equal(m.title, "Deadline today")
  assert.equal(m.body, "Warranty claim closes")
  assert.equal(m.url, "/tasks/d1?home=h1")
})

test("morning copy: one curated reminder due today names itself; a null-flag Recommended does not push in curated mode", () => {
  const curated = prefs({ push_mode: "curated" })
  assert.equal(composeMorning([pend({ remindEnabled: null })], curated, MON, "h1"), null)
  const m = composeMorning([pend()], curated, MON, "h1")
  assert.equal(m.title, "Today: Replace the furnace filter")
  assert.equal(m.url, "/tasks/i1?home=h1")
})

test("morning copy: nothing due → null, never a filler push", () => {
  assert.equal(composeMorning([pend({ dueDate: "2026-09-12" })], prefs(), MON, "h1"), null)
})

test("digest copy: names up to three, counts the rest, says what to buy first, lands on /week", () => {
  const rows = [
    pend({ id: "a", title: "A" }), pend({ id: "b", title: "B" }), pend({ id: "c", title: "C" }), pend({ id: "d", title: "D" }),
    pend({ id: "e", title: "E", supplies: [{ name: "Filter", url: null, size: null, buyAhead: true }] }),
  ]
  const d = composeDigest(rows, prefs({ push_mode: "curated" }), SUN, "h1", new Set())
  assert.equal(d.title, "Your week at home")
  assert.equal(d.body, "5 reminders: A, B, C and 2 more. One thing to buy first.")
  assert.equal(d.url, "/week?home=h1")
  assert.equal(d.toBuy, 1)
})

test("digest copy: a covered part ('I have one') is not counted; an empty week is null", () => {
  const rows = [pend({ id: "e", title: "E", supplies: [{ name: "Filter", url: null, size: null, buyAhead: true }] })]
  const d = composeDigest(rows, prefs(), SUN, "h1", new Set(["e::filter"]))
  assert.equal(d.body, "1 reminder: E.")
  assert.equal(composeDigest([pend({ dueDate: "2026-10-30" })], prefs(), SUN, "h1", new Set()), null)
})

test("digest: lapsed safety work the user never chose about rides outside 'Just my list'", () => {
  for (const push_mode of ["curated+essential", "all"]) {
    const d = composeDigest([pend({ remindEnabled: null, safety: true, title: "Test smoke alarms" })], prefs({ push_mode }), SUN, "h1", new Set())
    assert.ok(d, push_mode)
    assert.match(d.body, /Includes a safety check/)
  }
})

// ── Off wins, no exceptions (owner decision 2026-10-28) ─────────────────────
// An explicit Off is silent in every mode and every lane — including the two
// kinds of message that used to ignore the switch: deadlines in the morning
// push, lapsed safety work in the digest. "Never chose" keeps both.
const MODES = ["curated", "curated+essential", "all"]

test("Off: lapsed safety work switched Off is NOT in the digest, in any mode", () => {
  for (const push_mode of MODES) {
    const off = pend({ remindEnabled: false, safety: true, priorityTier: "essential", title: "Test smoke alarms" })
    assert.equal(composeDigest([off], prefs({ push_mode }), SUN, "h1", new Set()), null, push_mode)
  }
})

test("Off: a deadline switched Off is NOT in the morning push, in any mode; never chose still is outside 'Just my list'", () => {
  for (const push_mode of MODES) {
    const off = pend({ id: "off", title: "Warranty claim closes", isDeadline: true, remindEnabled: false })
    assert.equal(composeMorning([off], prefs({ push_mode }), MON, "h1"), null, push_mode)
  }
  for (const push_mode of ["curated+essential", "all"]) {
    const off = pend({ id: "off", title: "Warranty claim closes", isDeadline: true, remindEnabled: false })
    const never = pend({ id: "never", title: "Warranty registration due", isDeadline: true, remindEnabled: null })
    const m = composeMorning([off, never], prefs({ push_mode }), MON, "h1")
    assert.equal(m.title, "Deadline today", push_mode)
    assert.equal(m.body, "Warranty registration due", push_mode)
  }
})

test("Off: 'Everything on a schedule' no longer overrides a task switched Off — morning, digest and buy-ahead", () => {
  const all = prefs({ push_mode: "all" })
  const sup = [{ name: "Filter", url: null, size: null, buyAhead: true }]
  const off = pend({ id: "off", title: "Wipe the door seal", remindEnabled: false, supplies: sup })
  const never = pend({ id: "never", title: "Flush the water heater", remindEnabled: null, priorityTier: "optional", supplies: sup })
  const m = composeMorning([off, never], all, MON, "h1")
  assert.equal(m.title, "Today: Flush the water heater")
  const d = composeDigest([off, never], all, SUN, "h1", new Set())
  assert.equal(d.body, "1 reminder: Flush the water heater. One thing to buy first.")
  assert.deepEqual(buyAheadRows([off, never], all, MON, new Set(), {}).map((r) => r.pending.id), ["never"])
})

// ── Just my list = ONLY what was switched On (owner, 2026-10-28 follow-up) ──
test("Just my list: a never-chose deadline gets no morning push, never-chose lapsed safety is not in the digest", () => {
  const curated = prefs({ push_mode: "curated" })
  const deadline = pend({ id: "d", title: "Warranty registration due", isDeadline: true, remindEnabled: null, priorityTier: "essential" })
  assert.equal(composeMorning([deadline], curated, MON, "h1"), null)
  const smoke = pend({ id: "s", title: "Test smoke alarms", safety: true, remindEnabled: null, priorityTier: "essential" })
  assert.equal(composeDigest([smoke], curated, SUN, "h1", new Set()), null)
  // ...while a task switched On still reaches both.
  assert.equal(composeMorning([{ ...deadline, remindEnabled: true }], curated, MON, "h1").title, "Deadline today")
  assert.match(composeDigest([{ ...smoke, remindEnabled: true }], curated, SUN, "h1", new Set()).body, /Includes a safety check/)
})

test("Off: an explicit On still notifies a deadline and lapsed safety work in every mode", () => {
  for (const push_mode of MODES) {
    assert.equal(composeMorning([pend({ isDeadline: true, remindEnabled: true })], prefs({ push_mode }), MON, "h1").title, "Deadline today")
    assert.ok(composeDigest([pend({ safety: true, remindEnabled: true })], prefs({ push_mode }), SUN, "h1", new Set()))
  }
})

test("buy-ahead rows: lead window, agreement, coverage and already-sent all filter", () => {
  const sup = [{ name: "Filter", url: "https://x", size: "16x25x1", buyAhead: true }]
  const rows = [
    pend({ id: "soon", dueDate: "2026-09-10", supplies: sup }),
    pend({ id: "late", dueDate: "2026-10-20", supplies: sup }),
    pend({ id: "off", dueDate: "2026-09-10", supplies: sup, remindEnabled: false }),
    pend({ id: "have", dueDate: "2026-09-10", supplies: sup }),
    pend({ id: "sent", dueDate: "2026-09-10", supplies: sup }),
  ]
  const out = buyAheadRows(rows, prefs({ push_mode: "curated" }), MON, new Set(["have::filter"]), { buyAheadSent: { "sent::filter": SUN } })
  assert.deepEqual(out.map((r) => r.pending.id), ["soon"])
})

test("buy-ahead copy: one part lands on its task row; several open Buy first", () => {
  const sup = { name: "Furnace filter", url: "https://filterbuy.com/x", size: "16x25x1", buyAhead: true }
  const one = composeBuyAhead([{ pending: pend({ dueDate: "2026-09-12" }), supply: sup, key: "k" }], "h1")
  assert.equal(one.title, "Furnace filter · 16x25x1 — order this week")
  assert.match(one.body, /lands Saturday/)
  assert.equal(one.url, "/items/u1?task=t1&home=h1")
  const many = composeBuyAhead([
    { pending: pend(), supply: sup, key: "a" },
    { pending: pend({ id: "i2" }), supply: { ...sup, name: "Purifier filter" }, key: "b" },
  ], "h1")
  assert.equal(many.title, "2 parts to order this week")
  assert.equal(many.url, "/week?home=h1")
})
