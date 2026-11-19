/**
 * Settings, Your home: what a zip may change about a home's climate (D8 edge
 * case "Existing homes keep their climate answer"; design/first-minute-
 * onboarding.md).
 *
 * The rule: a `climate` or `freeze_risk` the OWNER set — `climate_source`
 * "owner", or null for an answer from before D8 — is never overwritten by a
 * zip. The zip's suggestion is offered; it is written only when she taps
 * "Use" (Suggest, never assume). A home with no answer, or whose answer came
 * from an earlier zip, takes the new zip's values, shown and changeable.
 *
 * Pure, so the rule is pinned without rendering (zipClimate.test.ts).
 */
import type { ZipArea } from "../../../shared/area/zipArea"
import type { Climate, ClimateSource, HomeProfileUpsert } from "@/modules/home"

/** Climate → whether pipes can freeze here, for an answer picked from the list. */
export function freezeRiskFor(climate: Climate | ""): boolean | null {
  if (!climate) return null
  return climate === "mild" || climate === "hot" ? false : true
}

export type SavedClimate = {
  climate: Climate | null
  freeze_risk: boolean | null
  climate_source: ClimateSource | null
}

/** True when the owner answered the climate herself (an "owner" value, or a pre-D8 answer with no source). */
export function ownerSetClimate(saved: SavedClimate): boolean {
  return (saved.climate !== null || saved.freeze_risk !== null) && saved.climate_source !== "zip"
}

export type ZipClimateInput = {
  saved: SavedClimate
  /** The zip being entered, once found in the table; null when no new zip is pending. */
  pending: ZipArea | null
  /** The owner tapped "Use" on the zip's suggestion. */
  useZip: boolean
  /** The owner picked a climate from the list herself since the last save ("" = none). */
  picked: Climate | "" | null
  /** "Not true here" on the zip's freeze fact: the corrected value, or null. */
  freezeFix: boolean | null
}

/** What the zip suggests: its climate, with the freeze fact as corrected. Null when it has no climate. */
export function zipSuggestion(pending: ZipArea | null, freezeFix: boolean | null): { climate: Climate; freeze_risk: boolean | null } | null {
  if (!pending?.climate) return null
  return { climate: pending.climate, freeze_risk: freezeFix ?? pending.freezeRisk }
}

/** Where the climate on screen comes from right now. */
export function climateOrigin(i: ZipClimateInput): "picked" | "zip" | "saved" {
  if (i.picked !== null && i.picked !== (i.saved.climate ?? "")) return "picked"
  if (zipSuggestion(i.pending, i.freezeFix) && (i.useZip || !ownerSetClimate(i.saved))) return "zip"
  return "saved"
}

/** The climate the form shows. */
export function shownClimate(i: ZipClimateInput): Climate | "" {
  switch (climateOrigin(i)) {
    case "picked": return i.picked ?? ""
    case "zip": return zipSuggestion(i.pending, i.freezeFix)!.climate
    default: return i.saved.climate ?? ""
  }
}

/**
 * The zip's suggestion to OFFER: only when the owner set her own answer, has
 * not just picked one, has not taken the zip's, and the zip says something
 * different. Null means there is nothing to offer.
 */
export function climateOffer(i: ZipClimateInput): { climate: Climate; freeze_risk: boolean | null } | null {
  const s = zipSuggestion(i.pending, i.freezeFix)
  if (!s || !ownerSetClimate(i.saved) || i.useZip || climateOrigin(i) === "picked") return null
  if (s.climate === i.saved.climate && s.freeze_risk === i.saved.freeze_risk) return null
  return s
}

/** The climate fields a Save writes. An empty patch leaves the stored values exactly as they are. */
export function climatePatch(i: ZipClimateInput): Pick<HomeProfileUpsert, "climate" | "freeze_risk" | "climate_source"> {
  const origin = climateOrigin(i)
  if (origin === "picked") {
    const c = i.picked || null
    return { climate: c, freeze_risk: freezeRiskFor(i.picked ?? ""), climate_source: "owner" }
  }
  if (origin === "zip") {
    const s = zipSuggestion(i.pending, i.freezeFix)!
    // A corrected freeze fact is the owner's word, and a later refresh must not undo it.
    return { climate: s.climate, freeze_risk: s.freeze_risk, climate_source: i.freezeFix !== null ? "owner" : "zip" }
  }
  // She kept a pre-D8 answer alongside a new zip: record that it is hers.
  if (i.pending && i.saved.climate_source === null && ownerSetClimate(i.saved)) return { climate_source: "owner" }
  return {}
}
