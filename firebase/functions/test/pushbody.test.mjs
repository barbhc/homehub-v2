// The push copy + destination used to be a hand-mirrored `pushFor` here that
// had drifted from the function ("Due today" / "Home care today" — strings the
// server had not said in weeks). Round 19 made the composers pure and
// importable, so this file now tests the REAL ones: see pushlanes.test.mjs for
// the full decision table; only the cadence seeding tests remain below.
import test from "node:test"
import assert from "node:assert"

// ── initial due-date seeding (commitDraft) ──────────────────────────────────
import { addCadence, seasonalNextDue } from "../lib/firebase/functions/src/schedule/cadence.js"

test("a new item's tasks start one cadence out, not today", () => {
  // The reported bug: 7 tasks "due Today" on a just-added air purifier,
  // including a yearly HEPA filter. The clock starts at add time.
  assert.equal(addCadence("2026-08-15", "weekly", null), "2026-08-22")
  assert.equal(addCadence("2026-08-15", "monthly", null), "2026-09-15")
  assert.equal(addCadence("2026-08-15", "annual", null), "2027-08-15")
  assert.equal(addCadence("2026-08-15", "every_n_days", 14), "2026-08-29")
})

test("seasonal still anchors to the season, not the parse date", () => {
  const d = seasonalNextDue("fall", "2026-08-15")
  assert.ok(d && d > "2026-08-15", `expected a future fall date, got ${d}`)
})
