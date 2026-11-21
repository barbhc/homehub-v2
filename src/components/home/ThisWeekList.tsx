/**
 * Home · "This week" — the one list (design/home-focus.md; owner, 2026-09-08).
 *
 * The week's tasks, the first one open. Each row follows the task card
 * (owner-approved 2026-11-21, design/task-card.md): status line
 * ("Essential · Good to do now"), title, item. The open row adds item and
 * minutes, ONE supply line when the task needs something, and Mark done /
 * Snooze at one size; its arrow opens the task's page. No pills: only the
 * buttons look like buttons. Tapping any other row opens it and closes this one.
 *
 * Replaces HomeComposed (hero + stat band + faces + Coming-up drawer) and
 * ThisWeekSection: four views of the same ten tasks became one.
 */
import { useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { CalendarIcon, CheckIcon, ChevronDownIcon, ChevronRightIcon, ShieldIcon } from "lucide-react"
import type { DashboardTask, ExpiringWarrantyItem, MaintenanceTaskFull } from "@/lib/dashboard"
import { useTaskDetail } from "@/components/home/tasks/shared"
import { InlineError } from "@/components/layout/LoadStates"
import { TaskCardActions, TaskStatusLine, TaskSupplyLine } from "@/components/tasks/TaskCard"
import { itemMinutesLine, whenTone } from "@/lib/taskCard"
import { localToday } from "../../../shared/dates/calendar"
import { weekRows, nextUpRows, prepLine, prepPlace, timelyWarranty, fmtShortDate, comingUpLine, type ComingUp, type HomeWeekRow } from "@/lib/homeWeek"

const INK = "var(--hh-ink)", SUB = "var(--hh-sub)", FAINT = "var(--hh-faint)", TEAL = "var(--hh-teal)", CLAY = "var(--hh-clay)"
const LINE = "var(--hh-line)", SURFACE = "var(--hh-surface)"

export type ThisWeekVariant = "mobile" | "desktop"
const SCALE = {
  mobile: { rowPad: "px-3.5 py-3", title: "text-[0.875rem]", openTitle: "text-[1rem]", meta: "text-[0.75rem]", bodyPad: "pl-[46px] pr-3.5 pb-3.5", notePad: "pl-[46px] pr-3.5 pb-2.5" },
  desktop: { rowPad: "px-5 py-3.5", title: "text-[0.9375rem]", openTitle: "text-[1.0625rem]", meta: "text-[0.78125rem]", bodyPad: "pl-[58px] pr-5 pb-4", notePad: "pl-[58px] pr-5 pb-3" },
} as const

export function ThisWeekList({ homeId, tasks, upcoming, nextUp = null, comingUp = null, completingId, actionError = null, onComplete, onSnooze, variant = "mobile" }: {
  homeId: string | null
  /** Overdue + due-soon feed (lead first). */
  tasks: DashboardTask[]
  /** Forward schedule; the next 7 days join the list, the rest feed the quiet week. */
  upcoming: MaintenanceTaskFull[]
  nextUp?: { dueDate: string; windowStart: string } | null
  /** The next due month after this week (design/day-one-home.md). */
  comingUp?: ComingUp | null
  completingId: string | null
  /** A check-off or snooze the server refused. Said on the row it belongs to —
   *  the row stays, because the task is not done, and it says why. */
  actionError?: { id: string; message: string } | null
  onComplete: (instanceId: string) => void
  onSnooze: (instanceId: string) => void
  variant?: ThisWeekVariant
}) {
  const sc = SCALE[variant]
  const today = localToday()
  const rows = useMemo(() => weekRows(tasks, upcoming, today), [tasks, upcoming, today])
  const ahead = useMemo(() => (rows.length === 0 ? nextUpRows(upcoming, today) : []), [rows.length, upcoming, today])

  // The first task opens by default. `choice` is what the person did:
  // undefined = nothing yet (follow the first row), null = closed the open one,
  // an id = opened that row. Derived, so when the open task leaves (done,
  // snoozed) the new first takes its place without an effect.
  const [choice, setChoice] = useState<string | null | undefined>(undefined)
  const openId = choice === undefined ? (rows[0]?.id ?? null) : choice === null ? null : rows.some((r) => r.id === choice) ? choice : (rows[0]?.id ?? null)

  return (
    <section className="flex flex-col gap-2.5" data-testid="this-week">
      <div className="flex items-baseline justify-between pl-0.5">
        <span className="text-xs font-bold uppercase tracking-[0.6px]" style={{ color: SUB }}>This week</span>
        {rows.length > 0 && (
          <span className={`${sc.meta} font-medium`} style={{ color: SUB }}>{rows.length} {rows.length === 1 ? "task" : "tasks"}</span>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border shadow-[0_1px_2px_rgba(15,23,42,0.04)]" style={{ background: SURFACE, borderColor: LINE }}>
        {rows.length === 0 ? (
          <QuietWeek nextUp={nextUp} ahead={ahead} sc={sc} />
        ) : (
          rows.map((r, i) => (
            <WeekRow
              key={r.id}
              row={r}
              homeId={homeId}
              first={i === 0}
              open={openId === r.id}
              onToggle={() => setChoice(openId === r.id ? null : r.id)}
              completing={completingId === r.id}
              error={actionError?.id === r.id ? actionError.message : null}
              onComplete={() => onComplete(r.id)}
              onSnooze={() => onSnooze(r.id)}
              sc={sc}
            />
          ))
        )}
        {/* py-[13px], not py-2.5: the card clips (overflow-hidden), so the
            footer itself has to be tall enough to hold All tasks' 44pt tap. */}
        <div className="flex items-center justify-end px-3.5 py-[13px]" style={{ borderTop: `1px solid ${LINE}`, background: "color-mix(in srgb, var(--hh-surface2) 60%, var(--hh-surface))" }}>
          <Link to="/maintenance" className={`hit-44 inline-flex items-center gap-0.5 ${sc.meta} font-bold`} style={{ color: TEAL }}>
            All tasks <ChevronRightIcon className="size-3" aria-hidden />
          </Link>
        </div>
      </div>
      {/* One line, not a list: what is next after this week, so Home looks
          ahead. The quiet week says it already, so not twice. */}
      {rows.length > 0 && comingUp && <ComingUpLine comingUp={comingUp} today={today} sc={sc} />}
    </section>
  )
}

function ComingUpLine({ comingUp, today, sc }: { comingUp: ComingUp; today: string; sc: (typeof SCALE)[ThisWeekVariant] }) {
  const { lead, rest } = comingUpLine(comingUp, today)
  return (
    <p className={`mt-1.5 flex items-start gap-2.5 px-1 ${sc.meta === "text-[0.75rem]" ? "text-[0.875rem]" : "text-[0.9375rem]"} leading-snug`} style={{ color: SUB }} data-testid="coming-up">
      <CalendarIcon className="mt-0.5 size-4 shrink-0" style={{ color: TEAL }} aria-hidden />
      <span><span className="font-semibold" style={{ color: INK }}>{lead}</span> {rest}</span>
    </p>
  )
}

function WeekRow({ row, homeId, first, open, onToggle, completing, error, onComplete, onSnooze, sc }: {
  row: HomeWeekRow
  homeId: string | null
  first: boolean
  open: boolean
  onToggle: () => void
  completing: boolean
  error: string | null
  onComplete: () => void
  onSnooze: () => void
  sc: (typeof SCALE)[ThisWeekVariant]
}) {
  const when = row.safetyNote ?? row.duePhrase
  const tone = whenTone(when, { trulyOverdue: row.trulyOverdue, safetyNote: row.safetyNote })
  return (
    <div
      data-testid="week-row"
      data-open={open ? "true" : "false"}
      style={{ borderTop: first ? "none" : `1px solid ${LINE}` }}
    >
      <div className={`flex items-start gap-2.5 ${sc.rowPad}`}>
        <button
          type="button"
          onClick={onComplete}
          disabled={completing}
          aria-label={`Mark ${row.title} done`}
          className="hit-44 -m-1.5 mt-1 flex shrink-0 p-1.5 disabled:opacity-60"
        >
          <span className="flex size-6 items-center justify-center rounded-full border-2" style={{ borderColor: TEAL, background: SURFACE }}>
            <CheckIcon className="size-3 opacity-0" strokeWidth={3} />
          </span>
        </button>
        {/* The task card's order (src/components/tasks/TaskCard.tsx): status
            line, title, then the item. Tapping the text opens or closes the row. */}
        <button type="button" onClick={onToggle} aria-expanded={open} className="hit-44 min-w-0 flex-1 text-left">
          <TaskStatusLine tier={row.tier} when={when} tone={tone} />
          <span className={`mt-0.5 block ${open ? "" : "truncate larger-text:whitespace-normal"} text-[1.0625rem] leading-[1.375rem] font-semibold tracking-[-0.2px]`} style={{ color: INK }} data-testid="week-row-title">{row.title}</span>
          {!open && <span className={`mt-0.5 block truncate larger-text:whitespace-normal ${sc.meta}`} style={{ color: SUB }}>{row.itemName ?? "Whole home"}</span>}
        </button>
        {/* Closed: a caret that opens it. Open: the arrow goes to the task's page
            (owner, 2026-11-21: the arrow, not a "See details" link). */}
        {open ? (
          <Link to={`/tasks/${row.id}`} aria-label={`Open ${row.title}`} className="hit-44 mt-1.5 flex size-[22px] shrink-0 items-center justify-center" style={{ color: FAINT }}>
            <ChevronRightIcon className="size-5" />
          </Link>
        ) : (
          <button type="button" onClick={onToggle} aria-label={`Open ${row.title} here`} className="hit-44 mt-1.5 flex size-[22px] shrink-0 items-center justify-center" style={{ color: FAINT }}>
            <ChevronDownIcon className="size-5" />
          </button>
        )}
      </div>
      {error && <InlineError className={sc.notePad}>{error}</InlineError>}
      {open && (
        <OpenBody key={row.id} row={row} homeId={homeId} completing={completing} onComplete={onComplete} onSnooze={onSnooze} sc={sc} />
      )}
    </div>
  )
}

/** The open row: the task card's lower half. Details load on open; a failure says so in place. */
function OpenBody({ row, homeId, completing, onComplete, onSnooze, sc }: {
  row: HomeWeekRow
  homeId: string | null
  completing: boolean
  onComplete: () => void
  onSnooze: () => void
  sc: (typeof SCALE)[ThisWeekVariant]
}) {
  const [attempt, setAttempt] = useState(0)
  const { detail, loading, error } = useTaskDetail(homeId, row.id, true, attempt)
  const prep = prepLine(detail)
  const place = prepPlace(detail)
  const meta = itemMinutesLine(row.itemName ?? "Whole home", detail?.estimatedMinutes)
  return (
    <div className={`flex flex-col gap-3 ${sc.bodyPad}`} data-testid="week-row-body">
      {meta && <p className="-mt-1 text-[0.9375rem] leading-5" style={{ color: SUB }}>{meta}</p>}
      {loading && !detail && <span className={sc.meta} style={{ color: FAINT }}>Loading…</span>}
      {error && (
        <div role="alert" className={`flex items-center gap-2 ${sc.meta}`} style={{ color: CLAY }}>
          <span>Couldn&apos;t load the details: {error}</span>
          <button type="button" onClick={() => setAttempt((n) => n + 1)} className="hit-44 font-bold underline underline-offset-2">Try again</button>
        </div>
      )}
      {prep && <TaskSupplyLine text={prep} place={place} />}
      {/* Held to a readable width: on desktop two buttons across the page read as a banner. */}
      <TaskCardActions onDone={onComplete} onSnooze={onSnooze} completing={completing} className="max-w-[440px]" />
    </div>
  )
}

/** Nothing in the window: one sentence, the next few ahead, and stop. */
function QuietWeek({ nextUp, ahead, sc }: { nextUp: { dueDate: string; windowStart: string } | null; ahead: HomeWeekRow[]; sc: (typeof SCALE)[ThisWeekVariant] }) {
  const until = ahead[0]?.dueDate ?? nextUp?.dueDate ?? null
  return (
    <div data-testid="quiet-week">
      <div className={`flex items-center gap-3 ${sc.rowPad}`}>
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full border-[2.5px]" style={{ borderColor: TEAL, color: TEAL, background: SURFACE }}>
          <CheckIcon className="size-5" strokeWidth={3} />
        </span>
        <span className="min-w-0">
          <span className="block text-[1.0625rem] font-extrabold leading-tight tracking-[-0.02em]" style={{ color: INK }}>
            {until ? `All quiet until ${fmtShortDate(until)}` : "All quiet"}
          </span>
          <span className={`mt-0.5 block ${sc.meta}`} style={{ color: SUB }}>
            {ahead[0] ? `Nothing is late. Next up: ${ahead[0].title.toLowerCase()}.` : until ? "Nothing is late." : "Nothing is late, and nothing is scheduled yet."}
          </span>
        </span>
      </div>
      {ahead.length > 0 && (
        <>
          <div className="px-3.5 pb-1 pt-2 text-[0.6875rem] font-bold uppercase tracking-[0.6px]" style={{ color: SUB, borderTop: `1px solid ${LINE}` }}>Next up</div>
          {ahead.map((r) => (
            <Link key={r.id} to={`/tasks/${r.id}`} className={`flex items-center gap-2.5 ${sc.rowPad}`} data-testid="next-up-row">
              <span className="min-w-0 flex-1">
                <span className={`block truncate ${sc.title} font-semibold`} style={{ color: INK }}>{r.title}</span>
                <span className={`block truncate ${sc.meta}`} style={{ color: SUB }}>{r.itemName ?? "Home"}{r.duePhrase ? ` · ${r.duePhrase}` : ""}</span>
              </span>
              <ChevronRightIcon className="size-4 shrink-0" style={{ color: FAINT }} aria-hidden />
            </Link>
          ))}
        </>
      )}
    </div>
  )
}

/** The one line under the list: a warranty ending inside 60 days. Otherwise nothing. */
export function TimelyWarrantyLine({ warranties }: { warranties: ExpiringWarrantyItem[] }) {
  const w = timelyWarranty(warranties)
  if (!w) return null
  return (
    <Link
      to="/warranties"
      className="flex items-center gap-2.5 rounded-2xl border px-3.5 py-2.5 text-[0.8125rem]"
      style={{ background: SURFACE, borderColor: LINE, color: SUB }}
      data-testid="timely-warranty"
    >
      <ShieldIcon className="size-4 shrink-0" style={{ color: TEAL }} aria-hidden />
      <span className="min-w-0 flex-1 truncate" style={{ color: INK }}>{w.display_name} warranty ends {fmtShortDate(w.warranty_expiry_date)}</span>
      <span className="shrink-0 font-bold" style={{ color: TEAL }}>Details</span>
    </Link>
  )
}
