/**
 * Where termites are common enough that an inspection is standard — decided
 * from the home's county, so the monthly card can offer the termite inspection
 * without asking "Are termites a known risk where you live?" (owner asked
 * 2026-11-20: "can you see what is common in that zip code?").
 *
 * Source: U.S. Department of Veterans Affairs, "Local Requirements: Wood-
 * Destroying Insect Information" (benefits.va.gov/HOMELOANS/
 * appraiser_cv_local_req.asp, last updated July 11, 2025, read 2026-11-20).
 * VA requires a wood-destroying-insect inspection before a home loan in these
 * states and counties; anywhere else it is not required. It is the only
 * official county-level list we found. The Forest Service's termite
 * infestation probability map exists only as an image.
 *
 * A PROPOSED default (Suggest, never assume): the owner's own answer to the
 * termite question always wins over this list.
 */

/** Every county, parish and borough in these states and territories. */
const STATEWIDE = new Set([
  "AL", "AZ", "AR", "CA", "CT", "DE", "DC", "FL", "GA", "HI", "IL", "IN", "KS", "KY", "LA", "MD", "MA", "MS", "MO",
  "NJ", "NM", "NC", "OH", "OK", "PR", "RI", "SC", "TN", "TX", "VI", "VA", "WV", "GU", "AS", "MP",
])

/** Only these counties, in the VA's spelling. */
const COUNTIES: Record<string, string[]> = {
  MI: ["Allegan", "Barry", "Berrien", "Branch", "Calhoun", "Cass", "Hillsdale", "Ionia", "Jackson", "Kalamazoo", "Kent", "Lenawee", "Livingston", "Macomb", "Mason", "Monroe", "Muskegon", "Oakland", "Oceana", "Ottawa", "St. Clair", "St. Joseph", "Van Buren", "Washtenaw", "Wayne"],
  NH: ["Cheshire", "Sullivan", "Merrimack", "Rockingham", "Belknap", "Hillsborough", "Strafford"],
  CO: ["Alamosa", "Arapahoe", "Archuleta", "Baca", "Bent", "Chaffee", "Cheyenne", "Conejos", "Costilla", "Crowley", "Custer", "Delta", "Dolores", "Douglas", "El Paso", "Elbert", "Fremont", "Gunnison", "Hinsdale", "Huerfano", "Kiowa", "Kit Carson", "La Plata", "Lake", "Las Animas", "Lincoln", "Mineral", "Montezuma", "Montrose", "Otero", "Ouray", "Park", "Phillips", "Prowers", "Pueblo", "Rio Grande", "Saguache", "San Juan", "San Miguel", "Summit", "Teller", "Washington", "Yuma"],
  IA: ["Adair", "Adams", "Allamakee", "Appanoose", "Audubon", "Benton", "Black Hawk", "Boone", "Bremer", "Buchanan", "Butler", "Calhoun", "Carroll", "Cass", "Cedar", "Chickasaw", "Clarke", "Clayton", "Clinton", "Crawford", "Dallas", "Davis", "Decatur", "Delaware", "Des Moines", "Dubuque", "Fayette", "Floyd", "Franklin", "Fremont", "Greene", "Grundy", "Guthrie", "Hamilton", "Hardin", "Harrison", "Henry", "Humboldt", "Ida", "Iowa", "Jackson", "Jasper", "Jefferson", "Johnson", "Jones", "Keokuk", "Lee", "Linn", "Louisa", "Lucas", "Madison", "Mahaska", "Marion", "Marshall", "Mills", "Monona", "Monroe", "Montgomery", "Muscatine", "Page", "Polk", "Pottawattamie", "Poweshiek", "Ringgold", "Sac", "Scott", "Shelby", "Story", "Tama", "Taylor", "Union", "Van Buren", "Wapello", "Warren", "Washington", "Wayne", "Webster", "Winneshiek", "Wright"],
  NE: ["Adams", "Boone", "Buffalo", "Burt", "Butler", "Cass", "Chase", "Clay", "Colfax", "Cuming", "Custer", "Dawson", "Dodge", "Douglas", "Dundy", "Fillmore", "Franklin", "Frontier", "Furnas", "Gage", "Gosper", "Greeley", "Hall", "Hamilton", "Harlan", "Hayes", "Hitchcock", "Howard", "Jefferson", "Johnson", "Kearney", "Lancaster", "Madison", "Merrick", "Nance", "Nemaha", "Nuckolls", "Otoe", "Pawnee", "Perkins", "Phelps", "Platte", "Polk", "Red Willow", "Richardson", "Saline", "Sarpy", "Saunders", "Seward", "Sherman", "Stanton", "Thayer", "Thurston", "Valley", "Washington", "Webster", "York"],
  NV: ["Carson City", "Churchill", "Clark", "Douglas", "Esmeralda", "Lincoln", "Lyon", "Mineral", "Nye", "Pershing", "Storey", "Washoe", "White Pine"],
  NY: ["Bronx", "Broome", "Columbia", "Delaware", "Dutchess", "Greene", "Kings", "Nassau", "New York", "Orange", "Putnam", "Queens", "Richmond", "Rockland", "Suffolk", "Sullivan", "Ulster", "Westchester"],
  PA: ["Adams", "Allegheny", "Armstrong", "Beaver", "Bedford", "Berks", "Blair", "Bucks", "Butler", "Cambria", "Cameron", "Carbon", "Centre", "Chester", "Clarion", "Clearfield", "Clinton", "Columbia", "Crawford", "Cumberland", "Dauphin", "Delaware", "Elk", "Erie", "Fayette", "Forest", "Franklin", "Fulton", "Greene", "Huntingdon", "Indiana", "Jefferson", "Juniata", "Lackawanna", "Lancaster", "Lawrence", "Lebanon", "Lehigh", "Luzerne", "Lycoming", "McKean", "Mercer", "Mifflin", "Monroe", "Montgomery", "Montour", "Northampton", "Northumberland", "Perry", "Philadelphia", "Pike", "Potter", "Schuylkill", "Snyder", "Somerset", "Sullivan", "Tioga", "Union", "Venango", "Warren", "Washington", "Westmoreland", "Wyoming", "York"],
  UT: ["Beaver", "Garfield", "Iron", "Kane", "San Juan", "Washington"],
  WI: ["Columbia", "Crawford", "Dane", "Dodge", "Grant", "Green", "Iowa", "Jefferson", "Kenosha", "Lafayette", "Milwaukee", "Ozaukee", "Racine", "Richland", "Rock", "Sauk", "Vernon", "Walworth", "Washington", "Waukesha"],
}

/** "St. Clair County" → "stclair"; the table's "Carson City City" → "carsoncity". */
export function countyKey(name: string): string {
  return name.replace(/ City City$/i, " City").replace(/\s+(County|Parish|Borough|Census Area|Municipality|City and Borough)$/i, "").toLowerCase().replace(/[^a-z]/g, "")
}

const LISTED = new Map(Object.entries(COUNTIES).map(([st, names]) => [st, new Set(names.map(countyKey))]))

/** The states with a county list (for the table check in tests). */
export const COUNTY_LISTS: Readonly<Record<string, readonly string[]>> = COUNTIES

/**
 * True where the VA requires a termite inspection, false where it does not,
 * null when the county is unknown (the termite question is asked instead).
 */
export function termitesCommon(state: string | null | undefined, county: string | null | undefined): boolean | null {
  if (!state || !county) return null
  if (STATEWIDE.has(state)) return true
  return LISTED.get(state)?.has(countyKey(county)) ?? false
}
