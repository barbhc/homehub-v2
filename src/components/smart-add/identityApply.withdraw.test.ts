/**
 * Withdrawing an identity that no longer refers to what the user typed.
 *
 * Beta round 5: typing "Core", accepting "Levoit Core Series Air Purifiers",
 * then finishing the model to "Core 300" left the family name in place. The
 * apply had made it a non-placeholder, so neither the auto-compose effect nor a
 * later apply would ever replace it — the item shipped named after a catalogue
 * page with "Core 300" in the field directly above.
 *
 * IdentifyStep withdraws on model change. These pin the pure half of that: undo
 * restores exactly the fields the apply touched and nothing else, so the
 * recomposed placeholder can take over, and a name the user typed themselves is
 * never taken away from them.
 */
import { describe, it, expect } from "vitest"
import { applyIdentity, undoIdentity } from "./identityApply"
import type { IdentifyData } from "./IdentifyStep"
import type { ProductIdentity } from "@/modules/inventory/services/productLookupService"

const base = (over: Partial<IdentifyData> = {}): IdentifyData =>
  ({
    brand: "Levoit",
    model: "Core",
    name: "Levoit Core",
    itemCategory: null,
    subType: null,
    ...over,
  }) as IdentifyData

const seriesHit: ProductIdentity = {
  name: "Levoit Core Series Air Purifiers",
  rawCategory: "air purifier",
  source: "brave",
  confidence: "medium",
}

describe("withdrawing a stale identity", () => {
  it("undo puts back the composed placeholder, so completing the model can fix the name", () => {
    const data = base()
    const { next, snapshot } = applyIdentity(data, seriesHit, { nameIsPlaceholder: true })
    expect(next.name).toBe("Levoit Core Series Air Purifiers")

    // The user finishes the model; IdentifyStep withdraws the suggestion.
    const reverted = undoIdentity({ ...next, model: "Core 300" }, snapshot)
    expect(reverted.name).toBe("Levoit Core")
    // …and the caller recomposes from brand + model, which is the correct name.
    expect(`${reverted.brand} ${reverted.model}`.trim()).toBe("Levoit Core 300")
  })

  it("undo restores the category the apply filled, and leaves one the user chose", () => {
    const applied = applyIdentity(base(), seriesHit, { nameIsPlaceholder: true })
    expect(applied.snapshot.touched.category).toBe(true)
    expect(undoIdentity(applied.next, applied.snapshot).itemCategory).toBeNull()

    const userPicked = base({ itemCategory: "major_appliance" })
    const second = applyIdentity(userPicked, seriesHit, { nameIsPlaceholder: true })
    expect(second.snapshot.touched.category).toBe(false)
    expect(second.next.itemCategory).toBe("major_appliance")
    expect(undoIdentity(second.next, second.snapshot).itemCategory).toBe("major_appliance")
  })

  it("never overwrites a name the user typed themselves", () => {
    const typed = base({ name: "Bedroom air purifier" })
    const { next, snapshot } = applyIdentity(typed, seriesHit, { nameIsPlaceholder: false })
    expect(next.name).toBe("Bedroom air purifier")
    expect(snapshot.touched.name).toBe(false)
    expect(undoIdentity(next, snapshot).name).toBe("Bedroom air purifier")
  })
})
