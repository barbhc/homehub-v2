import React, { useState, useMemo } from "react"
import { Link } from "react-router-dom"
import { PageContainer, PageHeader, EmptyState, StaleDataNote } from "@/components/layout"
import { Button } from "@/components/ui/button"
import {
  Plus,
  // Item-type icons
  Refrigerator, WashingMachine, Microwave, AirVent, Coffee, Flame,
  Droplets, Thermometer, Wind, Tv, Monitor, Camera, TreePine,
  Armchair, Sparkles, Package, Fan, Lightbulb, Waves, Bath,
  Car, Wifi, Speaker, Sofa, ShowerHead, Toilet, ChefHat, Cctv,
} from "lucide-react"
import { useCurrentHome } from "@/modules/home"
import { RefinedItems } from "@/components/home/RefinedItems"
import { ItemsLoadError, ItemsSkeleton } from "@/components/home/ItemsSkeleton"
import { useNotes } from "@/components/notes/useNotes"
import { getHomeNotes } from "@/modules/care"
import { DesktopItems } from "@/components/home/DesktopItems"
import { useHomeItems } from "@/lib/useHomeItems"
import { pageLoadState } from "@/lib/homeLoadingGate"
import { cn } from "@/lib/utils"
import type { LucideIcon } from "lucide-react"
import type { ItemUnit, Room } from "@/integrations/types"

// ---------------------------------------------------------------------------
// Icon resolution — keyword match on display_name, fallback to category
// ---------------------------------------------------------------------------

type IconEntry = { keywords: string[]; icon: LucideIcon }

const KEYWORD_ICONS: IconEntry[] = [
  { keywords: ["refrigerator", "fridge", "freezer"], icon: Refrigerator },
  { keywords: ["washing machine", "washer"], icon: WashingMachine },
  { keywords: ["dryer", "tumble dryer"], icon: Wind },
  { keywords: ["dishwasher"], icon: Waves },
  { keywords: ["microwave"], icon: Microwave },
  { keywords: ["oven", "range", "stove", "cooktop", "hob"], icon: Flame },
  { keywords: ["range hood", "hood vent", "exhaust hood", "extractor"], icon: AirVent },
  { keywords: ["coffee", "espresso", "nespresso", "keurig"], icon: Coffee },
  { keywords: ["thermostat"], icon: Thermometer },
  { keywords: ["water heater", "boiler", "hot water"], icon: Flame },
  { keywords: ["water softener", "water filter", "water purifier"], icon: Droplets },
  { keywords: ["hvac", "furnace", "air conditioner", "ac unit", "heat pump", "boiler"], icon: AirVent },
  { keywords: ["fan", "ceiling fan", "exhaust fan"], icon: Fan },
  { keywords: ["tv", "television", "smart tv"], icon: Tv },
  { keywords: ["monitor", "display", "screen"], icon: Monitor },
  { keywords: ["router", "modem", "wifi", "network"], icon: Wifi },
  { keywords: ["camera", "doorbell camera", "security camera", "cctv", "dash cam"], icon: Camera },
  { keywords: ["cctv"], icon: Cctv },
  { keywords: ["speaker", "soundbar", "subwoofer"], icon: Speaker },
  { keywords: ["garage door", "garage opener"], icon: Car },
  { keywords: ["lawn mower", "mower", "grass cutter"], icon: TreePine },
  { keywords: ["sofa", "couch", "sectional"], icon: Sofa },
  { keywords: ["armchair", "recliner", "chair"], icon: Armchair },
  { keywords: ["toothbrush", "shaver", "hair dryer", "hair straightener", "curler"], icon: Sparkles },
  { keywords: ["shower", "shower head"], icon: ShowerHead },
  { keywords: ["toilet", "bidet"], icon: Toilet },
  { keywords: ["bathtub", "jacuzzi", "hot tub", "spa"], icon: Bath },
  { keywords: ["light", "lamp", "bulb", "sconce", "chandelier"], icon: Lightbulb },
  { keywords: ["pool pump", "pool heater", "pool"], icon: Waves },
  { keywords: ["grill", "bbq", "barbecue", "smoker"], icon: Flame },
  { keywords: ["dishwasher", "disposal", "garbage disposal"], icon: ChefHat },
]

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  "Major Appliances": WashingMachine,
  "Electronics": Monitor,
  "Furniture": Armchair,
  "HVAC": AirVent,
  "Plumbing": Droplets,
  "Outdoor/Patio": TreePine,
  "Camera Equipment": Camera,
  "Beauty & Personal Care": Sparkles,
}

function getItemIcon(item: ItemUnit): LucideIcon {
  const name = item.display_name.toLowerCase()
  for (const entry of KEYWORD_ICONS) {
    if (entry.keywords.some((kw) => name.includes(kw))) return entry.icon
  }
  if (item.category && CATEGORY_ICONS[item.category]) return CATEGORY_ICONS[item.category]
  return Package
}

// ---------------------------------------------------------------------------
// ItemIcon — renders the appropriate icon for an item (extracted to avoid
// component-in-render lint error)
// ---------------------------------------------------------------------------

function ItemIcon({ item }: { item: ItemUnit }) {
  const Icon = getItemIcon(item)
  return React.createElement(Icon, { className: "size-6 text-primary", strokeWidth: 1.5 })
}

// ---------------------------------------------------------------------------
// ItemCard — 3-column icon-forward card
// ---------------------------------------------------------------------------

/** Days until a YYYY-MM-DD date (negative if past), or null. */
function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null
  const [y, m, d] = dateStr.split("-").map(Number)
  return Math.ceil((new Date(y, (m ?? 1) - 1, d ?? 1).getTime() - Date.now()) / 86400000)
}

function ItemCard({ item }: { item: ItemUnit }) {
  // Timely signals only — show a chip when it's actionable, not on every card.
  // Recall (safety) takes precedence over a soon-ending warranty.
  const hasRecall = item.recall_status === "found"
  const warrantyDays = daysUntil(item.warranty_expiry_date)
  const warrantyEnding = warrantyDays != null && warrantyDays >= 0 && warrantyDays <= 60

  return (
    <Link
      to={`/items/${item.item_unit_id}`}
      className="relative bg-card border border-border rounded-xl p-3 flex flex-col items-center text-center hover:border-primary/40 transition-colors group"
    >
      <div className="size-12 rounded-xl bg-primary/10 flex items-center justify-center mb-2 shrink-0">
        <ItemIcon item={item} />
      </div>
      <span className="text-xs font-medium leading-tight line-clamp-2 w-full">{item.display_name}</span>
      {item.brand && (
        <span className="text-[10px] text-muted-foreground mt-0.5 truncate w-full">{item.brand}</span>
      )}
      {(hasRecall || warrantyEnding) && (
        <div className="mt-1.5 flex flex-wrap justify-center gap-1">
          {hasRecall && (
            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300">
              Recall
            </span>
          )}
          {warrantyEnding && (
            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
              Warranty {warrantyDays}d
            </span>
          )}
        </div>
      )}
    </Link>
  )
}

// ---------------------------------------------------------------------------
// RoomSection — grid of ItemCards under a room label
// ---------------------------------------------------------------------------

function RoomSection({
  roomName,
  roomItems,
}: {
  roomName: string
  roomItems: ItemUnit[]
}) {
  return (
    <section>
      <div className="flex items-baseline gap-2 mb-2 px-1">
        <h2 className="text-sm font-semibold text-foreground">{roomName}</h2>
        <span className="text-xs text-muted-foreground">{roomItems.length}</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {roomItems.map((item) => (
          <ItemCard
            key={item.item_unit_id}
            item={item}
          />
        ))}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Inventory page
// ---------------------------------------------------------------------------

// Stable empties, so the memos below don't recompute on every render before
// the list arrives.
const NO_ITEMS: ItemUnit[] = []
const NO_ROOMS: Room[] = []

export default function Inventory() {
  const { home } = useCurrentHome()
  const homeId = home?.home_id ?? null
  // Items + rooms, cached like Home: a revisit paints at once, a relaunch paints
  // the persisted snapshot while it revalidates, a hung read times out into
  // the error state. A failed read throws, so it is never cached as "no items".
  const { data, error, refresh } = useHomeItems(homeId)
  const items = data?.items ?? NO_ITEMS
  const rooms = data?.rooms ?? NO_ROOMS
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null) // null = All
  // Notes load on their own: a failed notes read must never cost the item list.
  const homeNotes = useNotes(homeId ? `home-notes:${homeId}` : null, () => getHomeNotes(homeId!))
  const retry = () => void refresh()

  const grouped = useMemo(() => {
    const byRoom = new Map<string | null, ItemUnit[]>()
    for (const item of items) {
      const key = item.room_id ?? null
      const list = byRoom.get(key) ?? []
      list.push(item)
      byRoom.set(key, list)
    }
    return byRoom
  }, [items])

  const roomOrder = useMemo(() => {
    const order: (string | null)[] = []
    for (const r of rooms) {
      if (grouped.has(r.room_id)) order.push(r.room_id)
    }
    if (grouped.has(null)) order.push(null)
    return order
  }, [rooms, grouped])

  // Rooms that actually have items (for tab bar)
  const roomsWithItems = useMemo(
    () => rooms.filter((r) => grouped.has(r.room_id)),
    [rooms, grouped]
  )

  // Items visible in current tab
  const visibleRoomOrder = activeRoomId === null ? roomOrder : [activeRoomId]

  // What to show is decided by what we HOLD, never by SWR's isLoading (true
  // while a warm snapshot revalidates) — see pageLoadState.
  const view = pageLoadState(data !== undefined, error !== undefined)
  if (view === "loading") {
    return (
      <PageContainer>
        {/* Keyed by home: a switch mid-load restarts the "Still loading…" wait. */}
        <ItemsSkeleton key={homeId ?? "no-home"} onRetry={retry} />
      </PageContainer>
    )
  }
  if (view === "error") {
    return (
      <PageContainer>
        <ItemsLoadError message={error?.message ?? "Something went wrong."} onRetry={retry} />
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      {/* A refresh failed behind a list we still hold: show the list, say so quietly.
          Aligned with the phone list's own gutter, and with the page at lg+. */}
      {error && (
        <div className="-mx-6 lg:mx-0">
          <div className="mx-auto w-full max-w-[460px] px-5 lg:max-w-none lg:px-0">
            <StaleDataNote onRetry={retry} />
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <>
          {/* The empty state keeps its pre-redesign header ("Inventory" + "Add
              Item"). It no longer shows while loading — ItemsSkeleton is the
              redesigned page — but retitling the empty state is the owner's
              call, so it is left as it was. */}
          <PageHeader
            title="Inventory"
            action={
              <Button asChild className="gap-2" size="sm">
                <Link to="/inventory/add">
                  <Plus className="h-4 w-4" aria-hidden />
                  Add Item
                </Link>
              </Button>
            }
          />
          <EmptyState
          title="No items yet"
          description="Start with one appliance you'd hate to have break — the boiler, the washer, the fridge."
          teach="Photograph the label with the model number on it. Homehub finds the manual, reads it, and shows you the care it specifies before anything becomes a reminder."
          action={
            /* "See a sample home" sat here until round 18. Removed at the
               owner's request while the sample page is redesigned (BACKLOG §4b):
               it still renders the pre-round-18 layout, so pointing a signed-in
               user at it from the empty state means showing them a stale version
               of the product they are already inside.

               The route and the onboarding escape hatch both stay — this is one
               door closed for the duration, not the page retired. */
            <Button asChild size="sm">
              <Link to="/inventory/add">Add your first item</Link>
            </Button>
          }
        />
        </>
      ) : (
        <>
        {/* Redesigned Items — list (mobile) · card grid (desktop) */}
        <div className="lg:hidden -mx-6">
          <div className="mx-auto w-full max-w-[460px]">
            <RefinedItems items={items} rooms={rooms} notes={homeNotes.notes} notesError={homeNotes.error} />
          </div>
        </div>
        <div className="hidden lg:block">
          <DesktopItems items={items} rooms={rooms} notes={homeNotes.notes} notesError={homeNotes.error} />
        </div>
        {/* Old grid kept (hidden) — replaced by RefinedItems/DesktopItems */}
        <div className="hidden">
        <div className="space-y-6">
          {/* Room tab bar */}
          {roomsWithItems.length > 1 && (
            <div className="-mx-4 px-4 overflow-x-auto scrollbar-none">
              <div className="flex gap-2 pb-1 w-max">
                <button
                  type="button"
                  onClick={() => setActiveRoomId(null)}
                  className={cn(
                    "rounded-full border text-xs font-medium px-3 py-1.5 min-h-11 md:min-h-0 whitespace-nowrap transition-colors shrink-0 inline-flex items-center",
                    activeRoomId === null
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-border hover:border-foreground/40"
                  )}
                >
                  All
                </button>
                {roomsWithItems.map((room) => (
                  <button
                    key={room.room_id}
                    type="button"
                    onClick={() => setActiveRoomId(room.room_id)}
                    className={cn(
                      "rounded-full border text-xs font-medium px-3 py-1.5 min-h-11 md:min-h-0 whitespace-nowrap transition-colors shrink-0 inline-flex items-center",
                      activeRoomId === room.room_id
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-muted-foreground border-border hover:border-foreground/40"
                    )}
                  >
                    {room.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Room sections */}
          {visibleRoomOrder.map((roomId) => {
            const roomItems = grouped.get(roomId) ?? []
            if (roomItems.length === 0) return null
            const key = roomId ?? "__unassigned__"
            const roomName = roomId
              ? rooms.find((r) => r.room_id === roomId)?.name ?? "Room"
              : "Unassigned"
            return (
              <RoomSection
                key={key}
                roomName={roomName}
                roomItems={roomItems}
              />
            )
          })}
        </div>
        </div>
        </>
      )}
    </PageContainer>
  )
}
