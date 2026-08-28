import { titleNamesModel } from "./modelVariants.js"
import { isRetailerHost, hostOf } from "./productTitle.js"

/**
 * The brands the app recognises, in ONE place.
 *
 * It lives in `shared/` because both sides need it and they must not drift: the
 * client filters this list as you type, and the Cloud Function uses it as a
 * closed set when deriving a brand from a model number. A derived brand that is
 * not on this list is not returned at all — that is what makes the derivation a
 * lookup rather than a guess, and it is the direct answer to a scan that once
 * reported an LG dryer as a Whirlpool.
 */
export const COMMON_BRANDS: readonly string[] = [
  // Major appliances
  "Samsung", "LG", "GE", "GE Café", "GE Profile", "Whirlpool", "Maytag", "KitchenAid",
  "Bosch", "Frigidaire", "Electrolux", "Miele", "Sub-Zero", "Wolf", "Thermador",
  "Sharp", "Panasonic", "Haier", "Amana", "Kenmore", "Speed Queen", "Fisher & Paykel",
  "Viking", "Dacor", "JennAir", "Hotpoint", "Beko", "Smeg", "Bertazzoni",
  // Small kitchen + home appliances
  "Ninja", "Nespresso", "Keurig", "Breville", "Cuisinart", "Hamilton Beach", "Vitamix",
  "Instant Pot", "De'Longhi", "Braun", "Oster", "Black+Decker", "Kalorik", "Zojirushi",
  // Floor + air care
  "Dyson", "Shark", "iRobot", "Roomba", "Bissell", "Hoover", "Levoit", "Winix", "Coway",
  "Blueair", "Honeywell", "Vornado", "Aroma",
  // HVAC + water heating
  "Carrier", "Trane", "Lennox", "Rheem", "Goodman", "York", "American Standard", "Bryant",
  "Ruud", "Bradford White", "A.O. Smith", "Navien", "Rinnai", "Mitsubishi Electric",
  "Daikin", "Fujitsu", "Ecobee", "Nest",
  // Plumbing + fixtures
  "Kohler", "Moen", "Delta", "TOTO", "Grohe", "Hansgrohe", "Pfister", "InSinkErator",
  "Elkay", "Aquasana", "Culligan", "Brita",
  // TV + media
  "Sony", "TCL", "Vizio", "Hisense", "Roku", "Insignia",
  // Outdoor + power equipment
  "Weber", "Traeger", "Honda", "Generac", "Husqvarna", "Toro", "Ego", "DeWalt",
  "Milwaukee", "Ryobi", "Ring", "Rachio",
]

/**
 * Is this model number distinctive enough to identify a brand on its own?
 *
 * The load-bearing half of deriving a brand from a model. "WM3900HBA" appears
 * on LG products and essentially nowhere else, so a web search for it answers
 * the question. "300", "A1" and "PRO" appear on everything, and searching them
 * would reintroduce confident wrongness in a new place — which is the failure
 * this whole change exists to remove.
 *
 * The gate: at least five characters, and BOTH a letter and a digit. Real
 * appliance model numbers are alphanumeric strings of that shape; the words and
 * bare numbers that collide across brands are not.
 */
export function isDistinctiveModel(model: string): boolean {
  const squashed = model.replace(/[^a-z0-9]/gi, "")
  return squashed.length >= 5 && /[a-z]/i.test(squashed) && /\d/.test(squashed)
}

/**
 * Which known brand does this text name, if any?
 *
 * Word-boundary matched against the closed list above, longest first so
 * "GE Profile" wins over "GE" on a title carrying both. Returns null for
 * anything not on the list: an unrecognised brand is not a discovery, it is an
 * unverified string, and the point of the list is that we can only ever suggest
 * a name we already know.
 */
export function knownBrandIn(text: string): string | null {
  const hay = ` ${text.toLowerCase()} `
  const byLength = [...COMMON_BRANDS].sort((a, b) => b.length - a.length)
  for (const brand of byLength) {
    const needle = brand.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    if (new RegExp(`(^|[^a-z0-9])${needle}([^a-z0-9]|$)`, "i").test(hay)) return brand
  }
  return null
}

/** One web result, reduced to what the decision actually needs. */
export type BrandSearchResult = { title: string; description?: string; url?: string }

/** A brand derived from a model number, with the evidence that produced it. */
export type DerivedBrand = { brand: string; agreeing: number } | null

/**
 * Given search results for a MODEL NUMBER, which brand do they agree on?
 *
 * Pure on purpose: this is the whole decision, and the decision is the part
 * that can be wrong in interesting ways. The Cloud Function around it only
 * performs the fetch.
 *
 * Three constraints keep this a lookup rather than a nicer-sounding guess:
 *
 *  - a result only votes if its title token-matches the model
 *    (`titleNamesModel`) — the same grounding the identity path already uses,
 *    so a category page about the right brand and the wrong product cannot vote;
 *  - the answer must be on the KNOWN brand list, because an unrecognised string
 *    is not a discovery, and returning only names we already know is what
 *    bounds the blast radius when the web is wrong;
 *  - it must agree with itself — two qualifying results, or one from a
 *    non-retailer host. A lone store listing is the evidence that once produced
 *    "Amazon.com: Ninja …" as a product name.
 *
 * A tie returns null. A model number whose results split between two brands was
 * not as distinctive as it looked, and picking the bigger pile by one vote is
 * exactly the behaviour this replaces.
 */
export function pickBrandFromResults(results: BrandSearchResult[], model: string): DerivedBrand {
  if (!isDistinctiveModel(model)) return null
  const votes = new Map<string, { n: number; nonRetailer: boolean }>()
  for (const r of results) {
    if (!titleNamesModel(r.title ?? "", model)) continue
    const brand = knownBrandIn(r.title ?? "") ?? knownBrandIn(r.description ?? "")
    if (!brand) continue
    const prev = votes.get(brand) ?? { n: 0, nonRetailer: false }
    votes.set(brand, { n: prev.n + 1, nonRetailer: prev.nonRetailer || !isRetailerHost(hostOf(r.url ?? "")) })
  }
  if (!votes.size) return null
  const ranked = [...votes.entries()].sort((a, b) => b[1].n - a[1].n)
  if (ranked.length > 1 && ranked[0][1].n === ranked[1][1].n) return null
  const [brand, ev] = ranked[0]
  if (ev.n < 2 && !ev.nonRetailer) return null
  return { brand, agreeing: ev.n }
}
