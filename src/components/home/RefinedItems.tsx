import { useMemo, useState } from "react"
import { Link } from "react-router-dom"
import {
  PlusIcon, SearchIcon, ChevronRightIcon,
  WindIcon, RefrigeratorIcon, FlameIcon, WashingMachineIcon, UtensilsIcon,
  PackageIcon, type LucideIcon,
} from "lucide-react"
import type { ItemUnit } from "@/integrations/types"
import { TIER, dens } from "@/lib/redesign/tokens"

const INK = "var(--hh-ink)", SUB = "var(--hh-sub)", TEAL = "var(--hh-teal)", BG = "var(--hh-bg)"

// Compact keyword→glyph resolver (mirrors the Inventory page's intent).
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

function ItemThumb({ item, size }: { item: ItemUnit; size: number }) {
  const Icon = glyphFor(item)
  return (
    <div
      style={{ width: size, height: size, background: "linear-gradient(135deg,#EEF3F1,#E3ECE8)", color: TEAL }}
      className="flex shrink-0 items-center justify-center rounded-xl"
    >
      <Icon style={{ width: size * 0.5, height: size * 0.5 }} strokeWidth={1.8} />
    </div>
  )
}

type SortMode = "room" | "category" | "recent"

export function RefinedItems({
  items,
  rooms,
  itemIdsWithTasks,
  density = "cozy",
}: {
  items: ItemUnit[]
  rooms: Array<{ room_id: string; name: string }>
  itemIdsWithTasks: Set<string>
  density?: "spacious" | "cozy" | "compact"
}) {
  const d = dens(density)
  const [sort, setSort] = useState<SortMode>("room")
  const [query, setQuery] = useState("")

  const roomName = useMemo(() => {
    const m = new Map<string, string>()
    for (const r of rooms) m.set(r.room_id, r.name)
    return m
  }, [rooms])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter(
      (i) => i.display_name.toLowerCase().includes(q) || (i.brand ?? "").toLowerCase().includes(q)
    )
  }, [items, query])

  const groups = useMemo(() => {
    if (sort === "recent") return [{ key: null as string | null, items: [...filtered].reverse() }]
    const keyOf = (i: ItemUnit) =>
      sort === "category" ? (i.category ?? "Other") : (i.room_id ? roomName.get(i.room_id) ?? "Unassigned" : "Unassigned")
    const map = new Map<string, ItemUnit[]>()
    for (const i of filtered) {
      const k = keyOf(i)
      const list = map.get(k) ?? []
      list.push(i)
      map.set(k, list)
    }
    return [...map.entries()].map(([key, items]) => ({ key, items }))
  }, [filtered, sort, roomName])

  return (
    <div className="flex min-h-full flex-col" style={{ background: BG }}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-2.5" style={{ paddingInline: d.pad }}>
        <h1 className="text-[28px] font-extrabold tracking-[-0.7px]" style={{ color: INK }}>Items</h1>
        <Link
          to="/inventory/add"
          aria-label="Add item"
          className="flex items-center justify-center rounded-full"
          style={{ width: d.tap + 6, height: d.tap + 6, background: TEAL }}
        >
          <PlusIcon className="size-5 text-white" strokeWidth={2.6} />
        </Link>
      </div>

      <div className="flex flex-1 flex-col px-5 pt-4" style={{ paddingInline: d.pad }}>
        {/* Search */}
        <div className="mb-3 flex items-center gap-2.5 rounded-xl border border-[var(--hh-line)] px-3.5 py-2.5" style={{ background: "var(--hh-surface)" }}>
          <SearchIcon className="size-4 shrink-0 text-[var(--hh-faint)]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${items.length} items…`}
            className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-[var(--hh-faint)]"
            style={{ color: INK }}
          />
        </div>

        {/* Sort */}
        <div className="mb-4 flex items-center gap-2">
          <span className="shrink-0 text-[13px] font-semibold" style={{ color: SUB }}>Sort</span>
          {([["room", "Room"], ["category", "Type"], ["recent", "Recent"]] as [SortMode, string][]).map(([k, label]) => {
            const on = sort === k
            return (
              <button
                key={k}
                type="button"
                onClick={() => setSort(k)}
                className="rounded-full border px-3.5 py-1.5 text-[13px] font-semibold"
                style={on ? { borderColor: TEAL, background: "var(--hh-teal-wash)", color: TEAL } : { borderColor: "var(--hh-line2)", background: "var(--hh-surface)", color: SUB }}
              >
                {label}
              </button>
            )
          })}
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-2xl p-6 text-center text-[14px] shadow-[0_1px_2px_rgba(15,23,42,0.05)]" style={{ color: SUB, background: "var(--hh-surface)" }}>
            No items match “{query}”.
          </div>
        ) : (
          groups.map((g) => (
            <div key={g.key ?? "all"} style={{ marginBottom: d.stack }}>
              {g.key && (
                <div className="mb-2 pl-0.5 text-xs font-bold uppercase tracking-[0.6px]" style={{ color: SUB }}>{g.key}</div>
              )}
              <div className="overflow-hidden rounded-2xl shadow-[0_1px_2px_rgba(15,23,42,0.05)]" style={{ background: "var(--hh-surface)" }}>
                {g.items.map((it, i) => (
                  <Link
                    key={it.item_unit_id}
                    to={`/items/${it.item_unit_id}`}
                    className="flex items-center gap-3.5"
                    style={{ padding: `${d.rowPy}px ${d.cardPad}px`, borderBottom: i === g.items.length - 1 ? "none" : "0.5px solid var(--hh-line)" }}
                  >
                    <ItemThumb item={it} size={d.tap + 20} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[15px] font-semibold tracking-[-0.2px]" style={{ color: INK }}>{it.display_name}</div>
                      <div className="mt-0.5 text-[12.5px]" style={{ color: SUB }}>
                        {[it.brand, sort === "room" ? it.category : (it.room_id ? roomName.get(it.room_id) : null)].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                    {itemIdsWithTasks.has(it.item_unit_id) && (
                      <span title="Task due" className="size-2 shrink-0 rounded-full" style={{ background: TIER.essential.dot }} />
                    )}
                    <ChevronRightIcon className="size-[18px] text-[#C2CBD4]" />
                  </Link>
                ))}
              </div>
            </div>
          ))
        )}
        <div className="h-2" />
      </div>
    </div>
  )
}
