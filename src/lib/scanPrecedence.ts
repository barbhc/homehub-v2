/**
 * Who wins when a label photo disagrees with what was typed.
 *
 * HH-139 (owner): "I had selected GE Café first, but then I decided to go with
 * the photo of the label. It should be obvious from the photo that it's actually
 * Bosch and not GE Café so if somebody chooses to snap a photo of the label it
 * should overwrite what was ever put in the brand and model number."
 *
 * The old rule was `typed || scanned` — whatever was already there won. So a
 * photo of a Bosch nameplate left her typed "GE Café" in place above model
 * SHPM65Z55N/01, and that PAIR is worse than either field alone: it is a product
 * that does not exist, and it would have been saved that way.
 *
 * So brand and model move together, as one unit. They describe a single
 * nameplate; taking one from the photo and one from memory is what manufactures
 * the chimera. Photographing the plate is a deliberate act and it supersedes
 * typing.
 *
 * Deliberately NOT a general "scan always wins" rule — only these two fields
 * travel as a pair. A receipt scan's date or price has no business overwriting
 * something the user chose, and that stays fill-blanks-only at the call site.
 */

export interface Identity {
  brand: string
  model: string
}

export interface ScannedIdentity {
  brand?: string | null
  model?: string | null
}

/**
 * Merge a scan into what the user typed.
 *
 * A scan that identified the product AT ALL replaces both fields — including
 * replacing one with blank, which is the case that prevents the chimera. A scan
 * that identified neither changes nothing.
 */
export function applyScannedIdentity(typed: Identity, scanned: ScannedIdentity): Identity {
  const brand = (scanned.brand ?? "").trim()
  const model = (scanned.model ?? "").trim()
  const identifiedSomething = brand.length > 0 || model.length > 0
  if (!identifiedSomething) return typed
  return { brand, model }
}

/**
 * How many of the two the scan actually CHANGED.
 *
 * Counted as changed rather than filled: after this rule a scan can replace a
 * field that was not blank, and telling someone we "filled 0 fields" right after
 * overwriting two of them is the screen disagreeing with itself.
 */
export function scannedFieldsChanged(typed: Identity, next: Identity): number {
  let n = 0
  if (typed.brand !== next.brand && next.brand) n += 1
  if (typed.model !== next.model && next.model) n += 1
  return n
}
