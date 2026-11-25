/**
 * The reads and per-device flags shared by Home's two "What's in your home?"
 * cards: the empty-Home card (WhatsInYourHomeCard) and the appliances card for
 * a home with tasks but no items (NextStepCard). Both read the same
 * `day-one:${homeId}` SWR key, so they share one cache entry.
 */
import { getItemUnits, createItemUnit, type ServiceResult } from "@/modules/items"
import { getTaskTemplates } from "@/modules/care"
import { getHomeProfile, getRooms } from "@/modules/home"
import type { ItemUnit } from "@/integrations/types"
import type { AreaGate, CareFacts } from "../../../shared/care/library"
import type { Appliance, HomeContext } from "../../../shared/care/dayOne"

// ── per-device conveniences (design doc: never state that must persist) ──────

/** The old appliances card's Not now / Done, on this phone. */
export const dismissKey = (homeId: string) => `hh.dayOne.appliancesDismissed.${homeId}`
/** The empty-Home card shrunk to one line (Not now, or Done with nothing added). */
export const collapsedKey = (homeId: string) => `hh.emptyHome.collapsed.${homeId}`

export function readLocal(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    // Blocked storage (private mode, previews): behave as if nothing was stored.
    return null
  }
}
export function writeLocal(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value)
  } catch (e) {
    // Only a convenience is lost: the card may show again on this device.
    console.warn(`[day-one] could not remember ${key}:`, e instanceof Error ? e.message : e)
  }
}
export function removeLocal(key: string) {
  try {
    window.localStorage.removeItem(key)
  } catch (e) {
    // Only a convenience: the flag may outlive the tap on this device.
    console.warn(`[day-one] could not forget ${key}:`, e instanceof Error ? e.message : e)
  }
}

// ── data ────────────────────────────────────────────────────────────────────

export interface DayOneData {
  /** The home this read is for, so a card never acts on another home's answer. */
  homeId: string
  items: { display_name: string | null; category: string | null; brand: string | null; model: string | null }[]
  /** How many tasks the home has (any scope). With `items`, the card's own say on "empty". */
  taskCount: number
  facts: CareFacts
  ctx: HomeContext
}

export const dayOneKey = (homeId: string) => `day-one:${homeId}`

export async function fetchDayOne(homeId: string): Promise<DayOneData> {
  const [items, templates, profile] = await Promise.all([
    getItemUnits(homeId, { statusFilter: ["active", "stored"] }),
    getTaskTemplates(homeId),
    getHomeProfile(homeId),
  ])
  const failed = items.error ?? templates.error ?? profile.error
  if (failed || !items.data || !templates.data) throw new Error(failed?.message ?? "Could not load your home")
  const p = profile.data
  const area: AreaGate[] = [...(p?.area?.hazards ?? []), ...(p?.freeze_risk === false ? [] : (["freeze"] as const))]
  return {
    homeId,
    items: items.data,
    taskCount: templates.data.length,
    facts: p?.care_facts ?? {},
    ctx: { existingTitles: templates.data.map((t) => t.title), dismissed: p?.dismissed_care ?? [], area },
  }
}

/**
 * Make the item a ticked appliance becomes (D1: only when its first task is
 * added): its usual room when the home has one by that name, the chip's label
 * as its name, the kind as its category.
 */
export async function createApplianceItem(homeId: string, appliance: Appliance): Promise<ServiceResult<ItemUnit>> {
  const rooms = appliance.room ? await getRooms(homeId) : null
  const roomId = rooms?.data?.find((r) => r.name === appliance.room)?.room_id ?? null
  return createItemUnit({
    home_id: homeId,
    display_name: appliance.label,
    category: appliance.kind,
    item_category: appliance.itemCategory,
    room_id: roomId,
  })
}
