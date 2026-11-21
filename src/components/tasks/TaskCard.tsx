/**
 * The task card's parts (owner-approved 2026-11-21; design/task-card.md).
 *
 * One order everywhere a task is shown: status line, title, item and minutes,
 * the supply when there is one, then Mark done and Snooze. A part with nothing
 * in it is left out; there is never a placeholder.
 *
 * Apple HIG: "buttons offered as a set share one size" and "use style, not
 * size, to distinguish the preferred choice" — so the two actions are the
 * same width and height, Mark done filled, Snooze outlined. Every control is at
 * least 44 pt; the actions sit 12 pt below the text (HIG: about 12 pt around
 * controls with a border) so a tap meant for one doesn't land on the other.
 */
import { CheckIcon, MapPinIcon, PackageIcon, PhoneIcon } from "lucide-react"
import type { Tier } from "@/lib/redesign/tokens"
import { isProLine, tierWord, type WhenTone } from "@/lib/taskCard"
import { cn } from "@/lib/utils"

const INK = "var(--hh-ink)", SUB = "var(--hh-sub)", CLAY = "var(--hh-clay)"

/** "Essential · Good to do now" — Footnote (13/18) semibold. The tier is a word, not only a colour. */
export function TaskStatusLine({ tier, when, tone = "plain", className }: {
  tier: Tier
  when?: string | null
  tone?: WhenTone
  className?: string
}) {
  const t = tierWord(tier)
  return (
    <span className={cn("block text-[0.8125rem] leading-[1.125rem] font-semibold", className)} style={{ color: SUB }} data-testid="task-status">
      <span style={{ color: t.color }}>{t.label}</span>
      {when && (
        <>
          {" · "}
          <span style={tone === "date" ? { color: INK } : tone === "attention" ? { color: CLAY } : undefined} data-tone={tone}>{when}</span>
        </>
      )}
    </span>
  )
}

/** What to have before starting, or who to book (Subhead 15/20, on a quiet fill). */
export function TaskSupplyLine({ text, place }: { text: string; place?: string | null }) {
  const pro = isProLine(text)
  return (
    <div className="flex items-start gap-2.5 rounded-[10px] px-3 py-2.5 text-[0.9375rem] leading-5" style={{ background: "var(--hh-surface2)", color: INK }} data-testid="prep-line">
      <span className="mt-px shrink-0" style={{ color: SUB }} aria-hidden>
        {pro ? <PhoneIcon className="size-[18px]" /> : <PackageIcon className="size-[18px]" />}
      </span>
      <span className="flex min-w-0 flex-col items-start gap-1.5">
        <span>{text}</span>
        {place && (
          <span data-testid="prep-place" className="inline-flex max-w-full items-center gap-1 text-[0.8125rem] font-semibold" style={{ color: "var(--hh-teal-deep)" }}>
            <MapPinIcon className="size-3.5 shrink-0" aria-hidden />
            <span className="sr-only">Kept in </span>
            <span className="truncate">{place}</span>
          </span>
        )}
      </span>
    </div>
  )
}

/** Mark done and Snooze: one size, two styles. They stack under Larger Text. */
export function TaskCardActions({ onDone, onSnooze, completing = false, className }: {
  onDone: () => void
  onSnooze: () => void
  completing?: boolean
  className?: string
}) {
  return (
    <div className={cn("flex gap-3 larger-text:flex-col", className)} data-testid="task-actions">
      <button
        type="button"
        onClick={onDone}
        disabled={completing}
        className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl px-3.5 text-base font-semibold disabled:opacity-60"
        style={{ background: "var(--hh-teal-fill)", color: "var(--hh-on-fill)" }}
      >
        <CheckIcon className="size-[18px]" strokeWidth={2.4} aria-hidden /> Mark done
      </button>
      <button
        type="button"
        onClick={onSnooze}
        className="flex min-h-11 flex-1 items-center justify-center rounded-xl border px-3.5 text-base font-semibold"
        style={{ borderColor: "var(--hh-line2)", background: "var(--hh-surface)", color: INK }}
      >
        Snooze
      </button>
    </div>
  )
}
