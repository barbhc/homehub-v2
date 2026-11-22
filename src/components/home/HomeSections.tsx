/**
 * Home's sections (design/home-next.md, owner-approved 2026-11-21):
 * Ask, Next up, Heads up, Coming up, In a pinch, Pinned by you.
 *
 * Next up is the task card (design/task-card.md). Everything below it is what
 * the Tasks tab can't show; a section with nothing to say is not rendered.
 */
import { useMemo, useState, type FormEvent } from "react"
import { Link, useNavigate } from "react-router-dom"
import {
  ArrowUpIcon, BookOpenIcon, ChevronRightIcon, DropletIcon, FlameIcon, MegaphoneIcon, PhoneIcon, PinIcon, ShieldIcon,
  SparklesIcon, ZapIcon, type LucideIcon,
} from "lucide-react"
import type { CareNote, ServiceProvider } from "@/integrations/types"
import type { DashboardTask, ExpiringWarrantyItem, HomeNotices, MaintenanceTaskFull } from "@/lib/dashboard"
import { useTaskDetail } from "@/components/home/tasks/shared"
import { InlineError } from "@/components/layout/LoadStates"
import { TaskCardActions, TaskStatusLine, TaskSupplyLine } from "@/components/tasks/TaskCard"
import { itemMinutesLine, whenTone } from "@/lib/taskCard"
import { weekRows, nextUpRows, prepLine, prepPlace, fmtShortDate, type HomeWeekRow, type ComingUp as ComingUpForecast } from "@/lib/homeWeek"
import { comingUpRows, headsUpRows, pinchSpots, pinnedNotes, prosSummary, type HeadsUpRow, type PinchKey } from "@/lib/homeSections"
import { splitNote } from "@/lib/notes"
import { requestReview } from "@/lib/reviewRequest"
import { localToday } from "../../../shared/dates/calendar"
import { useNotes } from "@/components/notes/useNotes"
import { getHomeNotes } from "@/modules/care"
import { useServiceProviders } from "@/hooks/useServiceProviders"
import { useIsDesktop } from "@/hooks/useIsDesktop"

const INK = "var(--hh-ink)", SUB = "var(--hh-sub)", FAINT = "var(--hh-faint)", TEAL = "var(--hh-teal)", CLAY = "var(--hh-clay)"
const SURFACE = "var(--hh-surface)", LINE = "var(--hh-line)"
const CARD = "overflow-hidden rounded-2xl border shadow-[0_1px_2px_rgba(15,23,42,0.04)]"

/** Section label (Caption 1, 12/16) with an optional link on the right. */
function Section({ label, right, children, testId }: { label: string; right?: React.ReactNode; children: React.ReactNode; testId: string }) {
  return (
    <section className="flex flex-col gap-2" data-testid={testId} aria-label={label}>
      <div className="flex items-baseline justify-between pl-0.5">
        <span className="text-xs font-bold uppercase leading-[1.33] tracking-[0.6px]" style={{ color: SUB }}>{label}</span>
        {right}
      </div>
      {children}
    </section>
  )
}

function IconTile({ icon: Icon, tone = "teal" }: { icon: LucideIcon; tone?: "teal" | "clay" | "gold" | "grey" }) {
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

/** One row of a section card: icon, title (Headline 17/22), sub (Footnote 13/18), trailing action or arrow. */
function Row({ icon, tone, title, sub, action, first, to, onClick, testId }: {
  icon: LucideIcon
  tone?: "teal" | "clay" | "gold" | "grey"
  title: string
  sub?: string | null
  /** A word in teal ("Add", "Review", "Call"); otherwise an arrow. */
  action?: string
  first: boolean
  to: string
  onClick?: () => void
  testId?: string
}) {
  return (
    <Link
      to={to}
      onClick={onClick}
      data-testid={testId}
      className="flex min-h-[60px] items-center gap-3 px-3.5 py-3"
      style={{ borderTop: first ? "none" : `1px solid ${LINE}` }}
    >
      <IconTile icon={icon} tone={tone} />
      <span className="min-w-0 flex-1">
        <span className="block text-[1.0625rem] font-semibold leading-[1.3] [overflow-wrap:anywhere]" style={{ color: INK }}>{title}</span>
        {sub && <span className="mt-0.5 block text-[0.8125rem] leading-[1.38] [overflow-wrap:anywhere]" style={{ color: SUB }}>{sub}</span>}
      </span>
      {action
        ? <span className="shrink-0 text-[0.9375rem] font-semibold" style={{ color: TEAL }}>{action}</span>
        : <ChevronRightIcon className="size-[18px] shrink-0" style={{ color: FAINT }} aria-hidden />}
    </Link>
  )
}

// ── Ask ───────────────────────────────────────────────────────────────────────

/** One field, one send button (audit finding 13: the old bar was three links to the same page). */
export function AskField() {
  const navigate = useNavigate()
  const [q, setQ] = useState("")
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const text = q.trim()
    navigate(text ? `/chat?q=${encodeURIComponent(text.slice(0, 500))}` : "/chat")
  }
  return (
    <form onSubmit={submit} role="search" className="flex min-h-[52px] items-center gap-2.5 rounded-2xl border py-1 pl-3.5 pr-1.5" style={{ background: SURFACE, borderColor: "var(--hh-line2)" }}>
      <SparklesIcon className="size-[18px] shrink-0" style={{ color: TEAL }} aria-hidden />
      <input
        type="text"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Ask about your home…"
        aria-label="Ask about your home"
        enterKeyHint="send"
        className="min-w-0 flex-1 bg-transparent text-[1.0625rem] outline-none placeholder:text-[var(--hh-faint)]"
        style={{ color: INK }}
      />
      <button type="submit" aria-label="Ask" className="flex size-11 shrink-0 items-center justify-center rounded-full" style={{ background: "var(--hh-teal-fill)", color: "var(--hh-on-fill)" }}>
        <ArrowUpIcon className="size-[18px]" strokeWidth={2.6} aria-hidden />
      </button>
    </form>
  )
}

// ── Next up ───────────────────────────────────────────────────────────────────

/** What Home knows about its supplementary reads (useDashboard's `extras`). */
export type HomeExtras = { ready: boolean; failed: string[] }
const READY: HomeExtras = { ready: true, failed: [] }

export function NextUp({ homeId, tasks, upcoming, nextUp = null, extras = READY, completingId, actionError, onComplete, onSnooze }: {
  homeId: string | null
  /** While the forward schedule is still loading, or failed, an empty week is
   *  not known to be empty: nothing is claimed (HomeLoadNote says a failure). */
  extras?: HomeExtras
  tasks: DashboardTask[]
  upcoming: MaintenanceTaskFull[]
  /** The next due date from the stats, for when the forward feed hasn't come yet (HH-92). */
  nextUp?: { dueDate: string; windowStart: string } | null
  completingId: string | null
  actionError?: { id: string; message: string } | null
  onComplete: (id: string) => void
  onSnooze: (id: string) => void
}) {
  const today = localToday()
  const rows = useMemo(() => weekRows(tasks, upcoming, today), [tasks, upcoming, today])
  const lead = rows[0] ?? null
  const more = rows.length - 1
  if (!lead) {
    if (!extras.ready || extras.failed.includes("upcoming")) return null
    const ahead = nextUpRows(upcoming, today, 1)[0]
    return (
      <Section label="Next up" testId="next-up">
        <div className={`${CARD} px-4 py-4`} style={{ background: SURFACE, borderColor: LINE }} data-testid="next-up-quiet">
          <p className="text-[1.0625rem] font-semibold leading-[1.3]" style={{ color: INK }}>Nothing due this week</p>
          <p className="mt-0.5 text-[0.9375rem] leading-[1.33]" style={{ color: SUB }}>
            {/* HH-92: never "nothing is scheduled" over scheduled work. */}
            {ahead?.dueDate
              ? `Next up: ${ahead.title.toLowerCase()}, ${fmtShortDate(ahead.dueDate)}.`
              : nextUp?.dueDate
                ? `Nothing is late. The next task is ${fmtShortDate(nextUp.dueDate)}.`
                : "Nothing is late, and nothing is scheduled yet."}
          </p>
        </div>
      </Section>
    )
  }
  return (
    <Section label="Next up" testId="next-up">
      <NextUpCard
        key={lead.id}
        row={lead}
        homeId={homeId}
        completing={completingId === lead.id}
        error={actionError?.id === lead.id ? actionError.message : null}
        onComplete={() => onComplete(lead.id)}
        onSnooze={() => onSnooze(lead.id)}
      />
      {more > 0 && (
        <div className="flex justify-end">
          <Link to="/maintenance" className="hit-44 inline-flex items-center gap-0.5 text-[0.9375rem] font-semibold" style={{ color: TEAL }}>
            {more} more this week <ChevronRightIcon className="size-4" aria-hidden />
          </Link>
        </div>
      )}
    </Section>
  )
}

/** The task card at Home's size: title in Apple's Title 3 (20/25). */
function NextUpCard({ row, homeId, completing, error, onComplete, onSnooze }: {
  row: HomeWeekRow
  homeId: string | null
  completing: boolean
  error: string | null
  onComplete: () => void
  onSnooze: () => void
}) {
  const [attempt, setAttempt] = useState(0)
  const { detail, loading, error: loadError } = useTaskDetail(homeId, row.id, true, attempt)
  const when = row.safetyNote ?? row.duePhrase
  const tone = whenTone(when, { trulyOverdue: row.trulyOverdue, safetyNote: row.safetyNote })
  const prep = prepLine(detail)
  const place = prepPlace(detail)
  const meta = itemMinutesLine(row.itemName ?? "Whole home", detail?.estimatedMinutes)
  return (
    <div className={`${CARD} flex flex-col gap-3 p-4`} style={{ background: SURFACE, borderColor: LINE }} data-testid="next-up-card">
      <Link to={`/tasks/${row.id}`} aria-label={`Open ${row.title}`} className="flex items-start gap-3">
        <span className="min-w-0 flex-1">
          <TaskStatusLine tier={row.tier} when={when} tone={tone} />
          <span className="mt-1 block text-[1.25rem] font-semibold leading-[1.25] tracking-[-0.2px]" style={{ color: INK }} data-testid="next-up-title">{row.title}</span>
          {meta && <span className="mt-1 block text-[0.9375rem] leading-[1.33]" style={{ color: SUB }}>{meta}</span>}
        </span>
        <ChevronRightIcon className="mt-6 size-5 shrink-0" style={{ color: FAINT }} aria-hidden />
      </Link>
      {loading && !detail && <span className="text-[0.8125rem]" style={{ color: FAINT }}>Loading…</span>}
      {loadError && (
        <div role="alert" className="flex items-center gap-2 text-[0.8125rem]" style={{ color: CLAY }}>
          <span>Couldn&apos;t load the details: {loadError}</span>
          <button type="button" onClick={() => setAttempt((n) => n + 1)} className="hit-44 font-bold underline underline-offset-2">Try again</button>
        </div>
      )}
      {prep && <TaskSupplyLine text={prep} place={place} />}
      {error && <InlineError>{error}</InlineError>}
      <TaskCardActions onDone={onComplete} onSnooze={onSnooze} completing={completing} className="max-w-[440px]" />
    </div>
  )
}

// ── Heads up ──────────────────────────────────────────────────────────────────

const HEADS_ICON: Record<HeadsUpRow["kind"], { icon: LucideIcon; tone: "clay" | "teal" | "gold" }> = {
  recall: { icon: MegaphoneIcon, tone: "clay" },
  review: { icon: BookOpenIcon, tone: "teal" },
  warranty: { icon: ShieldIcon, tone: "gold" },
}

export function HeadsUp({ recalls, ready, warranties, extras = READY }: {
  extras?: HomeExtras
  recalls: HomeNotices["recalls"]
  ready: { manualId: string; itemUnitId: string; title: string }[]
  warranties: ExpiringWarrantyItem[]
}) {
  // Recalls and warranties wait for this home's data; a manual ready to
  // review comes from its own live listener and can show at once.
  const rows = headsUpRows({ recalls: extras.ready ? recalls : [], ready, warranties: extras.ready ? warranties : [] })
  if (rows.length === 0) return null
  return (
    <Section label="Heads up" testId="heads-up">
      <div className={CARD} style={{ background: SURFACE, borderColor: LINE }}>
        {rows.map((r, i) => (
          <Row
            key={r.key}
            first={i === 0}
            icon={HEADS_ICON[r.kind].icon}
            tone={HEADS_ICON[r.kind].tone}
            title={r.title}
            sub={r.sub}
            action={r.kind === "review" ? "Review" : undefined}
            to={r.kind === "warranty" ? "/warranties" : `/items/${r.itemId}`}
            onClick={r.kind === "review" ? () => requestReview(r.manualId) : undefined}
            testId="heads-up-row"
          />
        ))}
      </div>
    </Section>
  )
}

// ── Coming up ─────────────────────────────────────────────────────────────────

export function ComingUp({ tasks, upcoming, forecast = null, extras = READY }: {
  extras?: HomeExtras
  /** The urgent feed, so a task that is Next up (or in this week) is not repeated here. */
  tasks: DashboardTask[]
  upcoming: MaintenanceTaskFull[]
  /** Each task's next round (stats.comingUp), shown when nothing is on the calendar after this week. */
  forecast?: ComingUpForecast | null
}) {
  const today = localToday()
  const rows = extras.ready && !extras.failed.includes("upcoming") ? comingUpRows(upcoming, today, 3, forecast, weekRows(tasks, upcoming, today)) : []
  if (rows.length === 0) return null
  return (
    <Section
      label="Coming up"
      testId="coming-up"
      right={<Link to="/maintenance" className="hit-44 text-[0.9375rem] font-semibold" style={{ color: TEAL }}>Calendar</Link>}
    >
      <div className={CARD} style={{ background: SURFACE, borderColor: LINE }}>
        {rows.map((r, i) => (
          <Link key={r.id} to={r.href} className="flex min-h-[60px] items-center gap-3 px-3.5 py-3" style={{ borderTop: i === 0 ? "none" : `1px solid ${LINE}` }} data-testid="coming-up-row">
            {/* Month always; the day only for a real deadline (design/due-windows.md). */}
            <span className="flex min-h-11 min-w-11 shrink-0 flex-col items-center justify-center rounded-[10px] px-1.5 py-1 leading-none" style={{ background: "var(--hh-surface2)" }} aria-hidden>
              <span className="text-xs font-bold tracking-[0.5px]" style={{ color: CLAY }}>{r.month}</span>
              {r.day && <span className="mt-1 text-[1.0625rem] font-bold" style={{ color: INK }}>{r.day}</span>}
            </span>
            <span className="min-w-0 flex-1">
              {/* The tile is a picture of the date; this says it (a label on a plain span is not read out). */}
              <span className="sr-only">{r.when}: </span>
              <span className="block text-[1.0625rem] font-semibold leading-[1.3]" style={{ color: INK }}>{r.title}</span>
              <span className="mt-0.5 block text-[0.8125rem] leading-[1.38]" style={{ color: SUB }}>{r.item}</span>
            </span>
          </Link>
        ))}
      </div>
    </Section>
  )
}

// ── In a pinch ────────────────────────────────────────────────────────────────

const PINCH_ICON: Record<PinchKey, LucideIcon> = { water: DropletIcon, gas: FlameIcon, power: ZapIcon }

export function InAPinch({ notes, notesError, providers, providersError, onRetry }: {
  notes: CareNote[] | null
  notesError: string | null
  providers: ServiceProvider[] | null
  providersError: boolean
  onRetry: () => void
}) {
  // A failed read never shows "Add": that would say a shutoff isn't noted when
  // it might be (design/home-next.md, failure modes).
  if (notesError || providersError) {
    return (
      <Section label="In a pinch" testId="in-a-pinch">
        <div role="alert" className={`${CARD} flex items-center gap-2 px-4 py-3.5 text-[0.9375rem]`} style={{ background: SURFACE, borderColor: LINE, color: CLAY }}>
          <span className="min-w-0 flex-1">Couldn&apos;t load these.</span>
          <button type="button" onClick={onRetry} className="hit-44 shrink-0 font-bold underline underline-offset-2">Try again</button>
        </div>
      </Section>
    )
  }
  if (!notes || !providers) return null // still loading: nothing rather than a guess
  const spots = pinchSpots(notes)
  const pros = prosSummary(providers)
  return (
    <Section label="In a pinch" testId="in-a-pinch">
      <div className={CARD} style={{ background: SURFACE, borderColor: LINE }}>
        {spots.map((s, i) => (
          <Row
            key={s.key}
            first={i === 0}
            icon={PINCH_ICON[s.key]}
            title={s.label}
            sub={s.value ?? s.empty}
            action={s.value ? undefined : "Add"}
            to={s.value ? "/inventory/notes" : `/inventory/notes?idea=${encodeURIComponent(s.idea)}`}
            testId="pinch-row"
          />
        ))}
        <Row
          first={false}
          icon={PhoneIcon}
          title="Your pros"
          sub={pros.names.length ? pros.names.join(" · ") : "Save a plumber before you need one"}
          action={pros.names.length ? undefined : "Add"}
          to="/providers"
          testId="pinch-row"
        />
      </div>
    </Section>
  )
}

// ── Pinned by you ─────────────────────────────────────────────────────────────

export function PinnedNotes({ notes }: { notes: CareNote[] | null }) {
  const pinned = notes ? pinnedNotes(notes) : []
  if (pinned.length === 0) return null
  return (
    <Section
      label="Pinned by you"
      testId="pinned"
      right={<Link to="/inventory/notes" className="hit-44 text-[0.9375rem] font-semibold" style={{ color: TEAL }}>Edit</Link>}
    >
      <div className={CARD} style={{ background: SURFACE, borderColor: LINE }}>
        {pinned.map((n, i) => {
          const { heading, body } = splitNote(n.content, n.title)
          const first = body.split("\n")[0]?.trim() ?? ""
          return (
            <Row
              key={n.note_id}
              first={i === 0}
              icon={PinIcon}
              tone="grey"
              title={heading ?? (first || "Note")}
              sub={heading ? first : null}
              to={n.scope === "room" && n.room_id ? `/inventory/rooms/${n.room_id}/notes` : n.scope === "item_unit" && n.item_unit_id ? `/items/${n.item_unit_id}` : "/inventory/notes"}
              testId="pinned-row"
            />
          )
        })}
      </div>
    </Section>
  )
}


// ── In a pinch + Pinned, with their own reads ────────────────────────────────

/** Reads the home's notes and providers once for both sections. Try again
 *  remounts the reader, so both reads run again. */
export function PinchAndPinned({ homeId, tree }: { homeId: string; tree: "phone" | "desktop" }) {
  const [attempt, setAttempt] = useState(0)
  // Home mounts a phone tree and a desktop tree and CSS shows one. Only the
  // shown one reads, so notes and providers aren't fetched twice.
  const isDesktop = useIsDesktop()
  if (isDesktop !== (tree === "desktop")) return null
  return <PinchAndPinnedReads key={`${homeId}:${attempt}`} homeId={homeId} onRetry={() => setAttempt((n) => n + 1)} />
}

function PinchAndPinnedReads({ homeId, onRetry }: { homeId: string; onRetry: () => void }) {
  const { notes, error } = useNotes(`home-notes:${homeId}`, () => getHomeNotes(homeId))
  const { providers, loading: providersLoading, loadFailed } = useServiceProviders(homeId)
  return (
    <>
      <InAPinch notes={notes} notesError={error} providers={providersLoading ? null : providers} providersError={loadFailed} onRetry={onRetry} />
      <PinnedNotes notes={notes} />
    </>
  )
}

/** One compact line when part of Home couldn't load, so an empty section is
 *  never mistaken for "nothing there" (Codex review F2). */
export function HomeLoadNote({ extras, onRetry }: { extras: HomeExtras; onRetry: () => void }) {
  if (extras.failed.length === 0) return null
  return (
    <div role="alert" className={`${CARD} flex items-center gap-2 px-4 py-3 text-[0.9375rem]`} style={{ background: SURFACE, borderColor: LINE, color: CLAY }} data-testid="home-load-note">
      <span className="min-w-0 flex-1">Couldn&apos;t load recalls, warranties and what&apos;s coming up.</span>
      <button type="button" onClick={onRetry} className="hit-44 shrink-0 font-bold underline underline-offset-2">Try again</button>
    </div>
  )
}
