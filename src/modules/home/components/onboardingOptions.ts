/**
 * The choices the first minute's screens offer (D8), kept apart from the
 * components so fast refresh keeps working (react-refresh/only-export-components).
 */
import type { Climate, HomeType, Ownership } from "../services/homeProfileService"

/** Shown for a zip the table does not know (must-be-true 4). Same words as the old climate question. */
export const CLIMATE_OPTIONS: { value: Climate; label: string; hint: string }[] = [
  { value: "mild", label: "Mild", hint: "Rarely freezes — no winterizing needed" },
  { value: "moderate", label: "Moderate", hint: "Some frost in winter" },
  { value: "cold", label: "Cold", hint: "Hard freezes — pipes can burst" },
  { value: "hot", label: "Hot / arid", hint: "Hot summers, mild winters" },
]

/** Climate answer → whether pipes can freeze. The old profile question's rule, unchanged. */
export function freezeRiskFor(climate: Climate | null): boolean | null {
  if (!climate) return null
  return climate === "mild" || climate === "hot" ? false : true
}

export const HOME_TYPE_OPTIONS: { value: HomeType; label: string; hint: string }[] = [
  { value: "house", label: "House", hint: "Single-family, detached" },
  { value: "condo", label: "Condo", hint: "Owned unit in a building" },
  { value: "townhouse", label: "Townhouse", hint: "Shared walls, own entrance" },
  { value: "apartment", label: "Apartment", hint: "Rented unit" },
]

/** A condo or apartment building usually handles the roof, gutters and pests — a default, shown and changeable. */
export const buildingHandlesByDefault = (t: HomeType | null) => t === "condo" || t === "apartment"

/**
 * Own or rent, as the home type already answered it (seventeen fixes,
 * 2026-11-25). Apartment's hint is "Rented unit" and Condo's is "Owned unit in
 * a building", so picking either answered the question — and Your home still
 * said Not set. Setup saves it only when ownership isn't set yet; Your home
 * shows it and changes it. Every other type says nothing about it.
 */
export function ownershipForHomeType(t: HomeType | null | undefined): Ownership | null {
  return t === "apartment" ? "rent" : t === "condo" ? "own" : null
}
