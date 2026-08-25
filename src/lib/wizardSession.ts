const STORAGE_KEY = "homehub-smart-add-session"

export type WizardStep =
  | "identify"
  | "manual"
  | "parsing"
  | "review"

/**
 * Steps that no longer exist. A session saved before the round 11–13 rebuild
 * can still be sitting in localStorage naming one of these, and resuming it
 * used to drop the user into a retired screen — the single most reliable way
 * to meet an old design in this app.
 */
const RETIRED_STEPS = new Set(["plan", "purchase"])

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

function normalizeWizardSession(parsed: WizardSession): WizardSession {
  return {
    ...parsed,
    // A retired step resolves to the last step that still exists rather than
    // to a screen we deleted. "manual" is the right landing: it is where both
    // retired steps followed from, and the item page takes over after it.
    step: RETIRED_STEPS.has(parsed.step as string) ? "manual" : parsed.step,
    purchaseDate: parsed.purchaseDate ?? null,
    purchasePrice:
      typeof parsed.purchasePrice === "number" && !Number.isNaN(parsed.purchasePrice)
        ? parsed.purchasePrice
        : null,
    parseConfidence: parsed.parseConfidence ?? null,
  }
}

export function getWizardSession(): WizardSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as WizardSession
    return normalizeWizardSession(parsed)
  } catch {
    return null
  }
}

export function setWizardSession(session: WizardSession): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
}

export function updateWizardSession(updates: Partial<WizardSession>): void {
  const current = getWizardSession()
  if (!current) return
  setWizardSession({ ...current, ...updates })
}

export function clearWizardSession(): void {
  localStorage.removeItem(STORAGE_KEY)
}
