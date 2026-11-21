import type { IdentifyData, IdentifyMode } from "./IdentifyStep"

/** An empty identify step — where every add starts, and what "Start something
 *  else" resets to. Its own module so IdentifyStep.tsx exports only its
 *  component (react-refresh). */
export const DEFAULT_IDENTIFY_DATA: IdentifyData = {
  brand: "",
  model: "",
  name: "",
  serialNumber: "",
  itemCategory: null,
  subType: null,
  categoryFields: {},
  confidence: 0,
  locationId: null,
  purchaseDate: null,
  purchasePrice: null,
}

/**
 * What the add button still needs, or null when it can go. The ONE rule for
 * whether it is enabled, and the words said under it while it is not — it
 * used to sit disabled with no reason (audit 2026-10-15).
 *
 * HH-23: the appliance lane needs brand + model, not a name; the other lane
 * needs a name, because there it is the only thing identifying the item.
 */
export function missingToAdd(mode: IdentifyMode, d: IdentifyData): string | null {
  if (mode === "appliance") {
    const brand = d.brand.trim().length
    const model = d.model.trim().length
    if (brand < 2 && model < 1) return "Add the brand and model to continue."
    if (brand === 0) return "Add the brand to continue."
    if (brand < 2) return "The brand needs at least 2 letters."
    if (model < 1) return "Add the model to continue."
    return null
  }
  return d.name.trim().length > 0 ? null : "Add a name to continue."
}

/**
 * "What is it?" — owner, walk comments 2026-11-20: "Make sure and use the item
 * name. I don't know if this is the Washer by just the model number." The
 * lookup runs only after the item exists, and when it misses, an appliance was
 * created as "LG WM4000HWA", filed under Other, offered the name "Other" and
 * missed its typical care. One optional tap here names it by its type
 * ("Washer") and files it. Never required; the lookup still fills a blank.
 * Mock: https://claude.ai/artifact/Cz4hWKhTjR5YenPBdaJjeU (screen 1).
 */
export const KIND_CHIPS: { subType: string; label: string }[] = [
  { subType: "washing-machine", label: "Washer" },
  { subType: "dryer", label: "Dryer" },
  { subType: "dishwasher", label: "Dishwasher" },
  { subType: "refrigerator", label: "Fridge" },
  { subType: "water-heater", label: "Water heater" },
  { subType: "hvac-furnace", label: "Furnace" },
  { subType: "oven-range", label: "Oven or range" },
]
export const KIND_CATEGORY = "major_appliance" as const
