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

const INK = "var(--hh-ink)"
const SUB = "var(--hh-sub)"
const FAINT = "var(--hh-faint)"
const TEAL = "var(--hh-teal)"
const CLAY = "var(--hh-clay)"
const AMBER = "var(--hh-gold)"
const AMBER_SOFT = "var(--hh-gold-soft)"
const SLATE = "var(--hh-slate)"
const SLATE_SOFT = "var(--hh-slate-soft)"

export type SuggestedRowProps = {
  suggestion: Suggestion
  /** Where the row lives — the row prefixes the item on the Tasks page. */
  itemName?: string | null
  onAdd: () => Promise<{ error: { message: string } | null }>
  onDismiss: () => Promise<{ error: { message: string } | null }>
  last?: boolean
  /**
   * "band" (the default, and what every existing caller gets): the Suggested
   * band's row, with the pill, the how and the why. "card": the item page's
   * no-manual card (before-friends mock 2) — a bordered row of title, cadence
   * and minutes, an outlined Add and a text Don't Add, inside a card whose one
   * filled button is Add the Manual.
   */
  variant?: "band" | "card"
}

export function SuggestedRow({ variant = "band", ...props }: SuggestedRowProps) {
  // A backstop needs an existing task to back up, and the no-manual card only
  // renders for an item with no tasks, so one cannot reach the card. If one
  // ever does, it gets the band's row, which knows how to say what it is.
  if (variant === "card" && !props.suggestion.backstopFor) return <CardRow {...props} />
  return <BandRow {...props} />
}

type RowProps = Omit<SuggestedRowProps, "variant">

/** One write at a time per row; a failed write keeps the row with its reason. */
function useRowAction(onAdd: RowProps["onAdd"], onDismiss: RowProps["onDismiss"]) {
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
  return { busy, error, run }
}

function CardRow({ suggestion, onAdd, onDismiss }: RowProps) {
  const { entry } = suggestion
  const { busy, error, run } = useRowAction(onAdd, onDismiss)
  const meta = [entry.cadenceLabel, entry.pro ? "Call a pro" : `${entry.minutes} min`].join(" · ")
  return (
    <div
      data-testid="suggested-card-row"
      className="flex flex-col gap-1 rounded-[14px] border px-4 pb-3 pt-3.5 text-left"
      style={{ borderColor: "var(--hh-line)", background: "var(--hh-surface)" }}
    >
      <span className="text-[0.875rem] font-semibold tracking-[-0.2px]" style={{ color: INK }}>{entry.title}</span>
      <span className="text-[0.75rem] leading-snug" style={{ color: SUB }}>{meta}</span>
      {error && (
        <span role="alert" className="text-[0.75rem] font-medium" style={{ color: CLAY }}>{error}</span>
      )}
      <div className="mt-1.5 flex items-center gap-4">
        <button
          type="button"
          onClick={() => void run("add")}
          disabled={busy !== null}
          aria-label={`Add ${entry.title}`}
          className="inline-flex min-h-11 min-w-16 items-center justify-center rounded-full border px-4 text-[0.8125rem] font-bold disabled:opacity-50"
          style={{ borderColor: TEAL, color: TEAL, background: "var(--hh-surface)" }}
        >
          {busy === "add" ? "Adding…" : "Add"}
        </button>
        <button
          type="button"
          onClick={() => void run("dismiss")}
          disabled={busy !== null}
          aria-label={`Don't add ${entry.title}`}
          className="inline-flex min-h-11 items-center text-[0.8125rem] font-semibold disabled:opacity-50"
          style={{ color: SUB }}
        >
          {busy === "dismiss" ? "Removing…" : "Don't Add"}
        </button>
      </div>
    </div>
  )
}

function BandRow({ suggestion, itemName, onAdd, onDismiss, last }: RowProps) {
  const { entry, backstopFor } = suggestion
  const { busy, error, run } = useRowAction(onAdd, onDismiss)
  const meta = [itemName, entry.cadenceLabel, `${entry.minutes} min`, entry.how].filter(Boolean).join(" · ")
  return (
    <div
      data-testid="suggested-row"
      className="flex flex-col gap-1.5 px-4 pb-2.5 pt-3.5"
      style={{ borderTop: last ? "none" : "1px solid var(--hh-line)", background: "var(--hh-surface2)" }}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[0.875rem] font-semibold tracking-[-0.2px]" style={{ color: INK }}>
          {backstopFor ? `Backstop for “${backstopFor.title}”` : entry.title}
        </span>
        <span className="rounded-full px-1.5 py-0.5 text-[0.6875rem] font-bold uppercase tracking-[0.3px]" style={{ background: AMBER_SOFT, color: AMBER }}>Suggested</span>
        {entry.pro && <span className="rounded-full px-1.5 py-0.5 text-[0.6875rem] font-bold uppercase tracking-[0.3px]" style={{ background: SLATE_SOFT, color: SLATE }}>A pro</span>}
      </div>
      <span className="text-[0.75rem] leading-snug" style={{ color: SUB }}>
        {backstopFor ? `The machine tells you when. Add a reminder ${entry.cadenceLabel.toLowerCase()} as a backstop?` : meta}
      </span>
      <span className="text-[0.75rem] leading-snug" style={{ color: FAINT }}>
        {backstopFor ? `${entry.source}.` : `Why: ${entry.why}`}
      </span>
      {error && (
        <span role="alert" className="text-[0.75rem] font-medium" style={{ color: CLAY }}>{error}</span>
      )}
      <div className="mt-0.5 flex items-center gap-[18px]">
        <button
          type="button"
          onClick={() => void run("add")}
          disabled={busy !== null}
          aria-label={`${backstopFor ? "Add backstop" : "Add"} ${entry.title}`}
          className="inline-flex min-h-11 items-center gap-1 text-[0.8125rem] font-bold disabled:opacity-50"
          style={{ color: TEAL }}
        >
          <CheckIcon className="size-[13px]" strokeWidth={3} />
          {busy === "add" ? "Adding…" : backstopFor ? "Add backstop" : "Add"}
        </button>
        <button
          type="button"
          onClick={() => void run("dismiss")}
          disabled={busy !== null}
          aria-label={`Don't add ${entry.title}`}
          className="inline-flex min-h-11 items-center text-[0.8125rem] font-semibold disabled:opacity-50"
          style={{ color: FAINT }}
        >
          {busy === "dismiss" ? "Removing…" : "Don't Add"}
        </button>
      </div>
    </div>
  )
}

/** The band's footnote — the same sentence on every surface, so provenance never varies. */
export function SuggestedSource({ kindLabel }: { kindLabel: string }) {
  return (
    <div className="flex items-start gap-2 px-4 py-2.5 text-[0.75rem] leading-snug" style={{ borderTop: "1px solid var(--hh-line, rgba(15,23,42,.10))", background: AMBER_SOFT, color: "var(--hh-gold-ink)" }}>
      Typical for {kindLabel}, not from this one&apos;s manual. Add the manual for its exact schedule.
    </div>
  )
}
