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
 * See supabase/functions/product-lookup/index.ts for the server side.
 */

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

export type ProductLookupResult = {
  safe: ProductLookupSafeFields
  candidates: ProductLookupCandidate[]
  knowledgeConfidence: KnowledgeConfidence
  source: "llm" | "cache"
  cacheHit: boolean
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

export async function lookupProduct(input: ProductLookupInput): Promise<ProductLookupResponse> {
  const brand = input.brand.trim()
  const model = input.model.trim()
  if (brand.length < 2 || model.length < 2) {
    return { data: null, error: { message: "brand and model required (min 2 chars)" } }
  }

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const { supabase } = await import("@/integrations/shim/client")
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const token = session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY

  if (!supabaseUrl || !token) {
    return { data: null, error: { message: "Product lookup not configured" } }
  }

  try {
    const res = await fetch(`${supabaseUrl.replace(/\/$/, "")}/functions/v1/product-lookup`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        brand,
        model,
        category: input.category ?? null,
        subType: input.subType ?? null,
      }),
    })

    const rawText = await res.text().catch(() => "")
    let parsed: (ProductLookupResult & { error?: string }) | { error?: string } | null = null
    try {
      parsed = rawText ? JSON.parse(rawText) : null
    } catch {
      // non-JSON body
    }

    if (!res.ok) {
      const msg =
        (parsed as { error?: string } | null)?.error ??
        (rawText ? rawText.slice(0, 200) : `HTTP ${res.status}`)
      return { data: null, error: { message: msg, status: res.status } }
    }
    if (parsed && "error" in parsed && parsed.error) {
      return { data: null, error: { message: parsed.error } }
    }
    if (!parsed || typeof parsed !== "object" || !("safe" in parsed)) {
      return { data: null, error: { message: "Empty or malformed response" } }
    }
    return { data: parsed as ProductLookupResult, error: null }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Product lookup failed"
    return { data: null, error: { message } }
  }
}
