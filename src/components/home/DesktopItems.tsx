import { useMemo, useState } from "react"
import { Link } from "react-router-dom"
import {
  WindIcon, RefrigeratorIcon, FlameIcon, WashingMachineIcon, UtensilsIcon, PackageIcon, type LucideIcon,
} from "lucide-react"
import type { ItemUnit } from "@/integrations/types"
import { TIER } from "@/lib/redesign/tokens"

const INK = "var(--hh-ink)", SUB = "var(--hh-sub)", FAINT = "var(--hh-faint)", TEAL = "var(--hh-teal)"

const KW: [RegExp, LucideIcon][] = [
  [/fridge|refriger/i, RefrigeratorIcon],
  [/hvac|furnace|a\/c|air|heat pump/i, WindIcon],
  [/water heater|boiler|flame|gas/i, FlameIcon],
  [/wash|dryer|laundry/i, WashingMachineIcon],
  [/dishwash|oven|range|cook|stove/i, UtensilsIcon],
]
function glyphFor(item: ItemUnit): LucideIcon {
  const hay = `${item.display_name} ${item.category ?? ""}`
  for (const [re, icon] of KW) if (re.test(hay)) return icon
  return PackageIcon
}

type SortMode = "room" | "category" | "recent"

function Pill({ active, count, children, onClick }: { active: boolean; count?: number; children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className="rounded-full border px-3.5 py-1.5 text-[13px] font-semibold" style={active ? { borderColor: TEAL, background: "var(--hh-teal-wash)", color: TEAL } : { borderColor: "var(--hh-line2)", background: "var(--hh-surface)", color: SUB }}>
      {children}{count != null ? <span className="ml-1.5 opacity-70">{count}</span> : null}
    </button>
  )
}

export function DesktopItems({
  items, rooms, itemIdsWithTasks,
}: {
  items: ItemUnit[]
  rooms: Array<{ room_id: string; name: string }>
  itemIdsWithTasks: Set<string>
}) {
  const [sort, setSort] = useState<SortMode>("room")
  const [roomFilter, setRoomFilter] = useState<string | "all">("all")
  const roomName = useMemo(() => new Map(rooms.map((r) => [r.room_id, r.name])), [rooms])

  const roomsWithItems = useMemo(() => {
    const ids = [...new Set(items.map((i) => i.room_id).filter(Boolean) as string[])]
    return ids.map((id) => ({ id, name: roomName.get(id) ?? "Room", count: items.filter((i) => i.room_id === id).length }))
  }, [items, roomName])

  const visible = roomFilter === "all" ? items : items.filter((i) => i.room_id === roomFilter)
  const groups = useMemo(() => {
    if (sort === "recent") return [{ key: null as string | null, items: [...visible].reverse() }]
    const keyOf = (i: ItemUnit) => (sort === "category" ? (i.category ?? "Other") : (i.room_id ? roomName.get(i.room_id) ?? "Unassigned" : "Unassigned"))
    const map = new Map<string, ItemUnit[]>()
    for (const i of visible) { const k = keyOf(i); (map.get(k) ?? map.set(k, []).get(k)!).push(i) }
    return [...map.entries()].map(([key, items]) => ({ key, items }))
  }, [visible, sort, roomName])

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-[27px] font-extrabold tracking-[-0.6px]" style={{ color: INK }}>Items</h1>
        <div className="mt-1.5 text-[13px]" style={{ color: SUB }}>{items.length} items across {roomsWithItems.length} rooms</div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Pill active={roomFilter === "all"} count={items.length} onClick={() => setRoomFilter("all")}>All</Pill>
        {roomsWithItems.map((r) => <Pill key={r.id} active={roomFilter === r.id} count={r.count} onClick={() => setRoomFilter(r.id)}>{r.name}</Pill>)}
        <span className="mx-1.5 h-5 w-px self-center" style={{ background: "var(--hh-line2)" }} />
        <span className="text-[13px] font-semibold" style={{ color: SUB }}>Sort</span>
        {([["room", "Room"], ["category", "Type"], ["recent", "Recent"]] as [SortMode, string][]).map(([k, l]) => (
          <Pill key={k} active={sort === k} onClick={() => setSort(k)}>{l}</Pill>
        ))}
      </div>

      <div className="flex flex-col gap-6">
        {groups.map((g) => (
          <div key={g.key ?? "all"}>
            {g.key && <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.6px]" style={{ color: SUB }}>{g.key}</div>}
            <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))" }}>
              {g.items.map((it) => {
                const Glyph = glyphFor(it)
                return (
                  <Link key={it.item_unit_id} to={`/items/${it.item_unit_id}`} className="relative flex min-h-[168px] flex-col gap-3 rounded-[18px] bg-[var(--hh-surface)] p-4 shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
                    {itemIdsWithTasks.has(it.item_unit_id) && <span className="absolute right-3.5 top-3.5 size-2 rounded-full" style={{ background: TIER.essential.dot }} />}
                    <div className="flex size-12 items-center justify-center rounded-xl" style={{ background: "linear-gradient(135deg,#EEF3F1,#E3ECE8)", color: TEAL }}>
                      <Glyph className="size-6" strokeWidth={1.8} />
                    </div>
                    <div>
                      <div className="text-[14.5px] font-bold leading-tight tracking-[-0.2px]" style={{ color: INK }}>{it.display_name}</div>
                      {it.brand && <div className="mt-0.5 text-[12.5px]" style={{ color: SUB }}>{it.brand}</div>}
                    </div>
                    <div className="mt-auto flex items-center justify-between">
                      <span className="text-[10.5px] font-bold uppercase tracking-[0.3px]" style={{ color: FAINT }}>{sort === "room" ? it.category : (it.room_id ? roomName.get(it.room_id) : "")}</span>
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
