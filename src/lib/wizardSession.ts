const STORAGE_KEY = "homehub-smart-add-session"

/**
 * The steps the wizard actually has. Two, because the wizard ends at the manual
 * and the item page takes over (`docs/add-item-flow.md`, "The wizard ends here").
 *
 * `parsing` and `review` were in this union until 2026-10-29 although nothing
 * had written them since the wizard stopped waiting on the parse. A union that
 * advertises screens the app does not have is how the resume path below came to
 * look correct while being dead.
 */
export type WizardStep = "identify" | "manual"

/**
 * Steps a stored session can name that this build has no screen for — the
 * retired ones (`plan`, `purchase`) and the two the wizard stopped using
 * (`parsing`, `review`).
 *
 * They all mean the same thing: the item exists and the wizard is behind it.
 */
export const PAST_THE_WIZARD = ["plan", "purchase", "parsing", "review"] as const

/** Where Continue on the resume prompt should actually go. */
export type ResumeTarget =
  /** Back into the wizard, at this step. */
  | { at: "step"; step: WizardStep }
  /** Nothing is left to resume INTO: the item page is where the flow ends. */
  | { at: "item" }

/**
 * Classify a stored step. This is the whole fix for a bug that survived two
 * attempts at it.
 *
 * A session saved on the retired Purchase step has nothing to resume into — the
 * item exists, its manual is attached, and purchase details moved to the item
 * page's Details sheet — so `SmartAddItem` had a branch sending it to
 * `/items/:id`. But the read path resolved every retired step to `"manual"`
 * BEFORE that branch could see it, so the branch was unreachable and the user
 * was dropped back on "Add the manual" for an item whose manual was already
 * there. Resolving a step forward and then testing for it are two halves of one
 * decision, and they were in two files.
 *
 * An unrecognized step lands here too, rather than being installed into React
 * state: a session written by a newer build, or restored half-formed, used to
 * render the wizard's header over nothing at all.
 */
export function resumeTarget(step: unknown): ResumeTarget {
  if (step === "identify" || step === "manual") return { at: "step", step }
  // Everything else — the steps in PAST_THE_WIZARD and anything unrecognized.
  // Listing the known ones would not make this safer, only narrower: a step we
  // have never seen is in exactly the same position as one we deleted.
  return { at: "item" }
}

/**
 * Subset of ParsedConfidence persisted alongside the wizard session so a
 * reloaded review step can decide whether to show briefing cards vs. the
 * low-confidence fallback without re-running the parse.
 */
export type WizardConfidence = {
  overall?: number
  safety?: number
  how_to?: number
  care?: number
  troubleshooting?: number
  notes?: string
}

/** A session as the wizard WRITES it. */
export type WizardSession = {
  itemId: string
  propertyId: string
  step: WizardStep
  itemName: string
  brand: string | null
  model: string | null
  locationId: string | null
  /** Typed inventory category (optional for sessions created before standardization) */
  itemCategory?: string | null
  subType?: string | null
  categoryFields?: Record<string, unknown>
  /** ISO date string or empty (sessions before Arc 2 omit this) */
  purchaseDate?: string | null
  purchasePrice?: number | null
  hasManual: boolean
  hasTasks: boolean
  /** Parse confidence scores (sessions before Arc 3 omit this) */
  parseConfidence?: WizardConfidence | null
  createdAt: string
}

/**
 * A session as it is READ.
 *
 * `step` is deliberately absent. A stored step may name a screen this build
 * does not have, and quietly resolving it to a live one is exactly what sent
 * people back into the flow; `resume` is the only answer to "where does this
 * go", and no caller can read a step that was never stored.
 */
export type ResumedSession = Omit<WizardSession, "step"> & { resume: ResumeTarget }

const asString = (v: unknown): string | null => (typeof v === "string" ? v : null)
const asNullableString = (v: unknown): string | null => (typeof v === "string" && v ? v : null)

/**
 * Read the stored JSON into a known shape.
 *
 * It was `JSON.parse(raw) as WizardSession` — a cast at a serialization
 * boundary, which the project's rules call a review-blocking defect, and for
 * the usual reason: the type said the fields were there and nothing checked.
 * A session missing its `itemId` or `propertyId` has nothing to resume (the
 * first says which item it made, the second which home it belongs to), so it
 * is no session at all rather than a half-populated one.
 */
function readStored(raw: unknown): { fields: Omit<WizardSession, "step">; step: unknown } | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>
  const itemId = asNullableString(r.itemId)
  const propertyId = asNullableString(r.propertyId)
  if (!itemId || !propertyId) return null
  return {
    step: r.step,
    fields: {
      itemId,
      propertyId,
      itemName: asString(r.itemName) ?? "",
      brand: asNullableString(r.brand),
      model: asNullableString(r.model),
      locationId: asNullableString(r.locationId),
      itemCategory: asNullableString(r.itemCategory),
      subType: asNullableString(r.subType),
      categoryFields: r.categoryFields && typeof r.categoryFields === "object" ? (r.categoryFields as Record<string, unknown>) : {},
      purchaseDate: asNullableString(r.purchaseDate),
      purchasePrice: typeof r.purchasePrice === "number" && !Number.isNaN(r.purchasePrice) ? r.purchasePrice : null,
      hasManual: r.hasManual === true,
      hasTasks: r.hasTasks === true,
      parseConfidence: r.parseConfidence && typeof r.parseConfidence === "object" ? (r.parseConfidence as WizardConfidence) : null,
      createdAt: asString(r.createdAt) ?? "",
    },
  }
}

function parseStorage(): { fields: Omit<WizardSession, "step">; step: unknown } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return readStored(JSON.parse(raw))
  } catch {
    // Unreadable or corrupt session: the wizard starts fresh rather than half-resumed.
    return null
  }
}

export function getWizardSession(): ResumedSession | null {
  const stored = parseStorage()
  if (!stored) return null
  return { ...stored.fields, resume: resumeTarget(stored.step) }
}

export function setWizardSession(session: WizardSession): void {
  // Written field by field so nothing a caller happens to be holding — a read
  // session's `resume`, a stale key from an older shape — accumulates in
  // storage and comes back as something the read path has to defend against.
  const stored: WizardSession = {
    itemId: session.itemId,
    propertyId: session.propertyId,
    step: session.step,
    itemName: session.itemName,
    brand: session.brand,
    model: session.model,
    locationId: session.locationId,
    itemCategory: session.itemCategory ?? null,
    subType: session.subType ?? null,
    categoryFields: session.categoryFields ?? {},
    purchaseDate: session.purchaseDate ?? null,
    purchasePrice: session.purchasePrice ?? null,
    hasManual: session.hasManual,
    hasTasks: session.hasTasks,
    parseConfidence: session.parseConfidence ?? null,
    createdAt: session.createdAt,
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
}

export function updateWizardSession(updates: Partial<WizardSession>): void {
  const stored = parseStorage()
  if (!stored) return
  // An update means the session is in active use, so a step that is past the
  // wizard resolves to the last step that still exists — the caller is about
  // to overwrite it or is working at that step already.
  const target = resumeTarget(stored.step)
  const step: WizardStep = target.at === "step" ? target.step : "manual"
  setWizardSession({ ...stored.fields, step, ...updates })
}

export function clearWizardSession(): void {
  localStorage.removeItem(STORAGE_KEY)
}
