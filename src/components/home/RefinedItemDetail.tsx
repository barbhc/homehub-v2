import { useMemo } from "react"
import { itemSubtitle } from "@/lib/itemSubtitle"
import { Link } from "react-router-dom"
import {
  ChevronLeftIcon, ChevronRightIcon, MapPinIcon, ShieldCheckIcon,
  MegaphoneIcon, MessageCircleQuestionIcon, TagIcon,
  WindIcon, RefrigeratorIcon, FlameIcon, WashingMachineIcon, UtensilsIcon, PackageIcon, PencilIcon, SparklesIcon, type LucideIcon } from "lucide-react"
import type { ItemUnit, Room, KnowledgeChunk } from "@/integrations/types"
import type { TaskTemplateWithSchedule } from "@/modules/care"
import { dens } from "@/lib/redesign/tokens"
import { CareBlock } from "@/components/item-care/CareBlock"
import { categoryLabel } from "@/lib/categoryLabel"
import { updateItemUnit, getItemUnits } from "@/modules/items"
import { lateRoomSuggestion, lateNameSuggestion } from "@/lib/lateSuggestions"
import { composeItemName } from "@/lib/itemName"
import { fmtMoney } from "@/lib/itemMoney"
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

/** A lookup suggestion, inline on the field it belongs to (round 18): the
 *  value sits greyed and italic in the row it would fill, behind its own Add.
 *  Explicitly NOT a card announcing a find — the owner rejected that twice,
 *  first on the add screen, then as a pop-up here. */
function SuggestionKV({ k, v, onAdd, last }: { k: string; v: string; onAdd?: () => void; last?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2.5" style={{ borderBottom: last ? "none" : "0.5px solid var(--hh-line)" }}>
      <span className="text-[13.5px]" style={{ color: SUB }}>{k}</span>
      <span className="flex items-center gap-2">
        <span className="text-[13.5px] italic" style={{ color: SUB }}>{v}</span>
        {onAdd && (
          <button type="button" onClick={onAdd}
            className="rounded-full border px-2.5 py-0.5 text-[11.5px] font-bold"
            style={{ borderColor: TEAL, color: TEAL }}>
            Add
          </button>
        )}
      </span>
    </div>
  )
}

export function RefinedItemDetail({
  item, rooms, homeId, tasks, chunks, hasManual, parsingManual, manualAwaitingReview, onBack, onOpenManualPage, canOpenManual, onItemUpdate, onAddManual, onEditCategory, density = "cozy",
  reviewAction, recordsSlot, onEditRoom, onEditDetails, focusTaskId = null,
}: {
  focusTaskId?: string | null
  item: ItemUnit
  rooms: Room[]
  homeId: string
  /** Full task list for this item; CareBlock routes by schedule_type. */
  tasks: TaskTemplateWithSchedule[]
  chunks: KnowledgeChunk[]
  hasManual: boolean
  parsingManual?: boolean
  /** HH-141: read, findings not saved yet. */
  manualAwaitingReview?: boolean
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
  /** Opens the one editable Details & records form. Without it the whole
   *  section is display-only, which is what it was before HH-96. */
  onEditDetails?: () => void
}) {
  const d = dens(density)
  const Glyph = glyphFor(item)
  const roomName = useMemo(() => rooms.find((r) => r.room_id === item.room_id)?.name ?? null, [rooms, item.room_id])
  const fields: [string, string | null, boolean?][] = [
    ["Room", roomName],
    ["Category", categoryLabel(item)],
    ["Serial", item.serial_number, true],
    ["Purchased", fmtDate(item.purchase_date)],
    // HH-96: enterable since the Details sheet exists, so they can be shown.
    // Listing a field the phone had no way to fill was the old dead end.
    ["Price paid", item.price_paid != null ? fmtMoney(item.price_paid) : null],
    ["Store", item.store_name],
  ]
  const shownFields = fields.filter(([, v]) => !!v) as [string, string, boolean?][]

  /**
   * The room and name the add screen could not offer, because the item's TYPE
   * arrived after it was created — from the product lookup or the manual parse.
   * One tap each, and nothing changes on its own: the room is a fact only the
   * owner knows, and a name someone is looking at should not rearrange itself.
   */
  const roomSuggestion = useMemo(() => lateRoomSuggestion(item, rooms), [item, rooms])
  const nameSuggestion = useMemo(() => lateNameSuggestion(item), [item])
  const applyRoomSuggestion = async (room: Room) => {
    const r = await updateItemUnit(homeId, item.item_unit_id, { room_id: room.room_id })
    if (r.data) onItemUpdate?.(r.data)
  }
  const applyNameSuggestion = async (label: string) => {
    // Dedupe at APPLY time rather than on every render: composeItemName appends
    // the room when the plain type is taken ("Dishwasher — Kitchen"), and that
    // needs every other item's name, which is a read worth doing once, here.
    const existing = await getItemUnits(homeId)
    const name = composeItemName({
      typeLabel: label,
      brand: item.brand,
      model: item.model,
      room: rooms.find((rm) => rm.room_id === item.room_id)?.name ?? null,
      existingNames: (existing.data ?? [])
        .filter((i) => i.item_unit_id !== item.item_unit_id)
        .map((i) => i.display_name),
    })
    const r = await updateItemUnit(homeId, item.item_unit_id, { display_name: name })
    if (r.data) onItemUpdate?.(r.data)
  }

  // Lookup suggestions (round 18): applied is DERIVED — a suggestion whose key
  // already has a value has been accepted (or typed over) and stops rendering,
  // so there is no separate applied-state to drift out of sync.
  const catFields = (item.category_fields ?? {}) as Record<string, unknown>
  const suggestions = (item.lookup_dismissed_at ? [] : item.lookup_suggestions ?? []).filter(
    (sug) => catFields[sug.key] == null || catFields[sug.key] === "",
  )
  const acceptSuggestion = async (sug: { key: string; value: string | number | boolean }) => {
    const r = await updateItemUnit(homeId, item.item_unit_id, {
      category_fields: { ...catFields, [sug.key]: sug.value },
    })
    if (r.data) onItemUpdate?.(r.data)
  }
  const hideSuggestions = async () => {
    const r = await updateItemUnit(homeId, item.item_unit_id, { lookup_dismissed_at: new Date().toISOString() })
    if (r.data) onItemUpdate?.(r.data)
  }

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
          {/* HH-125: "This is a rice cooker as a user I should be able to edit
              this name." Renaming has existed since #168, behind Edit in
              Details & records — which is not where the thought happens. The
              thought happens looking at the wrong name, so the affordance goes
              on the name, exactly as the room chip already does. */}
          {/* HH-136: the name is the first thing on the page now. The photo
              control sits beside it — available, not announcing itself. When a
              photo EXISTS it still renders as a tile, because then it is
              content rather than an invitation. */}
          <div className="mt-1 flex items-start gap-3">
            <div className="min-w-0 flex-1">
              {onEditDetails ? (
                <button
                  type="button"
                  onClick={onEditDetails}
                  className="flex items-center gap-2 text-left"
                  aria-label={`Rename ${item.display_name}`}
                >
                  <h1 className="text-[26px] font-extrabold tracking-[-0.5px]" style={{ color: INK }}>{item.display_name}</h1>
                  <PencilIcon className="size-[15px] shrink-0" style={{ color: TEAL }} aria-hidden="true" />
                </button>
              ) : (
                <h1 className="text-[26px] font-extrabold tracking-[-0.5px]" style={{ color: INK }}>{item.display_name}</h1>
              )}
            </div>
            <ItemPhoto
              item={item}
              homeId={homeId}
              Glyph={Glyph}
              onItemUpdate={onItemUpdate}
              emptyVariant="icon"
              className="size-11 shrink-0 rounded-xl"
              glyphClassName="size-5"
            />
          </div>
          {/* HH-86: only when it adds something — since #139 composes blank
              names as "Brand Model", the old unconditional line was the same
              words twice for every newly added item. */}
          {itemSubtitle(item.display_name, item.brand, item.model) && (
            <div className="mt-1 text-[15px]" style={{ color: SUB }}>{itemSubtitle(item.display_name, item.brand, item.model)}</div>
          )}
          {(roomSuggestion || nameSuggestion) && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-[12px]" style={{ color: SUB }}>Suggested</span>
              {roomSuggestion && (
                <button
                  type="button"
                  onClick={() => void applyRoomSuggestion(roomSuggestion)}
                  className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12.5px] font-semibold"
                  style={{ borderColor: TEAL, color: TEAL }}
                >
                  <MapPinIcon className="size-[13px]" /> {roomSuggestion.name}
                </button>
              )}
              {nameSuggestion && (
                <button
                  type="button"
                  onClick={() => void applyNameSuggestion(nameSuggestion)}
                  className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12.5px] font-semibold"
                  style={{ borderColor: TEAL, color: TEAL }}
                >
                  <PencilIcon className="size-[13px]" /> Name it &ldquo;{nameSuggestion}&rdquo;
                </button>
              )}
            </div>
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
        <SectionLabel action={reviewAction}>Upkeep</SectionLabel>
        <CareBlock
          item={item}
          homeId={homeId}
          tasks={tasks}
          chunks={chunks}
          hasManual={hasManual}
          parsingManual={parsingManual}
          manualAwaitingReview={manualAwaitingReview}
          onOpenManualPage={onOpenManualPage}
          canOpenManual={canOpenManual}
          onAddManual={onAddManual}
          onItemUpdate={onItemUpdate}
          focusTaskId={focusTaskId}
          m
        />

        {/* HH-91 / round-9 redesign: Ask sits BELOW the upkeep it answers
            about. Its own subtitle admits the dependency; before a manual
            exists it says so plainly instead of promising, and drops the teal
            invitation styling. */}
        <Link
          to={`/chat?item=${item.item_unit_id}`}
          className="mt-4 flex items-center gap-3 rounded-2xl border px-3.5 py-3"
          style={hasManual
            ? { background: "var(--hh-teal-wash)", borderColor: "color-mix(in srgb, var(--hh-teal) 22%, transparent)" }
            : { background: "var(--hh-surface)", borderColor: "var(--hh-line)", opacity: manualAwaitingReview ? 1 : 0.8 }}
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-xl" style={{ background: "var(--hh-surface)" }}>
            <MessageCircleQuestionIcon className="size-[18px]" style={{ color: TEAL }} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-bold tracking-[-0.2px]" style={{ color: TEAL }}>Have a question or a problem?</span>
            <span className="block text-[11.5px]" style={{ color: SUB }}>
              {/* HH-141: the third state reaches here too. "Works best once the
                manual is added" sat two cards under one saying we had finished
                reading it — the same contradiction the Upkeep card had, on the
                same screen. Answers come from the chunks the SAVE writes, so
                this state is honest about what unlocks it. */}
            {hasManual
              ? "Ask about this item — answers come from your manual"
              : manualAwaitingReview
                ? "Save what we found and answers come from your manual."
                : "Works best once the manual is added."}
            </span>
          </span>
          <ChevronRightIcon className="size-[18px] shrink-0" style={{ color: TEAL, opacity: 0.6 }} />
        </Link>



        {/* HH-96: one way in for the whole section, not an "Add" on every empty
            row. A column of open fields for a serial number nobody means to
            type reads as a page that is never finished — the owner's call. */}
        <SectionLabel action={onEditDetails ? (
          <button type="button" onClick={onEditDetails}
            className="shrink-0 rounded-full border px-3 py-1 text-[12.5px] font-bold"
            style={{ borderColor: "var(--hh-line2)", color: TEAL }}>
            {shownFields.length > 0 ? "Edit" : "Add"}
          </button>
        ) : undefined}>Details &amp; records</SectionLabel>
        {shownFields.length > 0 || suggestions.length > 0 ? (
          <div className="rounded-2xl px-4 shadow-[0_1px_2px_rgba(15,23,42,0.05)]" style={{ background: "var(--hh-surface)" }}>
            {shownFields.map(([k, v, mono], i) => (
              <KV key={k} k={k} v={v} mono={mono} last={suggestions.length === 0 && i === shownFields.length - 1} />
            ))}
            {suggestions.map((sug, i) => (
              <SuggestionKV key={sug.key} k={sug.label} v={String(sug.value)}
                onAdd={() => void acceptSuggestion(sug)} last={i === suggestions.length - 1} />
            ))}
          </div>
        ) : onEditDetails && (
          // Empty used to render nothing at all — a heading with a void under
          // it, and no hint that any of this could be filled in.
          <button type="button" onClick={onEditDetails}
            className="rounded-2xl px-4 py-3.5 text-left shadow-[0_1px_2px_rgba(15,23,42,0.05)]"
            style={{ background: "var(--hh-surface)" }}>
            <span className="block text-[13.5px] font-semibold" style={{ color: INK }}>Nothing recorded yet</span>
            <span className="block text-[12px]" style={{ color: SUB }}>
              Serial, purchase date, price, warranty — add what you have.
            </span>
          </button>
        )}

        {suggestions.length > 0 && (
          <p className="px-1 text-[12px] leading-relaxed" style={{ color: SUB }}>
            <SparklesIcon className="mr-1 inline size-3.5 align-[-2px]" style={{ color: TEAL }} aria-hidden />
            We found these on a product page, not in your manual.{" "}
            <button type="button" onClick={() => void hideSuggestions()} className="underline underline-offset-2">
              Hide them
            </button>
          </p>
        )}

        {/* Warranty — status-first; self-hides when nothing is tracked */}
        <WarrantyPanel item={item} homeId={homeId} onEdit={onEditDetails} onItemUpdate={onItemUpdate} m />

        {recordsSlot}
      </div>
    </div>
  )
}
