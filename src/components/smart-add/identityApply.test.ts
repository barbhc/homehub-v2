/**
 * identityApply contract tests — the design invariants of the "We found this"
 * card: fills blanks (and the auto-composed placeholder) only, never a typed
 * value; undo restores exactly what apply touched, nothing else.
 */
import { describe, it, expect } from "vitest"
import { applyIdentity, undoIdentity } from "./identityApply"
import { DEFAULT_IDENTIFY_DATA, type IdentifyData } from "./IdentifyStep"
import type { ProductIdentity } from "@/modules/inventory/services/productLookupService"

const identity: ProductIdentity = {
  name: "LG WM4000HWA Front Load Washer",
  rawCategory: "washing machine",
  source: "icecat",
  confidence: "high",
}

const base: IdentifyData = { ...DEFAULT_IDENTIFY_DATA, brand: "LG", model: "WM4000HWA" }

describe("applyIdentity", () => {
  it("fills empty name + category, and records what it touched", () => {
    const { next, snapshot } = applyIdentity(base, identity)
    // HH-125: an identity "name" carrying the MODEL NUMBER is not a name — it is
    // the thing HH-112 asked us to stop doing ("the model number is unnecessary
    // and it's more important to list what type of item it is"). The field is
    // left alone so composeItemName can fall back to the item type.
    expect(next.name).toBe("")
    expect(next.itemCategory).toBe("major_appliance")
    expect(next.subType).toBeTruthy()
    expect(snapshot.touched).toEqual({ name: false, category: true })
  })

  it("replaces the auto-composed placeholder name but never a user-typed one", () => {
    // HH-125: a placeholder is still only replaced by something that is
    // actually a NAME. "LG WM4000HWA Front Load Washer" carries the model, so
    // it is refused and the placeholder is left for composeItemName to replace
    // with the item type — swapping one model-bearing string for another was
    // the whole complaint in HH-112.
    const placeholder = { ...base, name: "LG WM4000HWA" }
    const viaPlaceholder = applyIdentity(placeholder, identity, { nameIsPlaceholder: true })
    expect(viaPlaceholder.next.name).toBe("LG WM4000HWA")

    // A clean product name still fills it — the rule has to stay narrow.
    const clean = applyIdentity(placeholder, { ...identity, name: "Front Load Washer" }, { nameIsPlaceholder: true })
    expect(clean.next.name).toBe("Front Load Washer")

    const typed = { ...base, name: "Laundry room washer" }
    const viaTyped = applyIdentity(typed, identity, { nameIsPlaceholder: false })
    expect(viaTyped.next.name).toBe("Laundry room washer")
    expect(viaTyped.snapshot.touched.name).toBe(false)
  })

  it("never overwrites a user-picked category", () => {
    const picked: IdentifyData = { ...base, itemCategory: "fixture", subType: "faucet" }
    const { next, snapshot } = applyIdentity(picked, identity)
    expect(next.itemCategory).toBe("fixture")
    expect(next.subType).toBe("faucet")
    expect(snapshot.touched.category).toBe(false)
  })

  it("unmappable rawCategory leaves category untouched", () => {
    const odd: ProductIdentity = { ...identity, rawCategory: "flux capacitor" }
    const { next, snapshot } = applyIdentity(base, odd)
    expect(next.itemCategory).toBeNull()
    expect(snapshot.touched.category).toBe(false)
  })
})

describe("undoIdentity", () => {
  it("restores exactly the touched fields", () => {
    const { next, snapshot } = applyIdentity(base, identity)
    const restored = undoIdentity(next, snapshot)
    expect(restored.name).toBe(base.name)
    expect(restored.itemCategory).toBeNull()
    expect(restored.subType).toBeNull()
    // Untouched fields survive round-trip.
    expect(restored.brand).toBe("LG")
    expect(restored.model).toBe("WM4000HWA")
  })

  it("leaves fields the apply never touched alone — even if they changed since", () => {
    const typed = { ...base, name: "My washer" } // user-typed → apply won't touch name
    const { next, snapshot } = applyIdentity(typed, identity)
    const edited = { ...next, name: "My washer (garage)" } // user edits after apply
    const restored = undoIdentity(edited, snapshot)
    expect(restored.name).toBe("My washer (garage)") // undo must not clobber it
    expect(restored.itemCategory).toBeNull() // category WAS touched → restored
  })
})
