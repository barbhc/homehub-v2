/**
 * An extractor may not report a brand or model it did not read.
 *
 * The owner scanned an LG dryer and the form filled in "Whirlpool". The model,
 * WM3900HBA, was correct — it is printed as plain text and the OCR read it.
 * The brand was not read at all: LG's wordmark is a stylised logo, Google
 * Vision transcribes plain text well and logos poorly, so the string "LG" never
 * reached the extractor. Asked for a brand on a laundry nameplate that did not
 * contain one, the model produced the most plausible laundry brand available to
 * it — and one was sitting in its own prompt as an example.
 *
 * Removing that example helps. It does not fix the class: an extractor that MAY
 * invent will eventually invent, and the next wrong answer will not have a
 * convenient source to blame. So this is a grounding check rather than a
 * wording change. In the text path the source is known exactly, and a value
 * absent from it was not read — it was produced.
 *
 * Null is the honest answer. A blank field asks the user; a wrong one lies to
 * them, and then flows into the item's name, the product lookup and the parse.
 *
 * NOT applied to the image path: there the model sees the logo the OCR missed,
 * which is the entire reason that fallback exists.
 */

export type GroundableExtraction = {
  brand: string | null
  model: string | null
  name: string | null
}

/** Letters and digits only, uppercased — so "WM-3900 HBA" and "WM3900HBA" are
 *  the same string, and punctuation drift cannot fake a mismatch. */
function squash(v: string): string {
  return v.replace(/[^a-z0-9]/gi, "").toUpperCase()
}

export function groundInText<T extends GroundableExtraction>(e: T, text: string): T {
  const haystack = squash(text)
  const present = (v: string | null) => !!v && squash(v).length > 0 && haystack.includes(squash(v))
  const brand = present(e.brand) ? e.brand : null
  const model = present(e.model) ? e.model : null
  // The name is composed from brand + model, so it inherits their evidence:
  // dropping it avoids leaving "Whirlpool WM3900HBA" behind after the brand
  // that produced it has been removed.
  const name = brand === e.brand && model === e.model ? e.name : null
  return { ...e, brand, model, name }
}
