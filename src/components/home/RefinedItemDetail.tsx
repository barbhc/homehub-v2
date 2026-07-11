import { useMemo } from "react"
import { Link } from "react-router-dom"
import {
  ChevronLeftIcon, ChevronRightIcon, CameraIcon, MapPinIcon, ShieldCheckIcon, ShieldIcon,
  MegaphoneIcon, WrenchIcon, TagIcon,
  WindIcon, RefrigeratorIcon, FlameIcon, WashingMachineIcon, UtensilsIcon, PackageIcon, type LucideIcon,
} from "lucide-react"
import type { ItemUnit, Room, KnowledgeChunk } from "@/integrations/types"
import type { TaskTemplateWithSchedule } from "@/modules/care"
import { dens } from "@/lib/redesign/tokens"
import { CareBlock } from "@/components/item-care/CareBlock"
import { WarrantyPanel } from "@/components/item-care/WarrantyPanel"

const INK = "var(--hh-ink)", SUB = "var(--hh-sub)", TEAL = "var(--hh-teal)", BG = "var(--hh-bg)"

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
function fmtDate(s: string | null): string | null {
  if (!s) return null
  return new Date(s.length === 10 ? s + "T12:00:00" : s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

function Pill({ children, active }: { children: React.ReactNode; active?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-semibold" style={{ background: active ? "var(--hh-teal-wash)" : "#EEF2F1", color: active ? TEAL : INK }}>
      {children}
    </span>
  )
}

function KV({ k, v, mono, last }: { k: string; v: string; mono?: boolean; last?: boolean }) {
  return (
    <div className="flex items-baseline justify-between py-2.5" style={{ borderBottom: last ? "none" : "0.5px solid var(--hh-line)" }}>
      <span className="text-[13.5px]" style={{ color: SUB }}>{k}</span>
      <span className="text-[13.5px] font-semibold" style={{ color: INK, fontFamily: mono ? "ui-monospace, monospace" : undefined }}>{v}</span>
    </div>
  )
}

export function RefinedItemDetail({
  item, rooms, homeId, tasks, chunks, hasManual, onBack, onOpenManualPage, onItemUpdate, density = "cozy",
}: {
  item: ItemUnit
  rooms: Room[]
  homeId: string
  /** Full task list for this item; CareBlock routes by schedule_type. */
  tasks: TaskTemplateWithSchedule[]
  chunks: KnowledgeChunk[]
  hasManual: boolean
  onBack: () => void
  onOpenManualPage?: (page: number) => void
  onItemUpdate?: (item: ItemUnit) => void
  density?: "spacious" | "cozy" | "compact"
}) {
  const d = dens(density)
  const Glyph = glyphFor(item)
  const roomName = useMemo(() => rooms.find((r) => r.room_id === item.room_id)?.name ?? null, [rooms, item.room_id])
  const warrantyActive = !!item.warranty_expiry_date && new Date(item.warranty_expiry_date) >= new Date()

  const fields: [string, string | null, boolean?][] = [
    ["Room", roomName],
    ["Category", item.category],
    ["Serial", item.serial_number, true],
    ["Purchased", fmtDate(item.purchase_date)],
  ]
  const shownFields = fields.filter(([, v]) => !!v) as [string, string, boolean?][]

  return (
    <div className="flex min-h-full flex-col" style={{ background: BG }}>
      {/* Nav */}
      <div className="flex items-center px-3 pt-1 pb-1.5">
        <button onClick={onBack} className="inline-flex items-center gap-0.5 py-1.5 text-[16px] font-semibold" style={{ color: TEAL }}>
          <ChevronLeftIcon className="size-[22px]" strokeWidth={2.4} /> Items
        </button>
      </div>

      <div className="flex-1 px-5 pb-10" style={{ paddingInline: d.pad, display: "flex", flexDirection: "column", gap: d.stack }}>
        {/* Photo + identity */}
        <div>
          <div className="relative flex h-[150px] items-center justify-center overflow-hidden rounded-[20px]" style={{ background: "linear-gradient(135deg,var(--hh-teal-wash),#DCE9E4)" }}>
            <Glyph className="size-16 opacity-85" strokeWidth={1.3} style={{ color: TEAL }} />
            <button className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-semibold" style={{ background: "color-mix(in srgb, var(--hh-surface) 92%, transparent)", color: INK }}>
              <CameraIcon className="size-[15px]" /> Add photo
            </button>
          </div>
          <h1 className="mt-3.5 text-[26px] font-extrabold tracking-[-0.5px]" style={{ color: INK }}>{item.display_name}</h1>
          {(item.brand || item.model) && <div className="mt-1 text-[15px]" style={{ color: SUB }}>{[item.brand, item.model].filter(Boolean).join(" · ")}</div>}
          <div className="mt-3 flex flex-wrap gap-2">
            {roomName && <Pill><MapPinIcon className="size-[13px]" style={{ color: TEAL }} /> {roomName}</Pill>}
            {item.category && <Pill>{item.category}</Pill>}
            <Pill active={warrantyActive}>
              {warrantyActive ? <ShieldCheckIcon className="size-[13px]" /> : <ShieldIcon className="size-[13px]" />}
              {warrantyActive ? "Under warranty" : "Warranty ended"}
            </Pill>
            {item.recall_status === "found" ? (
              <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-semibold" style={{ background: "var(--hh-slate-soft)", color: "var(--hh-slate)" }}>
                <MegaphoneIcon className="size-[13px]" /> Safety notice
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-semibold" style={{ background: "var(--hh-teal-wash)", color: TEAL }}>
                <ShieldCheckIcon className="size-[13px]" /> No recalls
              </span>
            )}
          </div>
          {item.tags?.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-2">
              {item.tags.map((t) => (
                <span key={t} className="inline-flex items-center gap-1 rounded-full border border-[var(--hh-line2)] px-2.5 py-1 text-[12.5px] font-semibold" style={{ color: SUB }}>
                  <TagIcon className="size-[11px]" /> {t}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Recall — calm safety notice */}
        {item.recall_status === "found" && (
          <div className="rounded-2xl border p-4" style={{ background: "var(--hh-slate-soft)", borderColor: "#DBE6EF" }}>
            <div className="flex items-start gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-[10px] border" style={{ borderColor: "#DBE6EF", background: "var(--hh-surface)" }}>
                <MegaphoneIcon className="size-[18px]" style={{ color: "var(--hh-slate)" }} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-0.5 text-[10.5px] font-bold uppercase tracking-[0.5px]" style={{ color: "var(--hh-slate)" }}>Safety notice</div>
                <div className="text-[15px] font-bold tracking-[-0.2px]" style={{ color: INK }}>Possible recall</div>
                {item.recall_notes && <div className="mt-1 text-[13px] leading-snug" style={{ color: "#5A6863" }}>{item.recall_notes}</div>}
              </div>
            </div>
          </div>
        )}

        {/* Care by rhythm — habits, scheduled upkeep, setup */}
        <CareBlock
          item={item}
          homeId={homeId}
          tasks={tasks}
          chunks={chunks}
          hasManual={hasManual}
          onOpenManualPage={onOpenManualPage}
          onItemUpdate={onItemUpdate}
          m
        />

        {/* Key fields */}
        {shownFields.length > 0 && (
          <div className="rounded-2xl px-4 shadow-[0_1px_2px_rgba(15,23,42,0.05)]" style={{ background: "var(--hh-surface)" }}>
            {shownFields.map(([k, v, mono], i) => <KV key={k} k={k} v={v} mono={mono} last={i === shownFields.length - 1} />)}
          </div>
        )}

        {/* Warranty — status-first; self-hides when nothing is tracked */}
        <WarrantyPanel item={item} homeId={homeId} onItemUpdate={onItemUpdate} m />

        {/* Fix a problem */}
        <Link
          to={`/chat?item=${item.item_unit_id}`}
          className="flex items-center gap-3 rounded-2xl border border-[var(--hh-line2)] px-4 py-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
          style={{ background: "var(--hh-surface)" }}
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl" style={{ background: "var(--hh-teal-wash)" }}>
            <WrenchIcon className="size-[18px]" style={{ color: TEAL }} />
          </span>
          <span className="flex-1 text-[15px] font-semibold tracking-[-0.2px]" style={{ color: INK }}>Fix a problem</span>
          <ChevronRightIcon className="size-[18px] text-[#C2CBD4]" />
        </Link>
      </div>
    </div>
  )
}
