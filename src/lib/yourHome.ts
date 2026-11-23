/**
 * What the "Your home" page says about a home's basics and notes, as plain
 * strings (design/settings-your-home.md). Pure, so the wording is tested
 * without a screen.
 */
import type { LucideIcon } from "lucide-react"
import { DropletIcon, FlameIcon, ZapIcon } from "lucide-react"
import type { CareNote } from "@/integrations/types"
import type { HomeProfile } from "@/modules/home"
import type { PinchKey } from "@/lib/homeSections"
import { roomNoteCounts } from "@/lib/notes"

/** The route. Settings, Home's banner and old links all point here. */
export const YOUR_HOME_PATH = "/your-home"
export type YourHomePart = "basics" | "rules"
export const yourHomePart = (part: string) => `${YOUR_HOME_PATH}?part=${part}`

export const PINCH_ICON: Record<PinchKey, LucideIcon> = { water: DropletIcon, gas: FlameIcon, power: ZapIcon }

const HOME_TYPE: Record<NonNullable<HomeProfile["home_type"]>, string> = {
  house: "House", condo: "Condo", townhouse: "Townhouse", apartment: "Apartment", other: "Other",
}
const OWNERSHIP: Record<NonNullable<HomeProfile["ownership"]>, string> = { own: "Own", rent: "Rent" }
const CLIMATE: Record<NonNullable<HomeProfile["climate"]>, string> = {
  mild: "Mild", moderate: "Moderate", cold: "Cold winters", hot: "Hot",
}

export const NOT_SET = "Not set"

type Basics = Pick<HomeProfile, "home_type" | "ownership" | "zip" | "area" | "climate" | "freeze_risk">

/** The three basics as their row values; a missing one reads "Not set". */
export function basicsRows(p: Basics | null): { key: "type" | "ownership" | "zip"; title: string; value: string }[] {
  return [
    { key: "type", title: "Home type", value: (p?.home_type && HOME_TYPE[p.home_type]) || NOT_SET },
    { key: "ownership", title: "Own or rent", value: (p?.ownership && OWNERSHIP[p.ownership]) || NOT_SET },
    { key: "zip", title: "Zip", value: p?.zip || NOT_SET },
  ]
}

/**
 * One line under the basics: the county, then the climate in a few words
 * ("San Francisco County. Mild, rarely freezes."). Null when nothing is known,
 * so the page says nothing rather than guessing.
 */
export function areaLine(p: Basics | null): string | null {
  if (!p) return null
  const climate = p.climate ? CLIMATE[p.climate] : null
  const freeze = p.freeze_risk === true ? "pipes can freeze" : p.freeze_risk === false ? "rarely freezes" : null
  const weather = climate && freeze ? `${climate}, ${freeze}` : climate ?? (freeze ? freeze[0].toUpperCase() + freeze.slice(1) : null)
  const parts = [p.area?.county ?? null, weather].filter((x): x is string => !!x)
  return parts.length ? `${parts.join(". ")}.` : null
}

/** How many house notes there are (room and item notes are not house notes). */
export function houseNoteCount(notes: CareNote[]): number {
  return notes.filter((n) => n.scope === "home" && !n.deleted_at).length
}

/** "Kitchen 2 · Garage 1": rooms that have notes, most notes first, at most three named. */
export function roomNotesLine(notes: CareNote[], rooms: { room_id: string; name: string }[]): string | null {
  const counts = roomNoteCounts(notes.filter((n) => !n.deleted_at))
  const named = rooms
    .map((r) => ({ name: r.name, n: counts.get(r.room_id) ?? 0 }))
    .filter((r) => r.n > 0)
    .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name))
  if (named.length === 0) return null
  const shown = named.slice(0, 3).map((r) => `${r.name} ${r.n}`)
  return named.length > 3 ? `${shown.join(" · ")} · ${named.length - 3} more` : shown.join(" · ")
}
