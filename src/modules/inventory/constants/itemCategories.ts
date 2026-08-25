/**
 * Single source of truth for inventory item categories, sub-types, field defs, and task-generation hints.
 */
import type { LucideIcon } from "lucide-react"
import {
  Armchair,
  Bath,
  Cpu,
  Home,
  Lamp,
  Refrigerator,
  Coffee,
  TreePine,
  Tv,
  Wifi,
  Snowflake,
  UtensilsCrossed,
  Flame,
  Radio,
  Shirt,
  Wind,
  Thermometer,
  Droplets,
  Trash2,
} from "lucide-react"

// ── Category Enum ────────────────────────────────────────────────────────────

export type ItemCategoryId =
  | "major_appliance"
  | "small_appliance"
  | "fixture"
  | "system"
  | "structure"
  | "outdoor"
  | "furniture"
  | "media"
  | "smart_home"

// ── Sub-type Definition ──────────────────────────────────────────────────────

export type SubTypeGroup = {
  group: string
  options: { id: string; label: string; icon: LucideIcon }[]
}

export type TaskGenerationConfig = {
  defaultTier: "essential" | "recommended" | "optional"
  taskCount: { min: number; max: number }
  promptContext: string
  manualRelevance: "high" | "medium" | "low"
  defaultTasks?: { title: string; cadence: string }[]
}

export type CategoryFieldDef = {
  key: string
  label: string
  type: "text" | "select" | "date" | "toggle" | "number" | "multi-select"
  options?: string[]
  placeholder?: string
  showWhen?: { subType?: string[]; field?: string; value?: unknown }
  required?: boolean
}

export type CategoryDefinition = {
  id: ItemCategoryId
  label: string
  icon: LucideIcon
  description: string
  subTypes: SubTypeGroup[]
  fields: CategoryFieldDef[]
  taskGeneration: TaskGenerationConfig
}

const I = {
  Refrigerator,
  Coffee,
  Bath,
  Cpu,
  Home,
  TreePine,
  Armchair,
  Tv,
  Wifi,
  Lamp,
}

const OTHER_OPTION = { id: "other", label: "Other", icon: Home }

export const ITEM_CATEGORIES: CategoryDefinition[] = [
  {
    id: "major_appliance",
    label: "Major Appliance",
    icon: I.Refrigerator,
    description: "Large installed appliances: kitchen, laundry, and climate equipment.",
    subTypes: [
      {
        group: "Kitchen",
        options: [
          { id: "refrigerator", label: "Refrigerator", icon: I.Refrigerator },
          { id: "wine-fridge", label: "Built-in wine fridge", icon: I.Refrigerator },
          { id: "dishwasher", label: "Dishwasher", icon: I.Refrigerator },
          { id: "oven-range", label: "Oven / range", icon: I.Refrigerator },
          { id: "microwave", label: "Microwave", icon: I.Refrigerator },
          { id: "range-hood", label: "Range hood", icon: I.Refrigerator },
          { id: "garbage-disposal", label: "Garbage disposal", icon: I.Refrigerator },
        ],
      },
      {
        group: "Laundry",
        options: [
          { id: "washing-machine", label: "Washer", icon: I.Refrigerator },
          { id: "dryer", label: "Dryer", icon: I.Refrigerator },
        ],
      },
      {
        group: "Climate",
        options: [
          { id: "hvac-furnace", label: "HVAC / furnace", icon: I.Refrigerator },
          { id: "air-conditioner", label: "Air conditioner", icon: I.Refrigerator },
          { id: "water-heater", label: "Water heater (tank)", icon: I.Refrigerator },
          { id: "tankless-water-heater", label: "Tankless water heater", icon: I.Refrigerator },
        ],
      },
      { group: "Other", options: [OTHER_OPTION] },
    ],
    fields: [
      // HH-133: a MICROWAVE was being asked for fuel type and filter type. The
      // showWhen mechanism already existed and was used by other categories —
      // this one simply never used it, so every major appliance got every
      // field. Asking a question that cannot apply is its own small claim that
      // we do not know what the thing is.
      {
        key: "fuel_type",
        label: "Fuel type",
        type: "select",
        options: ["Electric", "Gas", "Dual"],
        showWhen: {
          subType: ["oven-range", "dryer", "hvac-furnace", "water-heater", "tankless-water-heater"],
        },
      },
      { key: "installation_date", label: "Installation date", type: "date" },
      {
        key: "filter_type",
        label: "Filter type",
        type: "text",
        placeholder: "e.g., MERV-13 20x25x1",
        showWhen: {
          subType: ["hvac-furnace", "air-conditioner", "range-hood", "refrigerator"],
        },
      },
      { key: "service_provider", label: "Service provider", type: "text" },
    ],
    taskGeneration: {
      defaultTier: "essential",
      taskCount: { min: 6, max: 12 },
      manualRelevance: "high",
      promptContext:
        "This is a major appliance requiring scheduled filter/coil/vent maintenance, professional service, and cleaning cycles.",
    },
  },
  {
    id: "small_appliance",
    label: "Small Appliance",
    icon: I.Coffee,
    description: "Countertop and portable appliances with lighter maintenance needs.",
    subTypes: [
      {
        group: "Kitchen",
        options: [
          { id: "coffee-maker", label: "Coffee maker", icon: I.Coffee },
          { id: "toaster", label: "Toaster", icon: I.Coffee },
          { id: "blender", label: "Blender", icon: I.Coffee },
          { id: "air-fryer", label: "Air fryer", icon: I.Coffee },
          { id: "instant-pot", label: "Instant Pot", icon: I.Coffee },
        ],
      },
      {
        group: "Personal care",
        options: [
          { id: "hair-dryer", label: "Hair dryer", icon: I.Coffee },
          { id: "flat-iron", label: "Flat iron", icon: I.Coffee },
          { id: "electric-shaver", label: "Electric shaver", icon: I.Coffee },
          { id: "electric-toothbrush", label: "Electric toothbrush", icon: I.Coffee },
        ],
      },
      {
        group: "Household",
        options: [
          { id: "vacuum", label: "Vacuum", icon: I.Coffee },
          { id: "iron", label: "Iron", icon: I.Coffee },
          { id: "humidifier", label: "Humidifier", icon: I.Coffee },
          { id: "air-purifier", label: "Air purifier", icon: I.Coffee },
        ],
      },
      { group: "Other", options: [OTHER_OPTION] },
    ],
    fields: [
      { key: "wattage", label: "Wattage", type: "number" },
      {
        key: "filter_type",
        label: "Filter type",
        type: "text",
        showWhen: { subType: ["air-purifier", "humidifier", "coffee-maker"] },
      },
      {
        key: "descaling_interval",
        label: "Descaling interval",
        type: "select",
        options: ["Monthly", "Quarterly", "N/A"],
        showWhen: { subType: ["coffee-maker", "humidifier", "iron"] },
      },
    ],
    taskGeneration: {
      defaultTier: "optional",
      taskCount: { min: 2, max: 4 },
      manualRelevance: "low",
      promptContext:
        "This is a small appliance. Only suggest tasks that are genuinely useful — descaling for water-contact appliances, filter replacement if applicable. Most small appliances need minimal maintenance. Do NOT suggest tasks just to fill a list.",
    },
  },
  {
    id: "fixture",
    label: "Fixture",
    icon: I.Bath,
    description: "Plumbing and mounted fixtures such as faucets, toilets, and fans.",
    subTypes: [
      {
        group: "Types",
        options: [
          { id: "faucet", label: "Faucet", icon: I.Bath },
          { id: "toilet", label: "Toilet", icon: I.Bath },
          { id: "showerhead", label: "Showerhead", icon: I.Bath },
          { id: "light-fixture", label: "Light fixture", icon: I.Lamp },
          { id: "ceiling-fan", label: "Ceiling fan", icon: I.Lamp },
          OTHER_OPTION,
        ],
      },
    ],
    fields: [
      {
        key: "finish",
        label: "Finish",
        type: "select",
        options: ["Chrome", "Brushed nickel", "Matte black", "Oil-rubbed bronze", "Brass", "Other"],
      },
      { key: "installation_date", label: "Installation date", type: "date" },
      {
        key: "bulb_type",
        label: "Bulb type",
        type: "text",
        placeholder: "e.g., LED BR30",
        showWhen: { subType: ["light-fixture", "ceiling-fan"] },
      },
      {
        key: "has_light",
        label: "Has integrated light kit",
        type: "toggle",
        showWhen: { subType: ["ceiling-fan"] },
      },
    ],
    taskGeneration: {
      defaultTier: "optional",
      taskCount: { min: 2, max: 4 },
      manualRelevance: "low",
      promptContext: "This is a home fixture. Suggest practical inspection and cleaning tasks only where they matter.",
    },
  },
  {
    id: "system",
    label: "System",
    icon: I.Cpu,
    description: "Whole-home systems: electrical, water, septic, solar, and filtration.",
    subTypes: [
      {
        group: "Systems",
        options: [
          { id: "electrical-panel", label: "Electrical panel", icon: I.Cpu },
          { id: "plumbing-main", label: "Plumbing main", icon: I.Cpu },
          { id: "sump-pump", label: "Sump pump", icon: I.Cpu },
          { id: "water-softener", label: "Water softener", icon: I.Cpu },
          { id: "whole-house-filter", label: "Whole-house filter", icon: I.Cpu },
          { id: "septic", label: "Septic", icon: I.Cpu },
          { id: "well-pump", label: "Well pump", icon: I.Cpu },
          { id: "solar-panels", label: "Solar panels", icon: I.Cpu },
          OTHER_OPTION,
        ],
      },
    ],
    fields: [
      { key: "installation_date", label: "Installation date", type: "date" },
      { key: "last_inspection", label: "Last inspection", type: "date" },
      { key: "service_provider", label: "Service provider", type: "text" },
      {
        key: "service_interval",
        label: "Service interval",
        type: "select",
        options: ["Annually", "Semi-annually", "Quarterly"],
      },
    ],
    taskGeneration: {
      defaultTier: "essential",
      taskCount: { min: 4, max: 8 },
      manualRelevance: "high",
      promptContext: "This is a home system requiring professional inspections and scheduled service.",
    },
  },
  {
    id: "structure",
    label: "Structure",
    icon: I.Home,
    description: "Building envelope and exterior: roof, windows, siding, and foundation.",
    subTypes: [
      {
        group: "Structure",
        options: [
          { id: "roof", label: "Roof", icon: I.Home },
          { id: "windows", label: "Windows", icon: I.Home },
          { id: "doors", label: "Doors", icon: I.Home },
          { id: "garage-door", label: "Garage door", icon: I.Home },
          { id: "deck", label: "Deck", icon: I.Home },
          { id: "siding", label: "Siding", icon: I.Home },
          { id: "fence", label: "Fence", icon: I.Home },
          { id: "gutters", label: "Gutters", icon: I.Home },
          { id: "foundation", label: "Foundation", icon: I.Home },
          OTHER_OPTION,
        ],
      },
    ],
    fields: [
      { key: "material", label: "Material", type: "text" },
      { key: "last_inspection", label: "Last inspection", type: "date" },
      { key: "contractor", label: "Contractor", type: "text" },
      {
        key: "warranty_type",
        label: "Warranty type",
        type: "select",
        options: ["Manufacturer", "Contractor", "Extended", "None"],
      },
      { key: "dimensions", label: "Dimensions", type: "text" },
    ],
    taskGeneration: {
      defaultTier: "recommended",
      taskCount: { min: 3, max: 6 },
      manualRelevance: "low",
      promptContext: "This is a structural home element. Focus on inspection, weather sealing, and seasonal upkeep.",
    },
  },
  {
    id: "outdoor",
    label: "Outdoor / Yard",
    icon: I.TreePine,
    description: "Outdoor power equipment, irrigation, grills, and pools.",
    subTypes: [
      {
        group: "Outdoor",
        options: [
          { id: "lawn-mower", label: "Lawn mower", icon: I.TreePine },
          { id: "snow-blower", label: "Snow blower", icon: I.TreePine },
          { id: "irrigation-system", label: "Irrigation system", icon: I.TreePine },
          { id: "grill", label: "Grill", icon: I.TreePine },
          { id: "pool-hot-tub", label: "Pool / hot tub", icon: I.TreePine },
          { id: "power-washer", label: "Power washer", icon: I.TreePine },
          { id: "chainsaw", label: "Chainsaw", icon: I.TreePine },
          OTHER_OPTION,
        ],
      },
    ],
    fields: [
      {
        key: "fuel_type",
        label: "Fuel type",
        type: "select",
        options: ["Gas", "Electric", "Battery", "Manual"],
      },
      { key: "seasonal_storage", label: "Seasonal storage", type: "toggle" },
      {
        key: "oil_type",
        label: "Oil type",
        type: "text",
        placeholder: "e.g., SAE 30",
        showWhen: { field: "fuel_type", value: "Gas" },
      },
    ],
    taskGeneration: {
      defaultTier: "recommended",
      taskCount: { min: 4, max: 8 },
      manualRelevance: "medium",
      promptContext: "This is outdoor or yard equipment. Include seasonal prep, blade/belt service, and battery/fuel care where relevant.",
    },
  },
  {
    id: "furniture",
    label: "Furniture",
    icon: I.Armchair,
    description: "Sofas, beds, desks, and storage furniture.",
    subTypes: [
      {
        group: "Furniture",
        options: [
          { id: "sofa", label: "Sofa", icon: I.Armchair },
          { id: "mattress", label: "Mattress", icon: I.Armchair },
          { id: "dining-table", label: "Dining table", icon: I.Armchair },
          { id: "desk", label: "Desk", icon: I.Armchair },
          { id: "cabinets", label: "Cabinets", icon: I.Armchair },
          { id: "bed-frame", label: "Bed frame", icon: I.Armchair },
          { id: "outdoor-furniture", label: "Outdoor furniture", icon: I.Armchair },
          OTHER_OPTION,
        ],
      },
    ],
    fields: [
      {
        key: "material",
        label: "Material",
        type: "select",
        options: ["Wood", "Fabric", "Leather", "Metal", "Upholstered", "Mixed"],
      },
      { key: "dimensions", label: "Dimensions", type: "text" },
      { key: "care_instructions", label: "Care instructions", type: "text" },
    ],
    taskGeneration: {
      defaultTier: "optional",
      taskCount: { min: 1, max: 3 },
      manualRelevance: "low",
      promptContext:
        "This is furniture. Only suggest genuinely useful care tasks — leather conditioning, mattress flipping, fabric protection. Keep it minimal.",
    },
  },
  {
    id: "media",
    label: "Media & Entertainment",
    icon: I.Tv,
    description: "TVs, audio, streaming devices, and gaming.",
    subTypes: [
      {
        group: "Media",
        options: [
          { id: "television", label: "TV", icon: I.Tv },
          { id: "soundbar", label: "Soundbar", icon: I.Tv },
          { id: "speakers", label: "Speakers", icon: I.Tv },
          { id: "projector", label: "Projector", icon: I.Tv },
          { id: "receiver-avr", label: "Receiver / AVR", icon: I.Tv },
          { id: "streaming-device", label: "Streaming device", icon: I.Tv },
          { id: "game-console", label: "Game console", icon: I.Tv },
          OTHER_OPTION,
        ],
      },
    ],
    fields: [
      {
        key: "connectivity",
        label: "Connectivity",
        type: "multi-select",
        options: ["HDMI", "Bluetooth", "WiFi", "Optical", "Wired"],
      },
      {
        key: "mount_type",
        label: "Mount type",
        type: "select",
        options: ["Wall", "Stand", "Shelf", "Ceiling", "N/A"],
        showWhen: { subType: ["television", "projector"] },
      },
      { key: "subscription", label: "Subscriptions / apps", type: "text" },
    ],
    taskGeneration: {
      defaultTier: "optional",
      taskCount: { min: 1, max: 3 },
      manualRelevance: "low",
      promptContext: "This is media or entertainment gear. Keep maintenance tasks minimal and practical.",
    },
  },
  {
    id: "smart_home",
    label: "Smart Home & Networking",
    icon: I.Wifi,
    description: "Routers, smart locks, cameras, hubs, and IoT devices.",
    subTypes: [
      {
        group: "Smart home",
        options: [
          { id: "router", label: "Router", icon: I.Wifi },
          { id: "mesh-system", label: "Mesh system", icon: I.Wifi },
          { id: "smart-thermostat", label: "Smart thermostat", icon: I.Wifi },
          { id: "smart-lock", label: "Smart lock", icon: I.Wifi },
          { id: "security-camera", label: "Security camera", icon: I.Wifi },
          { id: "smart-hub", label: "Smart hub", icon: I.Wifi },
          { id: "smart-plugs", label: "Smart plugs", icon: I.Wifi },
          { id: "doorbell-camera", label: "Doorbell camera", icon: I.Wifi },
          { id: "smart-toilet", label: "Smart toilet / bidet seat", icon: I.Wifi },
          OTHER_OPTION,
        ],
      },
    ],
    fields: [
      {
        key: "power_source",
        label: "Power source",
        type: "select",
        options: ["Wired", "Battery", "PoE", "Solar"],
      },
      {
        key: "battery_type",
        label: "Battery type",
        type: "text",
        showWhen: { field: "power_source", value: "Battery" },
      },
      { key: "account_app", label: "Account / app", type: "text" },
      { key: "firmware_auto_update", label: "Firmware auto-update", type: "toggle" },
    ],
    taskGeneration: {
      defaultTier: "recommended",
      taskCount: { min: 3, max: 5 },
      manualRelevance: "low",
      promptContext:
        "This is a smart home/networking device. Focus on firmware updates, battery replacement (if battery-powered), password rotation, and connectivity health checks.",
    },
  },
]

const CATEGORY_BY_ID = Object.fromEntries(ITEM_CATEGORIES.map((c) => [c.id, c])) as Record<
  ItemCategoryId,
  CategoryDefinition
>

export function getCategoryDefinition(id: ItemCategoryId): CategoryDefinition {
  return CATEGORY_BY_ID[id]
}

/** Legacy appliance grid ids (major + television) for specs.applianceTypeId */
export const LEGACY_APPLIANCE_TYPE_IDS = new Set([
  "refrigerator",
  "dishwasher",
  "oven-range",
  "microwave",
  "washing-machine",
  "dryer",
  "hvac-furnace",
  "air-conditioner",
  "water-heater",
  "garbage-disposal",
  "television",
  "other",
])

export function subTypeToLegacyApplianceTypeId(subType: string | null | undefined): string {
  if (!subType) return "other"
  return LEGACY_APPLIANCE_TYPE_IDS.has(subType) ? subType : "other"
}

export function getSubTypeLabel(categoryId: ItemCategoryId, subTypeId: string | null | undefined): string | null {
  if (!subTypeId) return null
  const def = CATEGORY_BY_ID[categoryId]
  for (const g of def.subTypes) {
    const opt = g.options.find((o) => o.id === subTypeId)
    if (opt) return opt.label
  }
  for (const cat of ITEM_CATEGORIES) {
    for (const g of cat.subTypes) {
      const opt = g.options.find((o) => o.id === subTypeId)
      if (opt) return opt.label
    }
  }
  return subTypeId
}

/**
 * Map free-text OCR category strings to typed category + subtype when possible.
 */
export function mapOcrCategoryToTyped(
  ocrCategory: string | null | undefined
): { itemCategory: ItemCategoryId | null; subType: string | null } {
  if (!ocrCategory) return { itemCategory: null, subType: null }
  const raw = ocrCategory.trim().toLowerCase()
  if (!raw) return { itemCategory: null, subType: null }

  for (const cat of ITEM_CATEGORIES) {
    for (const g of cat.subTypes) {
      for (const o of g.options) {
        if (o.id === raw || o.label.toLowerCase() === raw) {
          return { itemCategory: cat.id, subType: o.id }
        }
      }
    }
  }

  // ── Major appliances (order matters — more specific first) ─────────────────
  if (raw.includes("range hood") || raw.includes("rangehood") || raw.includes("vent hood") || raw.includes("exhaust hood")) {
    return { itemCategory: "major_appliance", subType: "range-hood" }
  }
  if (raw.includes("wine fridge") || raw.includes("wine cooler") || raw.includes("wine refrigerator")) {
    return { itemCategory: "major_appliance", subType: "wine-fridge" }
  }
  if (raw.includes("garbage disposal") || raw.includes("waste disposal") || (raw.includes("disposal") && !raw.includes("disposed"))) {
    return { itemCategory: "major_appliance", subType: "garbage-disposal" }
  }
  if (raw.includes("tankless") && (raw.includes("water") || raw.includes("heater"))) {
    return { itemCategory: "major_appliance", subType: "tankless-water-heater" }
  }
  if (raw.includes("water heater") || raw.includes("hot water tank")) {
    return { itemCategory: "major_appliance", subType: "water-heater" }
  }
  if (raw.includes("refrigerat") || raw.includes("fridge") || raw.includes("freezer")) {
    return { itemCategory: "major_appliance", subType: "refrigerator" }
  }
  if (raw.includes("dishwasher")) return { itemCategory: "major_appliance", subType: "dishwasher" }
  if (
    raw.includes("washing machine") ||
    raw.includes("clothes washer") ||
    raw.includes("laundry washer") ||
    (raw.includes("washer") && !raw.includes("power") && !raw.includes("pressure")) ||
    raw.includes("laundry")
  ) {
    return { itemCategory: "major_appliance", subType: "washing-machine" }
  }
  if (raw.includes("dryer")) return { itemCategory: "major_appliance", subType: "dryer" }
  if (raw.includes("microwave")) return { itemCategory: "major_appliance", subType: "microwave" }
  if (raw.includes("oven") || raw.includes("range") || raw.includes("stove") || raw.includes("cooktop") || raw.includes("cook top")) {
    return { itemCategory: "major_appliance", subType: "oven-range" }
  }
  if (raw.includes("hvac") || raw.includes("furnace") || raw.includes("heat pump") || raw.includes("boiler")) {
    return { itemCategory: "major_appliance", subType: "hvac-furnace" }
  }
  if (raw.includes("air conditioner") || raw.includes("a/c") || raw === "ac" || raw.includes("mini split") || raw.includes("mini-split")) {
    return { itemCategory: "major_appliance", subType: "air-conditioner" }
  }

  // ── Small appliances ───────────────────────────────────────────────────────
  if (raw.includes("coffee") || raw.includes("espresso")) return { itemCategory: "small_appliance", subType: "coffee-maker" }
  if (raw.includes("toaster")) return { itemCategory: "small_appliance", subType: "toaster" }
  if (raw.includes("blender")) return { itemCategory: "small_appliance", subType: "blender" }
  if (raw.includes("air fryer")) return { itemCategory: "small_appliance", subType: "air-fryer" }
  if (raw.includes("instant pot") || raw.includes("pressure cooker") || raw.includes("multi cooker")) {
    return { itemCategory: "small_appliance", subType: "instant-pot" }
  }
  if (raw.includes("hair dryer") || raw.includes("blow dryer")) return { itemCategory: "small_appliance", subType: "hair-dryer" }
  if (raw.includes("flat iron") || raw.includes("hair straightener") || raw.includes("curling iron")) {
    return { itemCategory: "small_appliance", subType: "flat-iron" }
  }
  if (raw.includes("electric shaver") || raw.includes("electric razor")) return { itemCategory: "small_appliance", subType: "electric-shaver" }
  if (raw.includes("electric toothbrush") || raw.includes("sonicare") || raw.includes("oral-b")) {
    return { itemCategory: "small_appliance", subType: "electric-toothbrush" }
  }
  if (raw.includes("vacuum") || raw.includes("robot vac")) return { itemCategory: "small_appliance", subType: "vacuum" }
  if (raw === "iron" || raw.includes("clothes iron") || raw.includes("steam iron")) {
    return { itemCategory: "small_appliance", subType: "iron" }
  }
  if (raw.includes("humidifier") || raw.includes("dehumidifier")) return { itemCategory: "small_appliance", subType: "humidifier" }
  if (raw.includes("air purifier") || raw.includes("air cleaner")) return { itemCategory: "small_appliance", subType: "air-purifier" }

  // ── Media ─────────────────────────────────────────────────────────────────
  if (raw.includes("television") || raw === "tv" || raw.includes(" tv") || raw.includes("smart tv")) {
    return { itemCategory: "media", subType: "television" }
  }
  if (raw.includes("soundbar") || raw.includes("sound bar")) return { itemCategory: "media", subType: "soundbar" }
  if (raw.includes("speaker")) return { itemCategory: "media", subType: "speakers" }
  if (raw.includes("projector")) return { itemCategory: "media", subType: "projector" }
  if (raw.includes("receiver") || raw.includes("avr") || raw.includes("a/v receiver")) {
    return { itemCategory: "media", subType: "receiver-avr" }
  }
  if (raw.includes("streaming") || raw.includes("roku") || raw.includes("apple tv") || raw.includes("chromecast") || raw.includes("fire tv")) {
    return { itemCategory: "media", subType: "streaming-device" }
  }
  if (raw.includes("game console") || raw.includes("playstation") || raw.includes("xbox") || raw.includes("nintendo")) {
    return { itemCategory: "media", subType: "game-console" }
  }

  // ── Smart home ────────────────────────────────────────────────────────────
  if (raw.includes("bidet") || raw.includes("smart toilet") || raw.includes("washlet")) {
    return { itemCategory: "smart_home", subType: "smart-toilet" }
  }
  if (raw.includes("mesh")) return { itemCategory: "smart_home", subType: "mesh-system" }
  if (raw.includes("router") || raw.includes("wifi") || raw.includes("access point")) {
    return { itemCategory: "smart_home", subType: "router" }
  }
  if (raw.includes("thermostat")) return { itemCategory: "smart_home", subType: "smart-thermostat" }
  if (raw.includes("smart lock") || raw.includes("door lock")) return { itemCategory: "smart_home", subType: "smart-lock" }
  if (raw.includes("doorbell")) return { itemCategory: "smart_home", subType: "doorbell-camera" }
  if (raw.includes("security camera") || raw.includes("nest cam") || raw.includes("ring cam") || raw.includes("wyze cam")) {
    return { itemCategory: "smart_home", subType: "security-camera" }
  }
  if (raw.includes("smart hub") || raw.includes("hubitat") || raw.includes("smartthings")) {
    return { itemCategory: "smart_home", subType: "smart-hub" }
  }
  if (raw.includes("smart plug")) return { itemCategory: "smart_home", subType: "smart-plugs" }

  // ── Fixtures ──────────────────────────────────────────────────────────────
  if (raw.includes("ceiling fan")) return { itemCategory: "fixture", subType: "ceiling-fan" }
  if (raw.includes("light fixture") || raw.includes("chandelier") || raw.includes("pendant light") || raw.includes("sconce")) {
    return { itemCategory: "fixture", subType: "light-fixture" }
  }
  if (raw.includes("faucet") || raw.includes("tap")) return { itemCategory: "fixture", subType: "faucet" }
  if (raw.includes("toilet")) return { itemCategory: "fixture", subType: "toilet" }
  if (raw.includes("showerhead") || raw.includes("shower head")) return { itemCategory: "fixture", subType: "showerhead" }

  // ── Outdoor ───────────────────────────────────────────────────────────────
  if (raw.includes("lawn mower") || raw.includes("lawnmower") || raw.includes("mower")) {
    return { itemCategory: "outdoor", subType: "lawn-mower" }
  }
  if (raw.includes("snow blower") || raw.includes("snowblower") || raw.includes("snow thrower")) {
    return { itemCategory: "outdoor", subType: "snow-blower" }
  }
  if (raw.includes("irrigation") || raw.includes("sprinkler")) return { itemCategory: "outdoor", subType: "irrigation-system" }
  if (raw.includes("grill") || raw.includes("bbq") || raw.includes("barbecue")) return { itemCategory: "outdoor", subType: "grill" }
  if (raw.includes("hot tub") || raw.includes("pool") || raw.includes("spa")) return { itemCategory: "outdoor", subType: "pool-hot-tub" }
  if (raw.includes("power washer") || raw.includes("pressure washer")) return { itemCategory: "outdoor", subType: "power-washer" }
  if (raw.includes("chainsaw") || raw.includes("chain saw")) return { itemCategory: "outdoor", subType: "chainsaw" }

  // ── Systems ───────────────────────────────────────────────────────────────
  if (raw.includes("sump pump")) return { itemCategory: "system", subType: "sump-pump" }
  if (raw.includes("water softener")) return { itemCategory: "system", subType: "water-softener" }
  if (raw.includes("whole house filter") || raw.includes("whole-house filter")) {
    return { itemCategory: "system", subType: "whole-house-filter" }
  }
  if (raw.includes("septic")) return { itemCategory: "system", subType: "septic" }
  if (raw.includes("well pump")) return { itemCategory: "system", subType: "well-pump" }
  if (raw.includes("solar panel") || raw.includes("solar array")) return { itemCategory: "system", subType: "solar-panels" }
  if (raw.includes("electrical panel") || raw.includes("breaker panel") || raw.includes("circuit panel")) {
    return { itemCategory: "system", subType: "electrical-panel" }
  }

  // ── Generic fallbacks ─────────────────────────────────────────────────────
  if (raw.includes("fixture")) return { itemCategory: "fixture", subType: "other" }
  if (raw.includes("appliance")) return { itemCategory: "major_appliance", subType: "other" }

  return { itemCategory: null, subType: null }
}

export function mapApplianceTypeIdToCategory(
  applianceTypeId: string | null | undefined
): { itemCategory: ItemCategoryId | null; subType: string | null } {
  if (!applianceTypeId || applianceTypeId === "other") return { itemCategory: null, subType: null }
  if (applianceTypeId === "television") return { itemCategory: "media", subType: "television" }
  if (LEGACY_APPLIANCE_TYPE_IDS.has(applianceTypeId) && applianceTypeId !== "television") {
    return { itemCategory: "major_appliance", subType: applianceTypeId }
  }
  return { itemCategory: null, subType: null }
}

/**
 * Suggests a canonical room-name hint for a detected sub-type, for name-first quick
 * add. Returned hint is matched case-insensitively (substring both ways) against the
 * home's actual rooms — so "Laundry" matches a "Laundry Room". Returns null for
 * sub-types with no strong room association (systems, structure, smart home, etc.).
 */
export function suggestedRoomForSubType(subType: string | null | undefined): string | null {
  if (!subType) return null
  const KITCHEN = new Set(["refrigerator", "wine-fridge", "dishwasher", "oven-range", "microwave", "range-hood", "garbage-disposal", "coffee-maker", "toaster", "blender", "air-fryer", "instant-pot"])
  const LAUNDRY = new Set(["washing-machine", "dryer"])
  const BATHROOM = new Set(["faucet", "toilet", "showerhead", "hair-dryer", "flat-iron", "electric-shaver", "electric-toothbrush", "smart-toilet"])
  const OUTDOOR = new Set(["lawn-mower", "snow-blower", "irrigation-system", "grill", "pool-hot-tub", "power-washer", "chainsaw"])
  const LIVING = new Set(["television", "soundbar", "speakers", "projector", "receiver-avr", "streaming-device", "game-console"])
  if (KITCHEN.has(subType)) return "Kitchen"
  if (LAUNDRY.has(subType)) return "Laundry"
  if (BATHROOM.has(subType)) return "Bathroom"
  if (OUTDOOR.has(subType)) return "Outdoor"
  if (LIVING.has(subType)) return "Living"
  return null
}

export function legacyCategoryLabelFromItemCategory(id: ItemCategoryId | null | undefined): string {
  if (!id) return "General"
  return ITEM_CATEGORIES.find((c) => c.id === id)?.label ?? "General"
}

// ── Legacy 12-tile grid (major_appliance + television) — backward compat ─────

export interface ApplianceTypeOption {
  id: string
  label: string
  icon: LucideIcon
}

const legacyIcons = {
  Snowflake,
  UtensilsCrossed,
  Flame,
  Radio,
  Shirt,
  Wind,
  Thermometer,
  Droplets,
  Trash2,
  Tv,
  Home,
}

/** @deprecated Prefer ITEM_CATEGORIES + CategoryPicker; kept for older call sites */
export const APPLIANCE_TYPES: ApplianceTypeOption[] = [
  { id: "refrigerator", label: "Refrigerator", icon: legacyIcons.Snowflake },
  { id: "dishwasher", label: "Dishwasher", icon: legacyIcons.UtensilsCrossed },
  { id: "oven-range", label: "Oven/Range", icon: legacyIcons.Flame },
  { id: "microwave", label: "Microwave", icon: legacyIcons.Radio },
  { id: "washing-machine", label: "Washing Machine", icon: legacyIcons.Shirt },
  { id: "dryer", label: "Dryer", icon: legacyIcons.Wind },
  { id: "hvac-furnace", label: "HVAC/Furnace", icon: legacyIcons.Thermometer },
  { id: "air-conditioner", label: "Air Conditioner", icon: legacyIcons.Snowflake },
  { id: "water-heater", label: "Water Heater", icon: legacyIcons.Droplets },
  { id: "garbage-disposal", label: "Garbage Disposal", icon: legacyIcons.Trash2 },
  { id: "television", label: "Television", icon: legacyIcons.Tv },
  { id: "other", label: "Other", icon: legacyIcons.Home },
]
