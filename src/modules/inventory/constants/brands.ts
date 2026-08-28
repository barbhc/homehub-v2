/**
 * Curated home-goods brand list for the Add-item Brand field autocomplete.
 *
 * A native <datalist> filters this offline as the user types — zero API cost,
 * instant, works on the iOS WebView. It doesn't restrict input (any brand can
 * still be typed); it just completes the common ones so "Sha…" → "Sharp".
 *
 * Scope = brands a homeowner actually inventories: major + small appliances,
 * HVAC / water heating, plumbing fixtures, water treatment, TVs, and common
 * outdoor / power equipment. Kept deliberately broad but not exhaustive —
 * add on demand rather than chasing every SKU maker.
 */
export { COMMON_BRANDS } from "../../../../shared/products/brands"
