import { useMemo } from "react"
import { itemSubtitle } from "@/lib/itemSubtitle"
import { Link } from "react-router-dom"
import {
  ChevronLeftIcon, ChevronRightIcon, MapPinIcon, ShieldCheckIcon,
  MegaphoneIcon, MessageCircleQuestionIcon, TagIcon,
  WindIcon, RefrigeratorIcon, FlameIcon, WashingMachineIcon, UtensilsIcon, PackageIcon, type LucideIcon,
} from "lucide-react"
import type { ItemUnit, Room, KnowledgeChunk } from "@/integrations/types"
import type { TaskTemplateWithSchedule } from "@/modules/care"
import { dens } from "@/lib/redesign/tokens"
import { CareBlock } from "@/components/item-care/CareBlock"
import { categoryLabel } from "@/lib/categoryLabel"
import { WarrantyPanel } from "@/components/item-care/WarrantyPanel"
import { ItemPhoto } from "./ItemPhoto"

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
    // Token, not a literal: #EEF2F1 stayed light in dark mode, so the ink-coloured
    // label sat on a near-white pill and vanished.
    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-semibold" style={{ background: active ? "var(--hh-teal-wash)" : "var(--hh-surface2)", color: active ? TEAL : INK }}>
      {children}
    </span>
  )
}

/**
 * The page's two top-level headings. Until now the item page was a flat stack of
 * thirteen cards with no hierarchy, so nothing told you where "what do I do" ended
 * and "what is this thing" began.
 */
function SectionLabel({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="text-[17px] font-extrabold tracking-[-0.3px]" style={{ color: INK }}>{children}</span>
      <span className="h-px flex-1" style={{ background: "var(--hh-line)" }} />
      {action}
    </div>
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
  item, rooms, homeId, tasks, chunks, hasManual, parsingManual, onBack, onOpenManualPage, canOpenManual, onItemUpdate, onAddManual, onEditCategory, density = "cozy",
  reviewAction, recordsSlot, onEditRoom,
}: {
  item: ItemUnit
  rooms: Room[]
  homeId: string
  /** Full task list for this item; CareBlock routes by schedule_type. */
  tasks: TaskTemplateWithSchedule[]
  chunks: KnowledgeChunk[]
  hasManual: boolean
  parsingManual?: boolean
  onBack: () => void
  onOpenManualPage?: (page: number) => void
  canOpenManual?: boolean
  /** Opens the add-manual dialog from the empty Upkeep state. */
  onAddManual?: () => void
  /** Makes the category chip tappable, the way onEditRoom does for room. */
  onEditCategory?: () => void
  onItemUpdate?: (item: ItemUnit) => void
  density?: "spacious" | "cozy" | "compact"
  /** "Review these tasks" — sits in the Upkeep heading, where the decision it
   *  changes actually lives, instead of eight cards further down. */
  reviewAction?: React.ReactNode
  /** Manual, specs, saved answers, history, delete — the reference half of the
   *  page, rendered by the caller under one heading. */
  recordsSlot?: React.ReactNode
  /** Makes the room pill tappable (opens the caller's room picker). Mobile has
   *  no Edit dialog, so without this the room is read-only here. */
  onEditRoom?: () => void
}) {
  const d = dens(density)
  const Glyph = glyphFor(item)
  const roomName = useMemo(() => rooms.find((r) => r.room_id === item.room_id)?.name ?? null, [rooms, item.room_id])
  const fields: [string, string | null, boolean?][] = [
    ["Room", roomName],
    ["Category", categoryLabel(item)],
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
          <ItemPhoto
            item={item}
            homeId={homeId}
            Glyph={Glyph}
            onItemUpdate={onItemUpdate}
            emptyVariant="cta"
            className="h-[150px] w-full rounded-[20px]"
            glyphClassName="size-16"
          />
          <h1 className="mt-3.5 text-[26px] font-extrabold tracking-[-0.5px]" style={{ color: INK }}>{item.display_name}</h1>
          {/* HH-86: only when it adds something — since #139 composes blank
              names as "Brand Model", the old unconditional line was the same
              words twice for every newly added item. */}
          {itemSubtitle(item.display_name, item.brand, item.model) && (
            <div className="mt-1 text-[15px]" style={{ color: SUB }}>{itemSubtitle(item.display_name, item.brand, item.model)}</div>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {onEditRoom ? (
              // Tappable: the room is the one basic fact people want to fix on
              // the spot ("that's in the garage, not the kitchen").
              <button type="button" onClick={onEditRoom} className="inline-flex">
                <Pill active={!roomName}>
                  <MapPinIcon className="size-[13px]" style={{ color: TEAL }} />
                  {roomName ?? "Add room"}
                </Pill>
              </button>
            ) : (
              roomName && <Pill><MapPinIcon className="size-[13px]" style={{ color: TEAL }} /> {roomName}</Pill>
            )}
            {(() => {
              const label = categoryLabel(item)
              if (!label && !onEditCategory) return null
              // Same affordance as room: the two facts sitting side by side
              // behaving differently is what made this read as broken.
              return onEditCategory ? (
                <button type="button" onClick={onEditCategory} className="inline-flex">
                  <Pill active={!label}>{label ?? "Add category"}</Pill>
                </button>
              ) : (
                <Pill>{label}</Pill>
              )
            })()}
            {/* Warranty is NOT a chip here. "Warranty ended" at the top of the page
                is a small piece of bad news about a thing you own, delivered before
                anything useful — and it's the state of most items most of the time.
                It lives in Details & records, where you go to look it up. */}
            {item.recall_status === "found" ? (
              <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-semibold" style={{ background: "var(--hh-slate-soft)", color: "var(--hh-slate)" }}>
                <MegaphoneIcon className="size-[13px]" /> Safety notice
              </span>
            ) : item.recall_status === "none_found" ? (
              // Only claim "no recalls" when a check ACTUALLY ran. A null status
              // means we never looked, and saying otherwise is asserting a safety
              // fact we haven't verified.
              <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-semibold" style={{ background: "var(--hh-teal-wash)", color: TEAL }}>
                <ShieldCheckIcon className="size-[13px]" /> No recalls
              </span>
            ) : null}
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

        {/* "I have a question / something's wrong" — high on the page, phrased the
            way a person phrases it. It used to be a link called "Fix a problem"
            at the very bottom, below every reference section, which is the last
            place someone with a broken appliance will look. */}
        <Link
          to={`/chat?item=${item.item_unit_id}`}
          className="flex items-center gap-3 rounded-2xl border px-3.5 py-3"
          style={{ background: "var(--hh-teal-wash)", borderColor: "color-mix(in srgb, var(--hh-teal) 22%, transparent)" }}
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-xl" style={{ background: "var(--hh-surface)" }}>
            <MessageCircleQuestionIcon className="size-[18px]" style={{ color: TEAL }} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-bold tracking-[-0.2px]" style={{ color: TEAL }}>Have a question or a problem?</span>
            <span className="block text-[11.5px]" style={{ color: SUB }}>
              {hasManual ? "Ask about this item — answers come from your manual" : "Ask about this item"}
            </span>
          </span>
          <ChevronRightIcon className="size-[18px] shrink-0" style={{ color: TEAL, opacity: 0.6 }} />
        </Link>

        <SectionLabel action={reviewAction}>Upkeep</SectionLabel>
        <CareBlock
          item={item}
          homeId={homeId}
          tasks={tasks}
          chunks={chunks}
          hasManual={hasManual}
          parsingManual={parsingManual}
          onOpenManualPage={onOpenManualPage}
          canOpenManual={canOpenManual}
          onAddManual={onAddManual}
          onItemUpdate={onItemUpdate}
          m
        />

        <SectionLabel>Details &amp; records</SectionLabel>
        {shownFields.length > 0 && (
          <div className="rounded-2xl px-4 shadow-[0_1px_2px_rgba(15,23,42,0.05)]" style={{ background: "var(--hh-surface)" }}>
            {shownFields.map(([k, v, mono], i) => <KV key={k} k={k} v={v} mono={mono} last={i === shownFields.length - 1} />)}
          </div>
        )}

        {/* Warranty — status-first; self-hides when nothing is tracked */}
        <WarrantyPanel item={item} homeId={homeId} onItemUpdate={onItemUpdate} m />

        {recordsSlot}
      </div>
    </div>
  )
}
