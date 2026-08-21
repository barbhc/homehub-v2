/**
 * Pre-filled web search for an item's manual — the self-serve fallback when
 * the in-app finder comes up empty (beta feedback: testers wanted to go look
 * themselves without retyping the model into a browser).
 */
export function manualSearchUrl(brand: string, model: string): string {
  // Join on a single space rather than interpolating, so a missing model does
  // not leave "LG  owner's manual pdf" — the outer trim only ever caught the
  // ends. Reachable from the add flow with a brand and no model yet.
  const q = [brand.trim(), model.trim(), "owner's manual pdf"].filter(Boolean).join(" ")
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`
}
