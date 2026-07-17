/**
 * Seasonal scheduling — the fix for "Winterize Washer" surfacing due-today in July.
 * A seasonal task must anchor to the season it's ACTED in (winterize → fall), and
 * an un-inferable season must NOT resolve to a concrete date (caller holds it).
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import { seasonForTask, seasonalNextDue, addCadence } from "../lib/firebase/functions/src/schedule/cadence.js"

test("seasonForTask: winterize / cold storage → fall (prep before winter)", () => {
  assert.equal(seasonForTask({ title: "Winterize Washer for Cold Storage" }), "fall")
  assert.equal(seasonForTask({ title: "Freeze protection for outdoor faucet" }), "fall")
  assert.equal(seasonForTask({ title: "Clean gutters", tags: ["seasonal"] }), "fall")
})

test("seasonForTask: explicit season wins; other seasons infer; unknown → null", () => {
  assert.equal(seasonForTask({ title: "whatever", season: "summer" }), "summer")
  assert.equal(seasonForTask({ title: "Spring startup for irrigation" }), "spring")
  assert.equal(seasonForTask({ title: "Summer AC coil clean", tags: ["summer"] }), "summer")
  assert.equal(seasonForTask({ title: "Descale the coffee maker" }), null)
  assert.equal(seasonForTask({ title: "" }), null)
})

test("seasonalNextDue: anchors on/after `from`, rolls to next year if passed", () => {
  assert.equal(seasonalNextDue("fall", "2026-07-14"), "2026-10-15") // July → this Oct
  assert.equal(seasonalNextDue("fall", "2026-11-01"), "2027-10-15") // past Oct → next year
  assert.equal(seasonalNextDue("winter", "2026-07-14"), "2027-01-15")
})

test("seasonalNextDue: unknown/empty season → null (so caller doesn't schedule to today)", () => {
  assert.equal(seasonalNextDue("", "2026-07-14"), null)
  assert.equal(seasonalNextDue("monsoon", "2026-07-14"), null)
})

test("the exact prod bug: winterize parsed in July → next fall, never today", () => {
  const parsedOn = "2026-07-14"
  const season = seasonForTask({ title: "Winterize Washer for Cold Storage", tags: [] })
  const due = seasonalNextDue(season ?? "", parsedOn)
  assert.equal(season, "fall")
  assert.equal(due, "2026-10-15")
  assert.notEqual(due, parsedOn) // the whole point
})

test("addCadence unchanged for seasonal (still null — anchoring is separate)", () => {
  assert.equal(addCadence("2026-07-14", "seasonal", null), null)
  assert.equal(addCadence("2026-07-14", "monthly", null), "2026-08-14")
})
