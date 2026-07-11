import { useState } from "react"
import { ArrowUpRightIcon, BookOpenIcon, CheckIcon, InfoIcon, SearchIcon, BadgeAlertIcon, UserRoundCheckIcon } from "lucide-react"

/**
 * Shared task how-to atoms — the version-C "reference split" treatment from the
 * Items redesign (item-task-instructions-fix.md). Used by BOTH the item page
 * (DesktopItemDetail) and the Tasks-page redesign so a task's how-to looks the
 * same everywhere: numbered checkable steps, a slate "why" notice, and a teal
 * manual blurb. Calm tier palette; the slate info tone is intentionally
 * distinct from the teal manual tone.
 */

const TEAL = "var(--hh-teal)", TEALD = "var(--hh-teal-deep)", SUB = "var(--hh-sub)", FAINT = "var(--hh-faint)", INK = "var(--hh-ink)"

/**
 * Numbered, tick-as-you-go steps. Teal circle badges; tapping a step checks it
 * off (tick + strike-through). The single step component shared with the item
 * page so the two surfaces match.
 */
export function StepList({ steps, label = "Steps" }: { steps: string[]; label?: string }) {
  const [done, setDone] = useState<number[]>([])
  if (steps.length === 0) return null
  const flip = (i: number) => setDone((x) => (x.includes(i) ? x.filter((n) => n !== i) : [...x, i]))
  return (
    <div>
      {label && <div className="mb-2.5 text-[10.5px] font-bold uppercase tracking-[0.5px]" style={{ color: SUB }}>{label}</div>}
      <ol className="flex flex-col gap-2.5">
        {steps.map((s, i) => {
          const on = done.includes(i)
          return (
            <li key={i}>
              <button type="button" onClick={() => flip(i)} className="flex w-full items-start gap-3 text-left">
                <span
                  className="mt-px flex size-6 shrink-0 items-center justify-center rounded-full text-[12px] font-bold"
                  style={{
                    border: `2px solid ${on ? TEAL : "var(--hh-line2)"}`,
                    background: on ? TEAL : "var(--hh-teal-wash)",
                    color: on ? "#fff" : TEAL,
                  }}
                >
                  {on ? <CheckIcon className="size-[13px]" strokeWidth={3} /> : i + 1}
                </span>
                <span
                  className="flex-1 pt-0.5 text-[14px] leading-relaxed text-pretty"
                  style={{ color: on ? FAINT : INK, textDecoration: on ? "line-through" : "none" }}
                >
                  {s}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

/**
 * Slate "notice" tone block — deliberately a different color from the teal
 * manual blurb so the two never read as the same thing. Used for "why it
 * matters" (no label) and Fix-it's "Likely cause" (labelled, search icon).
 */
export function InfoBlurb({ text, label, icon = "info" }: { text: string; label?: string; icon?: "info" | "search" }) {
  const Glyph = icon === "search" ? SearchIcon : InfoIcon
  return (
    <div className="flex items-start gap-2.5 rounded-xl px-3.5 py-3" style={{ background: "var(--hh-slate-soft)" }}>
      <Glyph className="mt-px size-[15px] shrink-0" style={{ color: "var(--hh-slate)" }} />
      <div className="min-w-0">
        {label && <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.5px]" style={{ color: "var(--hh-slate)" }}>{label}</div>}
        <span className="text-[13.5px] leading-relaxed text-pretty" style={{ color: INK }}>{text}</span>
      </div>
    </div>
  )
}

/**
 * "Needs a pro?" escalation card → routes to the service-provider handoff.
 * Shown when a fix needs a qualified professional.
 */
export function ProEscalate({ text, cta, onFindPro }: { text: string; cta: string; onFindPro: () => void }) {
  return (
    <div className="rounded-xl p-3.5" style={{ background: "var(--hh-teal-deep)" }}>
      <div className="mb-1 flex items-center gap-2">
        <BadgeAlertIcon className="size-4" style={{ color: "#9FE7D2" }} />
        <span className="text-[13.5px] font-extrabold text-white">Needs a pro?</span>
      </div>
      <div className="mb-2.5 text-[12.5px] leading-snug" style={{ color: "rgba(255,255,255,0.72)" }}>{text}</div>
      <button
        type="button"
        onClick={onFindPro}
        className="inline-flex items-center gap-1.5 rounded-[9px] bg-white px-3 py-2 text-[12.5px] font-bold"
        style={{ color: "var(--hh-teal-deep)" }}
      >
        <UserRoundCheckIcon className="size-[14px]" /> {cta}
      </button>
    </div>
  )
}

/**
 * Teal manual blurb: an optional italic excerpt + an explicit
 * "Open manual · p.X ↗" link that opens the manual viewer at that page.
 */
export function ManualBlurb({ page, quote, onOpen }: { page: number; quote?: string | null; onOpen: () => void }) {
  return (
    <div className="px-3.5 py-3" style={{ borderLeft: `3px solid ${TEAL}`, background: "var(--hh-teal-wash)", borderRadius: "0 12px 12px 0" }}>
      <div className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.5px]" style={{ color: TEAL }}>From your manual</div>
      {quote && <div className="text-[13px] italic leading-relaxed" style={{ color: INK }}>“{quote}”</div>}
      <button
        type="button"
        onClick={onOpen}
        className="mt-2.5 inline-flex items-center gap-1.5 rounded-[9px] px-3 py-2 text-[12.5px] font-bold"
        style={{ background: "var(--hh-surface)", color: TEALD }}
      >
        <BookOpenIcon className="size-[14px]" /> Open manual · p.{page} <ArrowUpRightIcon className="size-[13px]" />
      </button>
    </div>
  )
}
