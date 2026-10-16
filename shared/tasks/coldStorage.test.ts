/**
 * HH-166 (owner, 2026-10-16): "Winterize the washer for cold storage" sat on
 * her agenda as "Usually autumn". It is a one-off — done when a washer is moved
 * or stored somewhere unheated — so it is as-needed, not a yearly autumn job.
 *
 * Pinned at every layer that decides it: the predicate, the row correction the
 * parse worker and the review draft both apply, the seasonal phrase, and the
 * agenda's one eligibility rule (Home, Coming up and the push sweep).
 */
import { describe, it, expect } from "vitest"
import { asNeededIfColdStorage, isColdStorageWinterizing, seasonalFamily } from "./houseRules"
import { isAgendaEligible } from "./agendaEligibility"
import { seasonForTitle } from "../care/seasonalWindow"
import { rowsFrom } from "../../src/components/manuals/reviewRows"
import type { PreviewResult } from "../../src/modules/knowledge/types/previewTypes"

const OWNERS = "Winterize the washer for cold storage"

describe("isColdStorageWinterizing", () => {
  it("catches the owner's task and the other ways a manual says it", () => {
    for (const t of [
      OWNERS,
      "Winterize Washer for Cold Storage",
      "Winterize the washer before moving or storing",
      "Winterizing the washer if stored in an unheated area",
      "Prepare for cold storage",
    ]) expect(isColdStorageWinterizing(t), t).toBe(true)
  })

  it("leaves the home's yearly freeze prep seasonal", () => {
    for (const t of [
      "Winterize the outdoor faucets",
      "Winterize the Dishwasher",
      "Freeze protection for outdoor faucet",
      "Store the hose reel",         // storage, but not winterizing
      "Clean the Filter System",
    ]) expect(isColdStorageWinterizing(t), t).toBe(false)
  })

  it("stays in the freeze_prep family, so the climate sweep still offers it", () => {
    expect(seasonalFamily(OWNERS)).toBe("freeze_prep")
  })
})

describe("asNeededIfColdStorage", () => {
  it("re-files a seasonal or yearly cold-storage row as as-needed", () => {
    expect(asNeededIfColdStorage({ title: OWNERS, schedule_type: "seasonal", interval_days: null }))
      .toEqual({ title: OWNERS, schedule_type: "as_needed", interval_days: null })
    expect(asNeededIfColdStorage({ title: OWNERS, schedule_type: "annual", interval_days: null }).schedule_type)
      .toBe("as_needed")
  })

  it("leaves other rows, and rows already off the schedule, exactly as they were", () => {
    const faucets = { title: "Winterize the outdoor faucets", schedule_type: "seasonal", interval_days: null }
    expect(asNeededIfColdStorage(faucets)).toBe(faucets)
    const setup = { title: OWNERS, schedule_type: "setup", interval_days: null }
    expect(asNeededIfColdStorage(setup)).toBe(setup)
  })

  it("the review draft saves the corrected cadence (rowsFrom → what onSave hands back)", () => {
    const draft = {
      ok: true,
      chunks: [],
      tasks: [{
        title: OWNERS, description: "", justification: null, care_type: "maintenance",
        priority_tier: "recommended", risk_level: "prevent_damage", estimated_minutes: 20,
        schedule_type: "seasonal", interval_days: null, instructions_text: "", source_page: 30, tags: [],
      }],
    } as unknown as PreviewResult
    const [row] = rowsFrom(draft)
    expect(row.schedule).toBe("as_needed")
    expect(row.task?.schedule_type).toBe("as_needed")
  })
})

describe("on Home", () => {
  it("has no season, so it never reads 'Usually autumn'", () => {
    expect(seasonForTitle(OWNERS, seasonalFamily(OWNERS))).toBeNull()
    expect(seasonForTitle("Winterize the outdoor faucets", "freeze_prep")).toBe("fall")
  })

  it("is not on the dated agenda when the caller passes the title — an as-needed task never is", () => {
    expect(isAgendaEligible({ careType: "maintenance", scopeType: "item_unit", title: OWNERS })).toBe(false)
    expect(isAgendaEligible({ careType: "maintenance", scopeType: "item_unit", title: "Winterize the outdoor faucets" })).toBe(true)
    // Callers counting by reason (item cleaning) leave the title out and are unchanged.
    expect(isAgendaEligible({ careType: "maintenance", scopeType: "item_unit" })).toBe(true)
  })
})
