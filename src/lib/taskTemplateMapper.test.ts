/**
 * Firestore → TaskTemplate mapping, for the fields the UI makes promises about.
 *
 * This exists because `remind_enabled` was added to the type, written by every
 * writer, and simply never read back — so `willNotify` fell through to the tier
 * default for every task and the reminder switch did nothing. Build was green,
 * types were satisfied, 341 tests passed. Only running the page caught it.
 */
import { describe, it, expect } from "vitest"
import { toTaskTemplate, toTemplateSupplies } from "@/modules/care/services/taskService"
import { willNotify } from "../../shared/tasks/reviewBuckets"

const doc = (over: Record<string, unknown> = {}) => ({
  title: "Descale the humidifier pad",
  careType: "maintenance",
  priorityTier: "recommended",
  riskLevel: "performance",
  ...over,
})

describe("toTaskTemplate — the reminder switch survives the round trip", () => {
  it("carries an explicit true", () => {
    expect(toTaskTemplate("h", "t", doc({ remindEnabled: true })).remind_enabled).toBe(true)
  })

  it("carries an explicit false — distinct from 'never chose'", () => {
    expect(toTaskTemplate("h", "t", doc({ remindEnabled: false })).remind_enabled).toBe(false)
  })

  it("maps an absent field to null, NOT false", () => {
    // Every task written before the field existed is in this state. Collapsing it
    // to false would silently mean "the user turned reminders off" for all of them.
    expect(toTaskTemplate("h", "t", doc()).remind_enabled).toBe(null)
    expect(toTaskTemplate("h", "t", doc({ remindEnabled: null })).remind_enabled).toBe(null)
  })

  it("ignores a non-boolean rather than coercing it", () => {
    expect(toTaskTemplate("h", "t", doc({ remindEnabled: "yes" })).remind_enabled).toBe(null)
  })

  it("end to end: a Recommended doc with remindEnabled reaches willNotify as true", () => {
    const t = toTaskTemplate("h", "t", doc({ remindEnabled: true }))
    expect(
      willNotify({
        care_type: t.care_type,
        priority_tier: t.priority_tier,
        schedule_type: "quarterly",
        keep_as_task: true,
        remind_enabled: t.remind_enabled,
      }),
    ).toBe(true)
  })

  it("end to end: an Essential doc with remindEnabled=false reaches willNotify as false", () => {
    const t = toTaskTemplate("h", "t", doc({ priorityTier: "essential", remindEnabled: false }))
    expect(
      willNotify({
        care_type: t.care_type,
        priority_tier: t.priority_tier,
        schedule_type: "annual",
        keep_as_task: true,
        remind_enabled: t.remind_enabled,
      }),
    ).toBe(false)
  })
})

describe("toTemplateSupplies — where the spare is kept survives the round trip", () => {
  // A field this mapper forgets reads as undefined and silently becomes null:
  // the place would save, then vanish on the next load.
  it("reads the place, trimmed", () => {
    const [row] = toTemplateSupplies([{ name: "Furnace filter", location: "  Hall closet, top shelf " }])
    expect(row.location).toBe("Hall closet, top shelf")
  })
  it("a legacy row without the field, or a blank one, reads as no place", () => {
    expect(toTemplateSupplies([{ name: "Furnace filter", category: "filter", partNumber: "FPR10" }])[0].location).toBeNull()
    expect(toTemplateSupplies([{ name: "Furnace filter", location: "   " }])[0].location).toBeNull()
    expect(toTemplateSupplies([{ name: "Furnace filter", location: 42 }])[0].location).toBeNull()
  })
})
