/**
 * Home · "This week" — the one list (design/home-focus.md; owner, 2026-09-08).
 *
 * The week's tasks, the first one open. The open row is the row itself,
 * grown edge to edge (wash fill, teal edges left and right, caret flipped):
 * when · cadence · minutes as pills, ONE prep line when the task needs
 * something, then Mark done / Snooze / See details. No kicker, no how line —
 * the steps live behind See details. Tapping any other row opens it and
 * closes this one.
 *
 * Replaces HomeComposed (hero + stat band + faces + Coming-up drawer) and
 * ThisWeekSection: four views of the same ten tasks became one.
 */
import { useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { BellOffIcon, CheckIcon, ChevronDownIcon, ChevronRightIcon, ChevronUpIcon, PhoneIcon, PackageIcon, ShieldIcon } from "lucide-react"
import type { DashboardTask, ExpiringWarrantyItem, MaintenanceTaskFull } from "@/lib/dashboard"
import { useTaskDetail, todayStr } from "@/components/home/tasks/shared"
import { cadenceLabel } from "../../../shared/tasks/cadenceLabel"
import { weekRows, nextUpRows, prepLine, timelyWarranty, fmtShortDate, type HomeWeekRow } from "@/lib/homeWeek"

const INK = "var(--hh-ink)", SUB = "var(--hh-sub)", FAINT = "var(--hh-faint)", TEAL = "var(--hh-teal)", CLAY = "var(--hh-clay)"
const LINE = "var(--hh-line)", SURFACE = "var(--hh-surface)"
/** The open row's fill and its two edges — mixed from the tokens so both themes hold. */
const WASH = "color-mix(in srgb, var(--hh-teal) 12%, var(--hh-surface))"
const EDGE = "color-mix(in srgb, var(--hh-teal) 45%, transparent)"

export type ThisWeekVariant = "mobile" | "desktop"
const SCALE = {
  mobile: { rowPad: "px-3.5 py-3", title: "text-[14px]", openTitle: "text-[16px]", meta: "text-[11.5px]", bodyPad: "pl-[46px] pr-3.5 pb-3.5" },
  desktop: { rowPad: "px-5 py-3.5", title: "text-[15px]", openTitle: "text-[17px]", meta: "text-[12.5px]", bodyPad: "pl-[58px] pr-5 pb-4" },
} as const

export function ThisWeekList({ homeId, tasks, upcoming, nextUp = null, completingId, onComplete, onSnooze, variant = "mobile" }: {
  homeId: string | null
  /** Overdue + due-soon feed (lead first). */
  tasks: DashboardTask[]
  /** Forward schedule; the next 7 days join the list, the rest feed the quiet week. */
  upcoming: MaintenanceTaskFull[]
  nextUp?: { dueDate: string; windowStart: string } | null
  completingId: string | null
  onComplete: (instanceId: string) => void
  onSnooze: (instanceId: string) => void
  variant?: ThisWeekVariant
}) {
  const sc = SCALE[variant]
  const today = todayStr()
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
              onComplete={() => onComplete(r.id)}
              onSnooze={() => onSnooze(r.id)}
              sc={sc}
            />
          ))
        )}
        <div className="flex items-center justify-end px-3.5 py-2.5" style={{ borderTop: `1px solid ${LINE}`, background: "color-mix(in srgb, var(--hh-surface2) 60%, var(--hh-surface))" }}>
          <Link to="/maintenance" className={`inline-flex items-center gap-0.5 ${sc.meta} font-bold`} style={{ color: TEAL }}>
            All tasks <ChevronRightIcon className="size-3" aria-hidden />
          </Link>
        </div>
      </div>
    </section>
  )
}

function WeekRow({ row, homeId, first, open, onToggle, completing, onComplete, onSnooze, sc }: {
  row: HomeWeekRow
  homeId: string | null
  first: boolean
  open: boolean
  onToggle: () => void
  completing: boolean
  onComplete: () => void
  onSnooze: () => void
  sc: (typeof SCALE)[ThisWeekVariant]
}) {
  const when = row.safetyNote ?? row.duePhrase
  const clay = row.trulyOverdue || !!row.safetyNote
  return (
    <div
      data-testid="week-row"
      data-open={open ? "true" : "false"}
      style={{
        borderTop: first ? "none" : `1px solid ${LINE}`,
        background: open ? WASH : "transparent",
        boxShadow: open ? `inset 2px 0 0 ${EDGE}, inset -2px 0 0 ${EDGE}` : "none",
      }}
    >
      <div className={`flex items-center gap-2.5 ${sc.rowPad}`}>
        <button
          type="button"
          onClick={onComplete}
          disabled={completing}
          aria-label={`Mark ${row.title} done`}
          className="-m-1.5 flex shrink-0 p-1.5 disabled:opacity-60"
        >
          <span className="flex size-6 items-center justify-center rounded-full border-2" style={{ borderColor: TEAL, background: SURFACE }}>
            <CheckIcon className="size-3 opacity-0" strokeWidth={3} />
          </span>
        </button>
        <button type="button" onClick={onToggle} aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
          <span className="min-w-0 flex-1">
            <span className={`block truncate ${open ? sc.openTitle : sc.title} font-semibold leading-snug tracking-[-0.2px]`} style={{ color: INK }}>{row.title}</span>
            <span className={`mt-0.5 flex items-center gap-1.5 ${sc.meta}`} style={{ color: SUB }}>
              {row.essential && (
                <span className="rounded-full px-2 py-px text-[10.5px] font-bold" style={{ background: "var(--hh-clay-soft)", color: CLAY }}>Essential</span>
              )}
              <span className="truncate">
                {row.itemName ?? "Home"}
                {!open && when && <> · <span style={clay ? { color: CLAY, fontWeight: 700 } : undefined}>{when}</span></>}
              </span>
            </span>
          </span>
          <span
            className="flex size-[22px] shrink-0 items-center justify-center rounded-full"
            style={open ? { background: TEAL, color: "#fff" } : { background: "var(--hh-surface2)", color: SUB }}
            aria-hidden
          >
            {open ? <ChevronUpIcon className="size-3.5" /> : <ChevronDownIcon className="size-3.5" />}
          </span>
        </button>
      </div>
      {open && (
        <OpenBody key={row.id} row={row} homeId={homeId} when={when} clay={clay} completing={completing} onComplete={onComplete} onSnooze={onSnooze} sc={sc} />
      )}
    </div>
  )
}

/** The grown row's inside. Details load on open; a failure says so in place. */
function OpenBody({ row, homeId, when, clay, completing, onComplete, onSnooze, sc }: {
  row: HomeWeekRow
  homeId: string | null
  when: string
  clay: boolean
  completing: boolean
  onComplete: () => void
  onSnooze: () => void
  sc: (typeof SCALE)[ThisWeekVariant]
}) {
  const [attempt, setAttempt] = useState(0)
  const { detail, loading, error } = useTaskDetail(homeId, row.id, true, attempt)
  const cadence = detail ? cadenceLabel(detail.scheduleType, detail.intervalDays) : null
  const prep = prepLine(detail)
  return (
    <div className={`flex flex-col gap-2.5 ${sc.bodyPad}`} data-testid="week-row-body">
      <div className="flex flex-wrap items-center gap-1.5">
        {when && <Pill text={when} tone={clay ? "clay" : "when"} />}
        {cadence && cadence !== "When needed" && <Pill text={cadence} />}
        {detail?.estimatedMinutes != null && <Pill text={`${detail.estimatedMinutes} min`} />}
        {loading && !detail && <span className={sc.meta} style={{ color: FAINT }}>Loading…</span>}
      </div>
      {error && (
        <div role="alert" className={`flex items-center gap-2 ${sc.meta}`} style={{ color: CLAY }}>
          <span>Couldn&apos;t load the details: {error}</span>
          <button type="button" onClick={() => setAttempt((n) => n + 1)} className="font-bold underline underline-offset-2">Try again</button>
        </div>
      )}
      {prep && (
        <div className="flex items-start gap-2 text-[13px] leading-[1.4]" style={{ color: INK }} data-testid="prep-line">
          <span className="flex size-[22px] shrink-0 items-center justify-center rounded-[7px] border" style={{ background: SURFACE, borderColor: LINE, color: TEAL }}>
            {/technician/i.test(prep) ? <PhoneIcon className="size-3" /> : <PackageIcon className="size-3" />}
          </span>
          <span>{prep}</span>
        </div>
      )}
      <div className="flex items-center gap-2 pt-0.5">
        <button
          type="button"
          onClick={onComplete}
          disabled={completing}
          className="shrink-0 whitespace-nowrap rounded-[11px] px-4 py-2 text-[13px] font-bold text-white disabled:opacity-60"
          style={{ background: TEAL }}
        >
          Mark done
        </button>
        <button
          type="button"
          onClick={onSnooze}
          className="shrink-0 whitespace-nowrap rounded-[11px] border px-3.5 py-2 text-[12.5px] font-semibold"
          style={{ borderColor: LINE, background: SURFACE, color: SUB }}
        >
          <BellOffIcon className="mr-1 inline size-3.5 align-[-2px]" aria-hidden />Snooze
        </button>
        <Link to={`/tasks/${row.id}`} className="ml-auto inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap text-[12.5px] font-bold" style={{ color: TEAL }}>
          See details <ChevronRightIcon className="size-3" aria-hidden />
        </Link>
      </div>
    </div>
  )
}

function Pill({ text, tone = "plain" }: { text: string; tone?: "plain" | "when" | "clay" }) {
  const style =
    tone === "clay"
      ? { background: "var(--hh-clay-soft)", color: CLAY }
      : tone === "when"
        ? { background: SURFACE, color: "var(--hh-teal-deep)", border: `1px solid color-mix(in srgb, var(--hh-teal) 25%, transparent)` }
        : { background: SURFACE, color: SUB, border: `1px solid ${LINE}` }
  return <span className="inline-flex items-center rounded-full px-2.5 py-1 text-[12px] font-semibold" style={style}>{text}</span>
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
          <span className="block text-[17px] font-extrabold leading-tight tracking-[-0.02em]" style={{ color: INK }}>
            {until ? `All quiet until ${fmtShortDate(until)}` : "All quiet"}
          </span>
          <span className={`mt-0.5 block ${sc.meta}`} style={{ color: SUB }}>
            {ahead[0] ? `Nothing is late. Next up: ${ahead[0].title.toLowerCase()}.` : until ? "Nothing is late." : "Nothing is late, and nothing is scheduled yet."}
          </span>
        </span>
      </div>
      {ahead.length > 0 && (
        <>
          <div className="px-3.5 pb-1 pt-2 text-[10.5px] font-bold uppercase tracking-[0.6px]" style={{ color: SUB, borderTop: `1px solid ${LINE}` }}>Next up</div>
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
      className="flex items-center gap-2.5 rounded-2xl border px-3.5 py-2.5 text-[13px]"
      style={{ background: SURFACE, borderColor: LINE, color: SUB }}
      data-testid="timely-warranty"
    >
      <ShieldIcon className="size-4 shrink-0" style={{ color: TEAL }} aria-hidden />
      <span className="min-w-0 flex-1 truncate" style={{ color: INK }}>{w.display_name} warranty ends {fmtShortDate(w.warranty_expiry_date)}</span>
      <span className="shrink-0 font-bold" style={{ color: TEAL }}>Details</span>
    </Link>
  )
}
