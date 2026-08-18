/**
 * Model-family reasoning for the identity resolver.
 *
 * Lives in shared/ (like productTitle.ts) so it is unit-testable from the app's
 * test runner rather than only reachable inside a Cloud Function.
 *
 * The job these do together: decide when a web-search hit is THE product the
 * user typed, versus a family the product belongs to. Getting that wrong is the
 * "confidently wrong" failure — an item named after a series page, with the
 * real model sitting in the field right above it.
 */

export type VariantCandidate = { model: string; differentiator: string | null }

export function normalizeModel(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, "")
}

/**
 * Shortest typed prefix we will mine extensions from.
 *
 * Was 5, which silently excluded four-character family names — "CORE", "NEST",
 * "DUO", "MAX". A Levoit Core 300 typed as "Core" mined nothing, so the
 * "did you mean one of these?" branch never fired and a series page became the
 * item's name. Four is the floor where a prefix is still specific enough to be
 * worth extending: three would let "LG" or "GE" match half the catalogue.
 */
export const MIN_VARIANT_PREFIX = 4

/**
 * Mine model-family variants from search text: tokens that EXTEND the typed
 * model ("WM4000H" → "WM4000HWA"). Capped at 3 distinct.
 */
export function mineVariants(typedModel: string, haystacks: string[]): VariantCandidate[] {
  const prefix = normalizeModel(typedModel)
  if (prefix.length < MIN_VARIANT_PREFIX) return []
  const seen = new Set<string>()
  const out = () => [...seen].map((model) => ({ model, differentiator: null }))

  /** Accept a candidate; true once we have enough to stop scanning. */
  const take = (token: string): boolean => {
    if (
      token.startsWith(prefix) &&
      token.length > prefix.length &&
      token.length <= prefix.length + 6 &&
      /\d/.test(token)
    ) {
      seen.add(token)
    }
    return seen.size >= 3
  }

  for (const text of haystacks) {
    const tokens = text
      .toUpperCase()
      .split(/[^A-Z0-9-]+/)
      .map(normalizeModel)
      .filter(Boolean)
    for (let i = 0; i < tokens.length; i++) {
      if (take(tokens[i])) return out()
      // Manufacturers write the same model both ways — "CORE300" and
      // "Core 300" — and a token scan only ever saw the joined form. Every
      // spaced family was therefore unminable, which is why the "which one is
      // yours?" pick almost never appeared: the search results that would have
      // fed it are overwhelmingly spaced ("Levoit Core 300 True HEPA").
      // Join only when this token IS the prefix and the next looks like a
      // suffix: two or more characters, at least one digit. That excludes
      // prose ("Core and 200") and counts ("Core 2 pack").
      // The digit test must apply to the SUFFIX, not the joined string: a
      // prefix like "WM4000HWA" already contains digits, so testing the join
      // let any following word through — "WM4000HWA the" became a variant.
      const next = tokens[i + 1]
      const suffixIsModelish = !!next && next.length >= 2 && next.length <= 6 && /\d/.test(next)
      if (tokens[i] === prefix && suffixIsModelish && take(prefix + next)) return out()
    }
  }
  return out()
}

/**
 * Does this page title describe a product FAMILY rather than one product?
 *
 * A family page token-matches the typed model perfectly — "Levoit Core Series
 * Air Purifiers" contains the token "Core" — so the exact-match test alone
 * can't tell them apart, and the title then becomes the item's name.
 *
 * One signal only: an explicit family word. A plural-product-noun rule was
 * tried against live search results and withdrawn — single-product retail
 * titles are routinely plural ("Air Purifiers for Home, Large Room"), so it
 * rejected the very products it was meant to protect.
 *
 * The other half of the defence is variant mining: when the results contain
 * models EXTENDING what was typed, the resolver already offers the pick
 * instead of guessing. This catches what mining can't see.
 */
const FAMILY_WORD = /\b(series|family|collection|lineup)\b/i

export function looksLikeSeriesTitle(title: string): boolean {
  return FAMILY_WORD.test(title)
}

/**
 * Does this title name exactly the model that was typed?
 *
 * Titles write a model however the marketing copy felt like it — "WM4000HWA",
 * "Core 300", "Core-300". A single-token comparison only ever matched the
 * first form, so every spaced model failed the exact test and fell through to
 * a family page or a miss: typing the CORRECT full model produced nothing.
 *
 * Joins up to MAX_MODEL_TOKENS adjacent tokens before comparing, so all three
 * spellings collapse to the same normalized string.
 */
const MAX_MODEL_TOKENS = 3

export function titleNamesModel(title: string, model: string): boolean {
  const target = normalizeModel(model)
  if (!target) return false
  const tokens = title.split(/\s+/).map(normalizeModel).filter(Boolean)
  for (let i = 0; i < tokens.length; i++) {
    let joined = ""
    for (let n = 0; n < MAX_MODEL_TOKENS && i + n < tokens.length; n++) {
      joined += tokens[i + n]
      if (joined.length > target.length) break
      if (joined === target) return true
    }
  }
  return false
}
