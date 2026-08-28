/**
 * productLookupService — client wrapper for the product-lookup edge function.
 *
 * Given a brand + model (optionally with category context), returns
 * structured spec suggestions from Claude. The edge function returns two
 * tiers of output:
 *
 *   - safe:       low-harm fields (category, subType) meant to be
 *                 auto-applied by the caller if the user hasn't already set
 *                 them. Applying the wrong category is easy to correct.
 *
 *   - candidates: numeric/textual specs (wattage, filter_size, MERV, …) the
 *                 user must REVIEW and explicitly accept per field. We never
 *                 silently overwrite a filter size — hallucinated specs can
 *                 cause the user to buy the wrong part.
 *
 * See firebase/functions/src/ai/productLookup.ts for the server side.
 */

import { callable } from "@/integrations/firebase"
import type { ItemCategoryId } from "@/modules/inventory/constants/itemCategories"

export type ProductLookupCategory = ItemCategoryId

export type KnowledgeConfidence = "high" | "medium" | "low"

export type ProductLookupSafeFields = {
  category: ProductLookupCategory | null
  subType: string | null
}

/** A spec the user should review and accept explicitly. */
export type ProductLookupCandidate = {
  key: string
  label: string
  value: string | number | boolean
  rationale: string | null
}

/** Layered identity resolution (server: Icecat → Brave → Haiku). */
export type ProductIdentity = {
  name: string
  /** Free-text category hint — map with mapOcrCategoryToTyped client-side. */
  rawCategory: string | null
  source: "icecat" | "brave" | "claude"
  confidence: KnowledgeConfidence
}

/** Full model numbers a partial model might be ("WM4000H" → "WM4000HWA"). */
export type VariantCandidate = {
  model: string
  differentiator: string | null
}

/** A brand derived from the model number alone, with its evidence. */
export type DerivedBrand = { brand: string; agreeing: number } | null

export type ProductLookupResult = {
  safe: ProductLookupSafeFields
  candidates: ProductLookupCandidate[]
  knowledgeConfidence: KnowledgeConfidence
  /** null = genuine miss (every layer struck out). */
  identity: ProductIdentity | null
  variantCandidates: VariantCandidate[]
  source: "llm" | "cache"
  cacheHit: boolean
  /** Only in brand-only mode. A suggestion — never applied for the user. */
  brandSuggestion?: DerivedBrand
}

export type ProductLookupResponse =
  | { data: ProductLookupResult; error: null }
  | { data: null; error: { message: string; status?: number } }

export type ProductLookupInput = {
  brand: string
  model: string
  category?: ProductLookupCategory | null
  subType?: string | null
}

const lookupProductCallable = callable<
  { brand: string; model: string; category: string | null; subType: string | null },
  ProductLookupResult
>("productLookup")

export async function lookupProduct(input: ProductLookupInput): Promise<ProductLookupResponse> {
  const brand = input.brand.trim()
  const model = input.model.trim()
  if (brand.length < 2 || model.length < 2) {
    return { data: null, error: { message: "brand and model required (min 2 chars)" } }
  }

  try {
    const data = await lookupProductCallable({
      brand,
      model,
      category: input.category ?? null,
      subType: input.subType ?? null,
    })
    if (!data || typeof data !== "object" || !("safe" in data)) {
      return { data: null, error: { message: "Empty or malformed response" } }
    }
    // Normalize fields older deployed functions won't send yet — the client
    // must treat "identity unknown" as absent, not crash on undefined.
    return {
      data: {
        ...data,
        identity: data.identity ?? null,
        variantCandidates: Array.isArray(data.variantCandidates) ? data.variantCandidates : [],
      },
      error: null,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Product lookup failed"
    return { data: null, error: { message } }
  }
}

/**
 * Who makes this model? For a scan that read the model and not the brand.
 *
 * LG prints its wordmark as a logo the OCR cannot transcribe, so a perfectly
 * good label can yield "WM3900HBA" and no manufacturer. Rather than let the
 * extractor guess — which is how an LG dryer once became a Whirlpool — the
 * model number goes to the same resolver the identity lookup uses, and comes
 * back with a brand only when the evidence agrees with itself.
 *
 * Returns null for every failure, including "no idea". A suggestion that does
 * not appear costs nothing; a wrong one costs the item's name, its lookup and
 * its tasks.
 */
export async function lookupBrandForModel(model: string): Promise<string | null> {
  const trimmed = model.trim()
  if (trimmed.length < 5) return null
  const res = await lookupProduct({ brand: "", model: trimmed })
  if (res.error) return null
  return res.data.brandSuggestion?.brand ?? null
}
