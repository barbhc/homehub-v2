/**
 * Grouped rows: a small caps label over one card of rows. Home's sections,
 * Settings and "Your home" all read as the same list (design/settings-your-home.md).
 *
 * Sizes are Apple's text styles: label Caption 1 (12), title Headline (17),
 * sub Footnote (13), value Subhead (15). Every row is at least 60pt tall and
 * leadings are unitless so Larger Text grows the row instead of clipping it.
 */
import type { ReactNode } from "react"
import { Link } from "react-router-dom"
import { ChevronRightIcon, type LucideIcon } from "lucide-react"

const INK = "var(--hh-ink)", SUB = "var(--hh-sub)", FAINT = "var(--hh-faint)", TEAL = "var(--hh-teal)", CLAY = "var(--hh-clay)"
const SURFACE = "var(--hh-surface)", LINE = "var(--hh-line)"

export type RowTone = "teal" | "clay" | "gold" | "grey"

/** Section label with an optional link on the right, then its content. */
export function ListSection({ label, right, children, testId, note }: {
  label: string
  right?: ReactNode
  children: ReactNode
  testId?: string
  /** One plain line under the card (Footnote). */
  note?: ReactNode
}) {
  return (
    <section className="flex flex-col gap-2" data-testid={testId} aria-label={label}>
      <div className="flex items-baseline justify-between pl-0.5">
        <span className="text-xs font-bold uppercase leading-[1.33] tracking-[0.6px]" style={{ color: SUB }}>{label}</span>
        {right}
      </div>
      {children}
      {note && <p className="pl-0.5 text-[0.8125rem] leading-[1.38]" style={{ color: SUB }}>{note}</p>}
    </section>
  )
}

/** The white card a section's rows sit in. */
export function ListCard({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <div
      data-testid={testId}
      className="overflow-hidden rounded-2xl border shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
      style={{ background: SURFACE, borderColor: LINE }}
    >
      {children}
    </div>
  )
}

export function IconTile({ icon: Icon, tone = "teal" }: { icon: LucideIcon; tone?: RowTone }) {
  const style = tone === "clay"
    ? { background: "var(--hh-clay-soft)", color: CLAY }
    : tone === "gold"
      ? { background: "var(--hh-gold-soft)", color: "var(--hh-gold-ink)" }
      : tone === "grey"
        ? { background: "var(--hh-surface2)", color: SUB }
        : { background: "var(--hh-teal-wash)", color: TEAL }
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px]" style={style} aria-hidden>
      <Icon className="size-[18px]" />
    </span>
  )
}

/**
 * One row: optional icon, title, optional sub line, then a value, a teal
 * action word ("Add") or an arrow. A link when `to` is given, else a button.
 */
export function ListRow({ icon, tone, title, sub, value, action, first, to, onClick, testId }: {
  icon?: LucideIcon
  tone?: RowTone
  title: string
  sub?: string | null
  /** The current setting, in grey before the arrow ("On", "House"). */
  value?: string | null
  /** A word in teal ("Add", "Review"); replaces the arrow. */
  action?: string
  first: boolean
  to?: string
  onClick?: () => void
  testId?: string
}) {
  const className = "flex min-h-[60px] w-full items-center gap-3 px-3.5 py-3 text-left"
  const style = { borderTop: first ? "none" : `1px solid ${LINE}` }
  const body = (
    <>
      {icon && <IconTile icon={icon} tone={tone} />}
      <span className="min-w-0 flex-1">
        <span className="block text-[1.0625rem] font-semibold leading-[1.3] [overflow-wrap:anywhere]" style={{ color: INK }}>{title}</span>
        {sub && <span className="mt-0.5 block text-[0.8125rem] leading-[1.38] [overflow-wrap:anywhere]" style={{ color: SUB }}>{sub}</span>}
      </span>
      {value && <span className="max-w-[45%] shrink-0 text-right text-[0.9375rem] leading-[1.33] [overflow-wrap:anywhere]" style={{ color: SUB }}>{value}</span>}
      {action
        ? <span className="shrink-0 text-[0.9375rem] font-semibold" style={{ color: TEAL }}>{action}</span>
        : <ChevronRightIcon className="size-[18px] shrink-0" style={{ color: FAINT }} aria-hidden />}
    </>
  )
  if (to) {
    return <Link to={to} onClick={onClick} data-testid={testId} className={className} style={style}>{body}</Link>
  }
  return <button type="button" onClick={onClick} data-testid={testId} className={className} style={style}>{body}</button>
}
