/**
 * Pre-filled web search for an item's manual — the self-serve fallback when
 * the in-app finder comes up empty (beta feedback: testers wanted to go look
 * themselves without retyping the model into a browser).
 */
export function manualSearchUrl(brand: string, model: string): string {
  const q = `${brand.trim()} ${model.trim()} owner's manual pdf`.trim()
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`
}
