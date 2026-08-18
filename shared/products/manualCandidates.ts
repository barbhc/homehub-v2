/**
 * Deciding which search hits are allowed to be offered as someone's manual.
 *
 * This is not only a quality filter. Picking a candidate makes the server fetch
 * that PDF and feed it to the parser that writes the user's maintenance tasks —
 * so an attacker-controlled PDF is an injection route into the one part of the
 * product people are meant to trust. The SSRF guard already stops us reaching
 * internal addresses; it says nothing about whether a public host is honest.
 *
 * A real search for "Levoit Core 300 manual" returned four candidates, three of
 * them on `*.gov` and `*.gov.ng` hosts — the signature of a compromised site or
 * an SEO PDF farm. Nothing rejected them, because ranking only ever sorted.
 *
 * Two rules, both refusals rather than preferences:
 *   · institutions do not publish consumer appliance manuals
 *   · a candidate must actually NAME the thing it claims to document
 */

/** Government, military and academic hosts, including country-coded forms
 *  (`.gov.ng`, `.ac.uk`). A home appliance manual is never legitimately here,
 *  and this is exactly where scraped-PDF spam accumulates. The cost of being
 *  wrong is one missing suggestion; upload and paste-URL are still right there. */
const INSTITUTIONAL = /(^|\.)(gov|mil|edu)(\.[a-z]{2,})?$/i
const ACADEMIC_CC = /(^|\.)ac\.[a-z]{2,}$/i

export function isInstitutionalHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^www\./, "")
  return INSTITUTIONAL.test(h) || ACADEMIC_CC.test(h)
}

const alnum = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "")

/**
 * Does this result name the brand or the model anywhere we can check without
 * fetching it — its title or its URL?
 *
 * A PDF that names neither is not evidence of anything; offering it is asking
 * the user to gamble on a filename. Brand alone is enough (manufacturers file
 * manuals under model codes that never reach the title), and model alone is
 * enough (a parent company's CDN — Levoit manuals live on vesync.com).
 */
export function namesProduct(title: string, url: string, brand: string, model: string): boolean {
  const haystack = alnum(`${title} ${url}`)
  const b = alnum(brand)
  const m = alnum(model)
  const brandHit = b.length >= 2 && haystack.includes(b)
  const modelHit = m.length >= 3 && haystack.includes(m)
  return brandHit || modelHit
}

/**
 * Everything a candidate must clear to be shown at all. Ranking happens after
 * this and only reorders what has already been judged safe to offer.
 */
export function isOfferableManual(
  candidate: { title: string; url: string; host: string },
  brand: string,
  model: string,
): boolean {
  if (isInstitutionalHost(candidate.host)) return false
  return namesProduct(candidate.title, candidate.url, brand, model)
}
