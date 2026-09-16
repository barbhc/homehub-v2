/**
 * Warranty questions in Ask, answered from what the app already knows.
 *
 * chatQuery ranks and feeds knowledge CHUNKS — care, how-to, troubleshooting,
 * reference. The parser writes warranty facts to the ITEM instead (duration,
 * coverage, exclusions, registration), and the owner adds the purchase and
 * expiry dates by hand on the item page. So "what does the warranty cover?"
 * searched a corpus that structurally could not hold the answer while the
 * answer sat on the same item's Warranty panel (found 2026-08-27; BACKLOG
 * "Ask cannot answer warranty questions, though the app knows the answer").
 *
 * This module turns those item fields into a block the model can quote, with
 * the date arithmetic done here rather than left to the model. It adds nothing
 * when the question is not about warranty, so the ordinary retrieval path is
 * untouched for every other question.
 */

const WARRANTY_QUESTION =
  /\b(warrant(?:y|ies|ied)|guarantee[ds]?|still covered|covered (?:by|under)|coverage (?:period|end|expire)|registration card|register(?:ed|ing)? (?:the |my |this )?(?:product|appliance|item|unit|purchase))\b/i

/** True when the question is about warranty terms, coverage or registration. */
export function isWarrantyQuestion(question: string): boolean {
  return WARRANTY_QUESTION.test(question)
}

export interface WarrantyFacts {
  itemName: string
  durationMonths: number | null
  coverage: string | null
  exclusions: string[]
  registrationRequired: boolean | null
  registeredAt: string | null
  purchaseDate: string | null
  /** Explicit on the item, or derived from purchase date + duration. */
  expiryDate: string | null
  expiryDerived: boolean
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function isoDate(v: unknown): string | null {
  if (typeof v !== "string") return null
  const s = v.trim().slice(0, 10)
  return ISO_DATE.test(s) ? s : null
}

/**
 * Calendar months, not 30-day blocks — the same rule the item page uses
 * (src/lib/warrantyWindow.ts): a 24-month warranty bought on 14 Feb runs to
 * 14 Feb. UTC arithmetic so the server's clock cannot shift the day.
 */
export function addMonths(isoFrom: string, months: number | null): string | null {
  if (!ISO_DATE.test(isoFrom) || months == null || months <= 0) return null
  const [y, m, d] = isoFrom.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1 + months, d)).toISOString().slice(0, 10)
}

function daysBetween(fromIso: string, toIso: string): number {
  const [fy, fm, fd] = fromIso.split("-").map(Number)
  const [ty, tm, td] = toIso.split("-").map(Number)
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000)
}

/**
 * Reads an item document's warranty fields (Firestore camelCase). Returns null
 * when the item has no warranty terms on record — a purchase date alone is not
 * a warranty, and saying nothing beats a half answer.
 */
export function warrantyFactsFromDoc(itemName: string, get: (field: string) => unknown): WarrantyFacts | null {
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null)
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null)
  const durationMonths = num(get("warrantyDurationMonths"))
  const coverage = str(get("warrantyCoverage"))
  const exclusionsRaw = get("warrantyExclusions")
  const exclusions = Array.isArray(exclusionsRaw)
    ? exclusionsRaw.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim())
    : []
  const regRaw = get("warrantyRegistrationRequired")
  const registrationRequired = typeof regRaw === "boolean" ? regRaw : null
  const registeredAt = isoDate(get("warrantyRegisteredAt"))
  const purchaseDate = isoDate(get("purchaseDate"))
  const explicitExpiry = isoDate(get("warrantyExpiryDate"))

  const hasTerms = durationMonths != null || coverage != null || exclusions.length > 0 || registrationRequired != null || explicitExpiry != null
  if (!hasTerms) return null

  const derived = explicitExpiry == null && purchaseDate != null ? addMonths(purchaseDate, durationMonths) : null
  return {
    itemName,
    durationMonths,
    coverage,
    exclusions,
    registrationRequired,
    registeredAt,
    purchaseDate,
    expiryDate: explicitExpiry ?? derived,
    expiryDerived: explicitExpiry == null && derived != null,
  }
}

function coverageLine(f: WarrantyFacts): string {
  const length = f.durationMonths == null
    ? null
    : f.durationMonths % 12 === 0
      ? `${f.durationMonths / 12} year${f.durationMonths === 12 ? "" : "s"}`
      : `${f.durationMonths} months`
  if (length && f.coverage) return `- Coverage: ${length} — ${f.coverage}`
  if (length) return `- Coverage: ${length}`
  if (f.coverage) return `- Coverage: ${f.coverage}`
  return "- Coverage: length not on record"
}

function expiryLine(f: WarrantyFacts, todayIso: string): string {
  if (f.expiryDate) {
    const days = daysBetween(todayIso, f.expiryDate)
    const basis = f.expiryDerived && f.purchaseDate
      ? ` (from the purchase date ${f.purchaseDate} plus ${f.durationMonths} months)`
      : ""
    if (days < 0) return `- Status: EXPIRED on ${f.expiryDate}, ${-days} days ago${basis}`
    if (days === 0) return `- Status: expires TODAY, ${f.expiryDate}${basis}`
    return `- Status: in force — expires ${f.expiryDate}, in ${days} days${basis}`
  }
  if (f.purchaseDate) return `- Status: purchased ${f.purchaseDate}; no end date on record`
  return "- Status: no purchase or expiry date on record, so whether it is still in force is unknown"
}

/**
 * The block the model reads. Empty string when there is nothing to say, so
 * callers can treat it like the optional web-search block.
 */
export function formatWarrantyBlock(facts: WarrantyFacts[], todayIso: string): string {
  if (facts.length === 0) return ""
  const parts = ["---", `## Warranty on record (what the app has stored, as of ${todayIso})`]
  for (const f of facts) {
    parts.push(`### ${f.itemName}`, coverageLine(f), expiryLine(f, todayIso))
    if (f.exclusions.length > 0) parts.push(`- Not covered: ${f.exclusions.join("; ")}`)
    if (f.registrationRequired === true) {
      parts.push(f.registeredAt ? `- Registration: required — registered ${f.registeredAt}` : "- Registration: required — no registration date on record")
    } else if (f.registrationRequired === false) {
      parts.push("- Registration: not required")
    }
  }
  parts.push("---")
  return parts.join("\n")
}
