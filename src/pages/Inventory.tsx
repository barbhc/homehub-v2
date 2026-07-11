import React, { useState, useEffect, useMemo } from "react"
import { Link } from "react-router-dom"
import { PageContainer, PageHeader, EmptyState } from "@/components/layout"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Plus,
  // Item-type icons
  Refrigerator, WashingMachine, Microwave, AirVent, Coffee, Flame,
  Droplets, Thermometer, Wind, Tv, Monitor, Camera, TreePine,
  Armchair, Sparkles, Package, Fan, Lightbulb, Waves, Bath,
  Car, Wifi, Speaker, Sofa, ShowerHead, Toilet, ChefHat, Cctv,
} from "lucide-react"
import { useCurrentHome } from "@/modules/home"
import { getRooms } from "@/modules/home"
import { getItemUnits } from "@/modules/items"
import { getItemIdsWithTasks } from "@/lib/dashboard"
import { RefinedItems } from "@/components/home/RefinedItems"
import { DesktopItems } from "@/components/home/DesktopItems"
import { cn } from "@/lib/utils"
import type { LucideIcon } from "lucide-react"
import type { ItemUnit } from "@/integrations/types"

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

function ItemCard({ item, hasTasks }: { item: ItemUnit; hasTasks: boolean }) {
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
      {hasTasks && (
        <span className="absolute top-2 right-2 size-1.5 rounded-full bg-primary" aria-label="Has tasks" />
      )}
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
  itemIdsWithTasks,
}: {
  roomName: string
  roomItems: ItemUnit[]
  itemIdsWithTasks: Set<string>
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
            hasTasks={itemIdsWithTasks.has(item.item_unit_id)}
          />
        ))}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Inventory page
// ---------------------------------------------------------------------------

export default function Inventory() {
  const { home } = useCurrentHome()
  const [items, setItems] = useState<ItemUnit[]>([])
  const [rooms, setRooms] = useState<Array<{ room_id: string; name: string }>>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [itemIdsWithTasks, setItemIdsWithTasks] = useState<Set<string>>(new Set())
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null) // null = All

  useEffect(() => {
    if (!home?.home_id) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    Promise.all([
      getItemUnits(home.home_id),
      getRooms(home.home_id),
      getItemIdsWithTasks(home.home_id),
    ]).then(([itemsRes, roomsRes, ids]) => {
      setItems(itemsRes.data ?? [])
      setRooms(roomsRes.data ?? [])
      setItemIdsWithTasks(ids)
      setError(itemsRes.error?.message ?? roomsRes.error?.message ?? null)
      setLoading(false)
    })
  }, [home?.home_id])

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

  return (
    <PageContainer>
      {(loading || items.length === 0) && (
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
      )}

      {error && <p className="text-destructive text-sm -mt-2">{error}</p>}

      {loading ? (
        <div className="space-y-6" aria-busy="true" aria-label="Loading inventory">
          {/* Skeleton tab bar */}
          <div className="flex gap-2 overflow-hidden">
            {[80, 64, 96, 72, 80].map((w, i) => (
              <Skeleton key={i} className="h-7 rounded-full shrink-0" style={{ width: w }} />
            ))}
          </div>
          {[1, 2].map((g) => (
            <div key={g} className="space-y-2">
              <Skeleton className="h-4 w-24 ml-1" />
              <div className="grid grid-cols-3 gap-2">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="bg-card border border-border rounded-xl p-3 flex flex-col items-center gap-2">
                    <Skeleton className="size-12 rounded-xl" />
                    <Skeleton className="h-3 w-16" />
                    <Skeleton className="h-2.5 w-12" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title="No items yet"
          description='Your items will appear here. Use "Add Item" to get started.'
        />
      ) : (
        <>
        {/* Redesigned Items — list (mobile) · card grid (desktop) */}
        <div className="lg:hidden -mx-6">
          <div className="mx-auto w-full max-w-[460px]">
            <RefinedItems items={items} rooms={rooms} itemIdsWithTasks={itemIdsWithTasks} />
          </div>
        </div>
        <div className="hidden lg:block">
          <DesktopItems items={items} rooms={rooms} itemIdsWithTasks={itemIdsWithTasks} />
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
                itemIdsWithTasks={itemIdsWithTasks}
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
