/**
 * Drift guard. `shared/products/specKeys.ts` exists so the Cloud Function can
 * validate suggestion keys without importing the client's category schema
 * (which pulls in lucide icons). That duplication is only safe if it is pinned:
 * if someone adds a field to a category and not to the shared map, the lookup
 * would silently stop suggesting it — a regression with no error message.
 */
import { describe, it, expect } from "vitest"
import { ITEM_CATEGORIES } from "@/modules/inventory/constants/itemCategories"
import { SPEC_KEYS_BY_CATEGORY, allowedSpecKeys, isAllowedSpecKey } from "../../shared/products/specKeys"

describe("shared spec-key allowlist", () => {
  it("matches the real category field schema exactly", () => {
    const fromSchema = Object.fromEntries(
      ITEM_CATEGORIES.map((c) => [c.id, [...new Set(c.fields.map((f) => f.key))].sort()]),
    )
    const fromShared = Object.fromEntries(
      Object.entries(SPEC_KEYS_BY_CATEGORY).map(([k, v]) => [k, [...new Set(v)].sort()]),
    )
    expect(fromShared).toEqual(fromSchema)
  })

  it("gates the exact bug that shipped: 'power' is not a small-appliance key, 'wattage' is", () => {
    expect(isAllowedSpecKey("small_appliance", "wattage")).toBe(true)
    expect(isAllowedSpecKey("small_appliance", "power")).toBe(false)
    expect(isAllowedSpecKey("small_appliance", "power_w")).toBe(false)
  })

  it("falls back to the union when the category is unknown, rather than blocking everything", () => {
    expect(allowedSpecKeys(null)).toContain("wattage")
    expect(allowedSpecKeys("not_a_category")).toContain("wattage")
    expect(isAllowedSpecKey(null, "merv")).toBe(false)
  })
})
