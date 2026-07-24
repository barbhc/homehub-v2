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
