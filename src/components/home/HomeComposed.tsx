import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { BellOffIcon, CalendarDaysIcon, CheckIcon, ChevronRightIcon, SparklesIcon } from "lucide-react"
import type { DashboardTask, MaintenanceTaskFull } from "@/lib/dashboard"
import { getRecentCompletions } from "@/lib/dashboard"
import { getItemUnits } from "@/modules/items"
import { detectWins, comingUp, drawerMeta, dueThisMonth, fmtWhen, GAP_DAYS, type QuickWin, type ComingUpRow } from "@/lib/homeHero"

/** Local YYYY-MM-DD (not toISOString, which is UTC and flips the date at night). */
function localToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

/**
 * The composed Home top: one stateful hero card, a Coming-up drawer, and an
 * on-demand monthly briefing. Design signed off 2026-08-05 (round 4).
 *
 * The rules that shaped it, so they survive refactors:
 *   · The hero IS the alert surface. A busy day changes its CONTENT — the task
 *     becomes the headline, stated once, with Mark done — never its temperature:
 *     the card stays teal in every state, and the only clay on a bad day is the
 *     overdue text itself. Urgency is information, not atmosphere.
 *   · Stats are buttons that say where they go; a zero is inert, because a tap
 *     that opens an empty list teaches people to stop tapping.
 *   · The win face hides when no win is true (insight-banner rule).
 *   · The drawer answers while closed ("2 in August · next Sat, Aug 15").
 *   · The briefing exists only when asked for, from real data, deterministic.
 */

const INK = "var(--hh-ink)", SUB = "var(--hh-sub)", FAINT = "var(--hh-faint)"
const TEAL = "var(--hh-teal)", CLAY = "var(--hh-clay)", LINE = "var(--hh-line)"

/**
 * One component, two scales. Mobile and desktop Home have drifted apart twice
 * this week (the Tasks header, the stat band) because each had its own copy of
 * the layout; a variant prop makes divergence impossible by construction.
 */
export type ComposedVariant = "mobile" | "desktop"
const SCALE = {
  mobile: {
    heroPad: "px-4 pb-3 pt-4", headline: "text-[19px]", quiet: "text-[18px]", ring: "size-10",
    statN: "text-[15.5px]", statL: "text-[11.5px]", statPad: "py-2.5",
    rowPad: "px-3.5 py-3", rowTitle: "text-[14px]", rowMeta: "text-[11.5px]",
    cuPad: "px-4 py-2.5", cuTitle: "text-[13.5px]", radius: 20,
  },
  desktop: {
    heroPad: "px-6 pb-4 pt-5", headline: "text-[24px]", quiet: "text-[22px]", ring: "size-12",
    statN: "text-[17px]", statL: "text-[12.5px]", statPad: "py-3",
    rowPad: "px-5 py-3.5", rowTitle: "text-[15px]", rowMeta: "text-[12.5px]",
    cuPad: "px-5 py-3", cuTitle: "text-[14.5px]", radius: 18,
  },
} as const

// ── hero ─────────────────────────────────────────────────────────────────────

/**
 * Two cells, not three. "14 items" was a constant dressed as a statistic — it
 * doesn't move week to week, and Items is already a tab. The band should only
 * carry things that CHANGE and that you might act on.
 */
function StatBand({ dueMonth, deadlineCount, onDue, onOverdue, sc }: {
  dueMonth: number
  /** Real deadlines only. Windows never count here — see design/due-windows.md. */
  deadlineCount: number
  onDue: () => void
  onOverdue: () => void
  sc: (typeof SCALE)[ComposedVariant]
}) {
  const cell = `flex flex-1 items-center justify-center gap-1.5 px-1 ${sc.statPad}`
  const divider = { borderLeft: "1px solid color-mix(in srgb, var(--hh-teal) 10%, var(--hh-line))" }
  return (
    <div
      className="mt-3 flex overflow-hidden rounded-[13px] border"
      style={{ background: "color-mix(in srgb, var(--hh-surface) 78%, transparent)", borderColor: "color-mix(in srgb, var(--hh-teal) 14%, var(--hh-line))" }}
    >
      <button type="button" onClick={onDue} className={cell}>
        <span className={`${sc.statN} font-extrabold tracking-[-0.02em]`} style={{ color: INK }}>{dueMonth}</span>
        <span className={`${sc.statL} font-semibold`} style={{ color: SUB }}>in their window</span>
        <ChevronRightIcon className="size-3" style={{ color: FAINT }} />
      </button>
      {deadlineCount > 0 ? (
        <button type="button" onClick={onOverdue} className={cell} style={divider}>
          <span className={`${sc.statN} font-extrabold tracking-[-0.02em]`} style={{ color: CLAY }}>{deadlineCount}</span>
          <span className={`${sc.statL} font-semibold`} style={{ color: SUB }}>{deadlineCount === 1 ? "deadline" : "deadlines"}</span>
          <ChevronRightIcon className="size-3" style={{ color: FAINT }} />
        </button>
      ) : (
        // Inert by design: tapping into an empty list is how users learn to
        // stop tapping. No chevron, no handler.
        <div className={cell} style={divider} aria-disabled="true">
          <span className={`${sc.statN} font-extrabold tracking-[-0.02em]`} style={{ color: TEAL }}>0</span>
          <span className={`${sc.statL} font-semibold`} style={{ color: SUB }}>deadlines</span>
        </div>
      )}
    </div>
  )
}

export function HomeComposed({ tasks, upcoming, homeId, completingId, onComplete, onSnooze, variant = "mobile" }: {
  /** Overdue + due-soon feed (the old urgent stack's data). */
  tasks: DashboardTask[]
  /** Forward schedule for the drawer + "due this month". */
  upcoming: MaintenanceTaskFull[]
  homeId: string | null
  completingId: string | null
  onComplete: (id: string) => void
  onSnooze: (id: string) => void
  variant?: ComposedVariant
}) {
  const navigate = useNavigate()
  const sc = SCALE[variant]
  const today = localToday()

  // Rows completed in THIS view, hidden locally until the data catches up.
  //
  // completeTask is eventually consistent: Home refetches once, immediately,
  // and that snapshot is usually taken before the write lands — so a task
  // ticked off in the drawer sat there unchanged until a reload (measured:
  // still listed 10s later, gone after reload). Nothing refetches again, so
  // "nothing happened, tap again" is exactly how it read. The optimistic hide
  // is the pattern the rest of the app already uses; the server stays the
  // authority on the next load.
  const [justDone, setJustDone] = useState<Set<string>>(new Set())
  const complete = (id: string) => {
    setJustDone((s) => new Set(s).add(id))
    onComplete(id)
  }

  // Busy = something is genuinely on you today: overdue, or due today. Due-in-
  // three-days lives in the drawer — that's planning, not interruption.
  const urgent = useMemo(
    () =>
      tasks
        .filter((t) => !justDone.has(t.id))
        .filter((t) => t.isOverdue || (t.daysUntilDue != null && t.daysUntilDue <= 0))
        .sort((a, b) => (b.daysOverdue ?? 0) - (a.daysOverdue ?? 0)),
    [tasks, justDone],
  )
  const heroTask = urgent[0] ?? null

  // ── faces ──────────────────────────────────────────────────────────────────
  const [face, setFace] = useState(0)
  const [wins, setWins] = useState<QuickWin[]>([])
  const [winIx, setWinIx] = useState(0)
  useEffect(() => {
    if (!homeId) return
    let cancelled = false
    getItemUnits(homeId)
      .then((res) => {
        if (!cancelled && res.data) setWins(detectWins(res.data))
      })
      .catch(() => {
        /* wins are optional by definition — a failed detector shows no face */
      })
    return () => { cancelled = true }
  }, [homeId])
  const faces = wins.length > 0 ? 2 : 1
  const activeFace = Math.min(face, faces - 1)

  // Swipe between faces (touch), dots as the visible affordance.
  const touchX = useRef<number | null>(null)
  // `swiped` exists because the hero is now BOTH swipeable and tappable. Without
  // it, a face-change swipe that happens to end over the headline would also
  // open the task — the same "the gesture was not a tap" lesson as the
  // pointercancel guard on the week rows.
  const swiped = useRef(false)
  const onTouchStart = (e: React.TouchEvent) => {
    touchX.current = e.touches[0].clientX
    swiped.current = false
  }
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchX.current == null || faces === 1) return
    const dx = e.changedTouches[0].clientX - touchX.current
    if (Math.abs(dx) > 40) {
      swiped.current = true
      setFace((f) => (dx < 0 ? Math.min(f + 1, faces - 1) : Math.max(f - 1, 0)))
    }
    touchX.current = null
  }

  /** The headline opens the task. Reported: "I was expecting to be able to click
   *  on it and see the instructions, including what size air filter I needed" —
   *  the hero named the job and then offered only Mark done / Snooze, so the one
   *  thing you need BEFORE doing it (how, and which part) had no route out. */
  const openTask = (id: string) => {
    if (swiped.current) return
    navigate(`/tasks/${id}`)
  }

  // ── drawer ─────────────────────────────────────────────────────────────────
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [pulse, setPulse] = useState(false)
  const drawerRef = useRef<HTMLDivElement>(null)
  const openDrawer = () => {
    setDrawerOpen(true)
    setPulse(true)
    setTimeout(() => setPulse(false), 900)
    setTimeout(() => drawerRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 60)
  }

  const rows: ComingUpRow[] = useMemo(() => {
    // The drawer merges the urgent feed (overdue) with the forward schedule,
    // deduped by id — getUpcomingTasks is future-only.
    const overdueRows = urgent
      .filter((t) => t.isOverdue && t.dueDate)
      .map((t) => ({
        id: t.id, title: t.name, itemName: t.itemName, item_id: t.itemId,
        next_due_date: t.dueDate, isOverdue: true,
        // Window-kind rows carry their phrase, so the drawer says "Been a
        // while" instead of counting days at the user.
        duePhrase: t.trulyOverdue ? null : (t.safetyNote ?? t.duePhrase),
      }))
    const seen = new Set(overdueRows.map((r) => r.id))
    const forward = upcoming.filter((t) => !seen.has(t.id) && !justDone.has(t.id))
    return comingUp([...overdueRows, ...forward], today)
  }, [urgent, upcoming, today, justDone])

  const dueMonth = useMemo(() => dueThisMonth(upcoming, today), [upcoming, today])
  const nextQuiet = rows.find((r) => r.overdueDays == null)

  // ── briefing ───────────────────────────────────────────────────────────────
  const [briefOpen, setBriefOpen] = useState(false)
  const [brief, setBrief] = useState<{ done30: number; lastDone: string | null } | null>(null)
  const [briefError, setBriefError] = useState<string | null>(null)
  const generate = async () => {
    if (briefOpen) { setBriefOpen(false); return }
    setBriefOpen(true)
    if (brief || !homeId) return
    try {
      setBrief(await getRecentCompletions(homeId, 30))
    } catch (e) {
      // The row must never hold a spinner it can't resolve.
      setBriefError(e instanceof Error ? e.message : "Could not gather your month.")
    }
  }

  const win = wins.length ? wins[winIx % wins.length] : null

  return (
    <div className="flex flex-col gap-2.5">
      {/* ── hero ─────────────────────────────────────────────────────────── */}
      <div
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        className="overflow-hidden border shadow-[0_6px_22px_rgba(11,26,22,0.07)]"
        style={{
          borderRadius: sc.radius,
          borderColor: "color-mix(in srgb, var(--hh-teal) 20%, var(--hh-line))",
          background: "linear-gradient(155deg, var(--hh-teal-wash), var(--hh-surface) 62%)",
        }}
      >
        <div className={sc.heroPad}>
          {activeFace === 0 ? (
            heroTask ? (
              <>
                <div className="font-mono text-[9.5px] font-extrabold uppercase tracking-[0.12em]" style={{ color: TEAL }}>
                  {/* "N need you" reads as an accusation for work that has no
                      deadline. A window is an invitation. Deadlines keep the
                      firmer voice, because they earned it. */}
                  {heroTask?.dueKind === "deadline"
                    ? (urgent.length > 1 ? `${urgent.length} need you — first:` : "Needs you first")
                    : (urgent.length > 1 ? "A good week for these — first:" : "A good week for this:")}
                </div>
                {/* The whole headline block is the target, not a small chevron:
                    it is what the eye lands on and what the finger reaches for. */}
                <button
                  type="button"
                  onClick={() => openTask(heroTask.id)}
                  className="block w-full text-left"
                >
                  <span className={`mt-1 block ${sc.headline} font-extrabold leading-[1.22] tracking-[-0.02em]`} style={{ color: INK }}>
                    {heroTask.name}
                  </span>
                  <span className="mt-0.5 flex items-center gap-1 text-[12.5px]" style={{ color: SUB }}>
                    <span>
                      {heroTask.itemName ?? "Home"}
                      {/* Clay stays for real deadlines and for lapsed safety
                          work — muted, never counting days at the user. */}
                      {heroTask.trulyOverdue ? (
                        <> · <span className="font-bold" style={{ color: CLAY }}>{heroTask.duePhrase}</span></>
                      ) : heroTask.safetyNote ? (
                        <> · <span className="font-semibold" style={{ color: CLAY }}>{heroTask.safetyNote}</span></>
                      ) : (
                        <> · {heroTask.duePhrase}</>
                      )}
                    </span>
                    <ChevronRightIcon className="size-3.5 shrink-0" style={{ color: TEAL }} aria-hidden />
                  </span>
                  <span className="mt-1 block text-[11.5px] font-semibold" style={{ color: TEAL }}>
                    See how &amp; what you need
                  </span>
                </button>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    disabled={completingId === heroTask.id}
                    onClick={() => complete(heroTask.id)}
                    className="rounded-[11px] px-4 py-2 text-[13px] font-bold text-white disabled:opacity-60"
                    style={{ background: TEAL }}
                  >
                    Mark done
                  </button>
                  <button
                    type="button"
                    onClick={() => onSnooze(heroTask.id)}
                    className="rounded-[11px] border px-3.5 py-2 text-[12.5px] font-semibold"
                    style={{ borderColor: LINE, background: "var(--hh-surface)", color: SUB }}
                  >
                    <BellOffIcon className="mr-1 inline size-3.5 align-[-2px]" />Snooze
                  </button>
                </div>
              </>
            ) : (
              <div className="flex items-center gap-3">
                <span
                  className={`flex ${sc.ring} shrink-0 items-center justify-center rounded-full border-[2.5px] text-[17px] font-extrabold`}
                  style={{ borderColor: TEAL, color: TEAL, background: "var(--hh-surface)" }}
                >
                  <CheckIcon className="size-5" strokeWidth={3} />
                </span>
                <span>
                  <span className={`block ${sc.quiet} font-extrabold leading-tight tracking-[-0.02em]`} style={{ color: INK }}>
                    {nextQuiet ? `All quiet until ${fmtWhen(nextQuiet.dueDate).replace(/^\w+, /, "")}` : "All quiet"}
                  </span>
                  <span className="mt-0.5 block text-[12.5px]" style={{ color: SUB }}>
                    {nextQuiet ? `Nothing is late. Next up: ${nextQuiet.title.toLowerCase()}.` : "Nothing is late, and nothing is scheduled yet."}
                  </span>
                </span>
              </div>
            )
          ) : win ? (
            <>
              <div className="font-mono text-[9.5px] font-extrabold uppercase tracking-[0.11em]" style={{ color: TEAL }}>{win.kicker}</div>
              <div className={`mt-1 ${sc.quiet} font-extrabold tracking-[-0.02em]`} style={{ color: INK }}>{win.title}</div>
              <div className="mt-1 text-[13px] leading-[1.45]" style={{ color: SUB }}>{win.why}</div>
              <div className="mt-3 flex items-center gap-2">
                <button type="button" onClick={() => navigate(win.to)} className="rounded-[11px] px-4 py-2 text-[13px] font-bold text-white" style={{ background: TEAL }}>
                  {win.cta}
                </button>
                <button type="button" onClick={() => setWinIx((i) => i + 1)} className="text-[12.5px] font-semibold" style={{ color: SUB }}>
                  Maybe later
                </button>
              </div>
            </>
          ) : null}

          {activeFace === 0 && (
            <StatBand
              sc={sc}
              dueMonth={dueMonth}
              deadlineCount={urgent.filter((t) => t.trulyOverdue).length}
              onDue={openDrawer}
              onOverdue={openDrawer}
            />
          )}
        </div>

        {/* The DOT stays 5px; the BUTTON is 24px. A pager dot sized to its own
            visual is a 5px tap target — what axe's target-size rule flagged and
            what a thumb misses. The negative margin keeps the row the height it
            was, so the fix is invisible until you try to tap it. */}
        {faces > 1 && (
          <div className="-my-1.5 flex items-center justify-center pb-2.5">
            {[0, 1].map((i) => (
              <button
                key={i}
                type="button"
                aria-label={i === 0 ? "Home summary" : "One small thing"}
                onClick={() => setFace(i)}
                className="flex h-6 min-w-6 items-center justify-center px-1.5"
              >
                <span
                  className="block rounded-full transition-all"
                  style={{
                    width: activeFace === i ? 14 : 5,
                    height: 5,
                    background: activeFace === i ? "var(--hh-teal)" : "var(--hh-line)",
                  }}
                />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── coming up ────────────────────────────────────────────────────── */}
      <div
        ref={drawerRef}
        className="overflow-hidden rounded-[15px] border transition-shadow"
        style={{
          borderColor: LINE,
          background: "var(--hh-surface)",
          boxShadow: pulse ? "0 0 0 2.5px color-mix(in srgb, var(--hh-teal) 35%, transparent)" : undefined,
        }}
      >
        <button type="button" onClick={() => setDrawerOpen((v) => !v)} aria-expanded={drawerOpen} className={`flex w-full items-center gap-2.5 text-left ${sc.rowPad}`}>
          <span className="flex size-7 shrink-0 items-center justify-center rounded-[9px]" style={{ background: "var(--hh-slate-soft)" }}>
            <CalendarDaysIcon className="size-[15px]" style={{ color: "var(--hh-slate)" }} />
          </span>
          <span className="min-w-0 flex-1">
            <span className={`block ${sc.rowTitle} font-bold`} style={{ color: INK }}>Coming up</span>
            <span className={`block ${sc.rowMeta}`} style={{ color: SUB }}>{drawerMeta(rows, today)}</span>
          </span>
          <ChevronRightIcon className="size-4 shrink-0 transition-transform" style={{ color: FAINT, transform: drawerOpen ? "rotate(90deg)" : undefined }} />
        </button>
        {drawerOpen && rows.length > 0 && (
          <div style={{ borderTop: `1px solid ${LINE}` }}>
            {rows.map((r) => (
              <div key={r.id}>
                {r.gapBefore >= GAP_DAYS && (
                  <div className="px-4 py-1.5 text-[11.5px] italic" style={{ color: FAINT, background: "color-mix(in srgb, var(--hh-bg) 55%, var(--hh-surface))", borderBottom: `1px solid ${LINE}` }}>
                    — {Math.round(r.gapBefore / 7)} quiet week{Math.round(r.gapBefore / 7) === 1 ? "" : "s"} —
                  </div>
                )}
                {/* A row you can act on. The done circle completes in place;
                    the body opens the item page, which is where the task's
                    context lives. A title alone ("Check Grate Support
                    Bumpers") doesn't tell you what it's FOR, so the item name
                    rides along underneath — relevant, timely, and now
                    intelligible. */}
                <div className={`flex items-center gap-2 ${sc.cuPad}`} style={{ borderBottom: `1px solid ${LINE}` }}>
                  <button
                    type="button"
                    disabled={completingId === r.id}
                    onClick={(e) => { e.stopPropagation(); complete(r.id) }}
                    aria-label={`Mark "${r.title}" done`}
                    className="-ml-1 flex shrink-0 p-1.5 disabled:opacity-40"
                  >
                    <span className="flex size-[22px] items-center justify-center rounded-full border-2" style={{ borderColor: TEAL }}>
                      <CheckIcon className="size-3 opacity-0" strokeWidth={3} />
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate(r.itemId ? `/items/${r.itemId}` : "/maintenance")}
                    className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                  >
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate ${sc.cuTitle} font-semibold`} style={{ color: INK }}>{r.title}</span>
                      <span className="block truncate text-[12px]" style={{ color: SUB }}>{r.itemName ?? "Whole home"}</span>
                    </span>
                    <span className="whitespace-nowrap text-[12px]" style={{ color: r.overdueDays != null ? CLAY : SUB, fontWeight: r.overdueDays != null ? 700 : 500 }}>
                      {r.duePhrase ?? r.when}
                    </span>
                    <ChevronRightIcon className="size-4 shrink-0" style={{ color: FAINT }} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── monthly briefing ─────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-[15px] border" style={{ borderColor: LINE, background: "var(--hh-surface)" }}>
        <button type="button" onClick={() => void generate()} aria-expanded={briefOpen} className={`flex w-full items-center gap-2.5 text-left ${sc.rowPad}`}>
          <span className="flex size-7 shrink-0 items-center justify-center rounded-[9px]" style={{ background: "var(--hh-teal-wash)" }}>
            <SparklesIcon className="size-[15px]" style={{ color: TEAL }} />
          </span>
          <span className="min-w-0 flex-1">
            <span className={`block ${sc.rowTitle} font-bold`} style={{ color: INK }}>Monthly briefing</span>
            <span className={`block ${sc.rowMeta}`} style={{ color: SUB }}>
              {briefOpen ? "Generated from your home's data" : "Tap to generate — the past 30 days, and what's ahead"}
            </span>
          </span>
          <ChevronRightIcon className="size-4 shrink-0 transition-transform" style={{ color: FAINT, transform: briefOpen ? "rotate(90deg)" : undefined }} />
        </button>
        {briefOpen && (
          <div className="px-4 pb-4 pt-1" style={{ borderTop: `1px solid ${LINE}` }}>
            {briefError ? (
              <p className="pt-2 text-[12.5px]" style={{ color: CLAY }}>{briefError}</p>
            ) : !brief ? (
              <p className="pt-2 text-[12.5px]" style={{ color: SUB }}>Gathering your month…</p>
            ) : (
              <>
                <div className="pt-2" style={{ fontFamily: '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif' }}>
                  <span className="text-[17px] font-semibold tracking-[-0.01em]" style={{ color: INK }}>
                    {/* The headline must not contradict the page. "A quiet
                        stretch" above two overdue tasks describes inactivity as
                        calm — the home isn't quiet, it's just untended. */}
                    {rows.some((r) => r.overdueDays != null)
                      ? brief.done30 > 0 ? "Good progress, a couple of loose ends." : "A few things have slipped."
                      : brief.done30 > 0 ? "A steady month, in good shape." : "A quiet stretch."}
                  </span>
                </div>
                <div className="mt-2.5">
                  <div className="font-mono text-[9px] font-extrabold uppercase tracking-[0.1em]" style={{ color: FAINT }}>The past 30 days</div>
                  <p className="mt-0.5 text-[13px] leading-[1.5]" style={{ color: INK }}>
                    {brief.done30 > 0
                      ? <>You completed <b>{brief.done30} task{brief.done30 === 1 ? "" : "s"}</b>{brief.lastDone ? <> — most recently &ldquo;{brief.lastDone}&rdquo;</> : null}.</>
                      : <>Nothing was completed — which is fine when nothing was due.</>}
                  </p>
                </div>
                <div className="mt-2.5">
                  <div className="font-mono text-[9px] font-extrabold uppercase tracking-[0.1em]" style={{ color: FAINT }}>Ahead</div>
                  <p className="mt-0.5 text-[13px] leading-[1.5]" style={{ color: INK }}>
                    {rows.filter((r) => r.overdueDays == null).slice(0, 2).map((r, i) => (
                      <span key={r.id}>{i > 0 ? " Then " : ""}{r.title}{r.itemName ? ` on the ${r.itemName}` : ""} ({r.when}).</span>
                    ))}
                    {rows.filter((r) => r.overdueDays == null).length === 0 &&
                      (rows.length > 0
                        ? "Nothing new is scheduled — the work above is what's waiting."
                        : "Nothing on the schedule yet.")}
                  </p>
                </div>
                <p className="mt-3 text-[10.5px]" style={{ color: FAINT }}>
                  Covers the past 30 days and the month ahead · regenerates when you ask
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
