/**
 * One care-library suggestion, wherever it appears (item page band, Tasks
 * page group, home setup results).
 *
 * The owner's note on the first mock (2026-09-06): "the left column looks
 * squeezed with all of the detail, while the Add button and Not this one
 * takes up a lot of the space." So the detail owns the full width — title,
 * cadence · minutes · how, and a one-line why — and the two actions sit on
 * their own line beneath as text buttons with a full-height tap area.
 *
 * Every row says where it came from. Nothing here schedules anything.
 */
import { useState } from "react"
import { CheckIcon } from "lucide-react"
import type { Suggestion } from "../../../shared/care/library"

const INK = "var(--hh-ink, #0B1220)"
const SUB = "var(--hh-sub, #4B5563)"
const FAINT = "var(--hh-faint, #8A9089)"
const TEAL = "var(--hh-teal, #1B6B5A)"
const CLAY = "var(--hh-clay, #C2410C)"
const AMBER = "var(--hh-gold, #8A5A12)"
const AMBER_SOFT = "var(--hh-gold-soft, #FBF3E2)"
const SLATE = "var(--hh-slate, #455C72)"
const SLATE_SOFT = "var(--hh-slate-soft, #F1F5F8)"

export type SuggestedRowProps = {
  suggestion: Suggestion
  /** Where the row lives — the row prefixes the item on the Tasks page. */
  itemName?: string | null
  onAdd: () => Promise<{ error: { message: string } | null }>
  onDismiss: () => Promise<{ error: { message: string } | null }>
  last?: boolean
}

export function SuggestedRow({ suggestion, itemName, onAdd, onDismiss, last }: SuggestedRowProps) {
  const { entry, backstopFor } = suggestion
  const [busy, setBusy] = useState<"add" | "dismiss" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const run = async (which: "add" | "dismiss") => {
    setBusy(which)
    setError(null)
    const res = await (which === "add" ? onAdd() : onDismiss())
    setBusy(null)
    // A failed write leaves the row exactly where it was, with the reason —
    // never a row that vanished as if it had worked.
    if (res.error) setError(res.error.message)
  }
  const meta = [itemName, entry.cadenceLabel, `${entry.minutes} min`, entry.how].filter(Boolean).join(" · ")
  return (
    <div
      data-testid="suggested-row"
      className="flex flex-col gap-1.5 px-4 pb-2.5 pt-3.5"
      style={{ borderTop: last ? "none" : "1px solid var(--hh-line, rgba(15,23,42,.10))", background: "var(--hh-surface2, #FBFCFB)" }}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[14px] font-semibold tracking-[-0.2px]" style={{ color: INK }}>
          {backstopFor ? `Backstop for “${backstopFor.title}”` : entry.title}
        </span>
        <span className="rounded-full px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.3px]" style={{ background: AMBER_SOFT, color: AMBER }}>Suggested</span>
        {entry.pro && <span className="rounded-full px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.3px]" style={{ background: SLATE_SOFT, color: SLATE }}>A pro</span>}
      </div>
      <span className="text-[12px] leading-snug" style={{ color: SUB }}>
        {backstopFor ? `The machine tells you when. Add a reminder ${entry.cadenceLabel.toLowerCase()} as a backstop?` : meta}
      </span>
      <span className="text-[11.5px] leading-snug" style={{ color: FAINT }}>
        {backstopFor ? `${entry.source}.` : `Why: ${entry.why}`}
      </span>
      {error && (
        <span role="alert" className="text-[12px] font-medium" style={{ color: CLAY }}>{error}</span>
      )}
      <div className="mt-0.5 flex items-center gap-[18px]">
        <button
          type="button"
          onClick={() => void run("add")}
          disabled={busy !== null}
          aria-label={`${backstopFor ? "Add backstop" : "Add"} ${entry.title}`}
          className="inline-flex min-h-11 items-center gap-1 text-[13px] font-bold disabled:opacity-50"
          style={{ color: TEAL }}
        >
          <CheckIcon className="size-[13px]" strokeWidth={3} />
          {busy === "add" ? "Adding…" : backstopFor ? "Add backstop" : "Add"}
        </button>
        <button
          type="button"
          onClick={() => void run("dismiss")}
          disabled={busy !== null}
          aria-label={`Not this one — ${entry.title}`}
          className="inline-flex min-h-11 items-center text-[13px] font-semibold disabled:opacity-50"
          style={{ color: FAINT }}
        >
          {busy === "dismiss" ? "Removing…" : "Not this one"}
        </button>
      </div>
    </div>
  )
}

/** The band's footnote — the same sentence on every surface, so provenance never varies. */
export function SuggestedSource({ kindLabel }: { kindLabel: string }) {
  return (
    <div className="flex items-start gap-2 px-4 py-2.5 text-[11.5px] leading-snug" style={{ borderTop: "1px solid var(--hh-line, rgba(15,23,42,.10))", background: AMBER_SOFT, color: "#6B4A0E" }}>
      Typical for {kindLabel} — not from this unit&apos;s manual. Stays until you add or dismiss it; the manual replaces these with the exact schedule.
    </div>
  )
}

export const KIND_LABELS: Record<string, string> = {
  air_purifier: "air purifiers", range_hood: "range hoods", dishwasher: "dishwashers", refrigerator: "refrigerators",
  furnace: "furnaces", hvac: "heating and cooling", dryer: "dryers", washer: "washers", coffee_machine: "coffee machines",
  microwave: "microwaves", water_heater: "water heaters", ceiling_fan: "ceiling fans", food_recycler: "food recyclers",
  oven_range: "ranges", smoke_alarm: "alarms", home: "a home like yours",
}
