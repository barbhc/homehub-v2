import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  AlarmClockIcon, CheckIcon, ChevronDownIcon, ChevronUpIcon, FlagIcon,
  SparklesIcon, XIcon,
} from "lucide-react"
import { getWeekAgenda, markTaskInstanceDone, snoozeTaskInstance, type WeekAgendaItem } from "@/modules/care"
import { TIER, type Tier } from "@/lib/redesign/tokens"
import { parseSteps } from "@/pages/item-detail/utils"
import { InfoBlurb, StepList } from "@/components/tasks/TaskHowTo"
import {
  addDays, applyTierFilter, useTierFilter, computeInsight, dayLabel, groupTasks, monthCalendar,
  TIER_FILTERS, tierFilterCounts,
  tasksDueOnDay, todayStr, useTaskDetail, whenLabel, type Lens, CLAY, TEAL,
} from "./tasks/shared"

const INK = "var(--hh-ink)", SUB = "var(--hh-sub)", FAINT = "var(--hh-faint)", BG = "var(--hh-bg)"
const LINE = "var(--hh-line)", SURFACE = "var(--hh-surface)"
const PAD = 20

// How far ahead to pull so the month calendar + "Later" group have real content.
const HORIZON_DAYS = 31

type View = "list" | "calendar"

// ── Expanded detail (why · notes · actions) ───────────────────────────────────
// Real data exposes justification + notes only; we link to the full guide rather
// than invent supplies/numbered steps.
function ExpandedDetail({
  homeId, taskInstanceId, expanded, onDone, onSnooze, onOpenGuide,
}: {
  homeId: string | null
  taskInstanceId: string
  expanded: boolean
  onDone: () => void
  onSnooze: () => void
  onOpenGuide: () => void
}) {
  const { detail, loading } = useTaskDetail(homeId, taskInstanceId, expanded)
  return (
    <div className="flex flex-col gap-3" style={{ padding: `0 ${PAD - 3}px ${PAD - 3}px` }}>
      {loading ? (
        <div className="text-[13px]" style={{ color: FAINT }}>Loading…</div>
      ) : (
        <>
          {detail?.justification && <InfoBlurb text={detail.justification} />}
          {detail?.notes && <StepList steps={parseSteps(detail.notes)} />}
          {!loading && !detail?.justification && !detail?.notes && (
            <div className="text-[13px]" style={{ color: FAINT }}>No extra details yet.</div>
          )}
          <button
            type="button"
            onClick={onOpenGuide}
            className="self-start text-[13px] font-semibold underline-offset-2 hover:underline"
            style={{ color: TEAL }}
          >
            View full guide
          </button>
        </>
      )}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onDone}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-[14px] font-bold text-white"
          style={{ background: TEAL }}
        >
          <CheckIcon className="size-4" strokeWidth={2.6} /> Mark done
        </button>
        <button
          type="button"
          onClick={onSnooze}
          className="rounded-xl px-4 py-3 text-[14px] font-bold"
          style={{ border: "1.5px solid var(--hh-line2)", background: SURFACE, color: INK }}
        >
          Snooze
        </button>
      </div>
    </div>
  )
}

// ── Swipeable + expandable row ────────────────────────────────────────────────
function TaskRow({
  homeId, t, expanded, onToggle, onDone, onSnooze, onOpenGuide,
}: {
  homeId: string | null
  t: WeekAgendaItem
  expanded: boolean
  onToggle: () => void
  onDone: () => void
  onSnooze: () => void
  onOpenGuide: () => void
}) {
  const tier = (t.priorityTier as Tier) ?? "optional"
  const [dx, setDx] = useState(0)
  const [dragging, setDragging] = useState(false)
  const drag = useRef<{ x: number; dx: number; moved: boolean } | null>(null)
  const TH = 72

  const down = (e: React.PointerEvent) => {
    drag.current = { x: e.clientX, dx: 0, moved: false }
    setDragging(true)
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* noop */ }
  }
  const move = (e: React.PointerEvent) => {
    if (!drag.current) return
    let nd = e.clientX - drag.current.x
    if (Math.abs(nd) > 4) drag.current.moved = true
    nd = Math.max(-120, Math.min(120, nd))
    drag.current.dx = nd
    setDx(nd)
  }
  const up = (e: React.PointerEvent) => {
    const g = drag.current
    drag.current = null
    setDragging(false)
    if (!g) return
    // pointercancel is iOS saying "the scroll gesture took this pointer" — the
    // finger was never a tap. Treating it as one expanded a task on almost
    // every scroll, because a list this dense leaves nowhere neutral to put a
    // finger down. Cancel resets; only a genuine up with no movement toggles.
    if (e.type === "pointercancel") { setDx(0); return }
    if (!g.moved) { setDx(0); onToggle(); return }
    if (g.dx > TH) { setDx(0); onDone() }
    else if (g.dx < -TH) { setDx(0); onSnooze() }
    else setDx(0)
  }

  return (
    <div className="relative overflow-hidden" style={{ borderTop: `0.5px solid ${LINE}` }}>
      {/* Swipe reveals: right → Done (teal), left → Snooze (amber). Decoration
          only — and it MUST NOT take pointer events. It's `inset-0` on the
          container, so when the row is expanded it covers the detail panel too;
          being a POSITIONED sibling it paints above that non-positioned panel,
          and opacity:0 is still a hit target. Without this, every control in
          the expanded card ("View full guide", "Mark done", "Snooze") silently
          did nothing. */}
      <div className="pointer-events-none absolute inset-0 flex">
        <div className="flex flex-1 items-center pl-5" style={{ background: TEAL, opacity: dx > 4 ? 1 : 0 }}>
          <span className="inline-flex items-center gap-1.5 text-[13.5px] font-bold text-white"><CheckIcon className="size-[18px]" strokeWidth={2.6} /> Done</span>
        </div>
        <div className="flex flex-1 items-center justify-end pr-5" style={{ background: "#8A6D1E", opacity: dx < -4 ? 1 : 0 }}>
          <span className="inline-flex items-center gap-1.5 text-[13.5px] font-bold text-white">Snooze <AlarmClockIcon className="size-[17px]" strokeWidth={2.4} /></span>
        </div>
      </div>

      <div
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        className="relative flex items-center gap-2.5"
        style={{
          padding: `13px ${PAD - 3}px`,
          cursor: "pointer",
          background: SURFACE,
          transform: `translateX(${dx}px)`,
          transition: dragging ? "none" : "transform .22s ease",
          touchAction: "pan-y",
        }}
      >
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onDone() }}
          aria-label="Mark done"
          className="-mx-0.5 flex shrink-0 p-2"
        >
          <span className="flex size-6 items-center justify-center rounded-full border-2" style={{ borderColor: TEAL }}>
            <CheckIcon className="size-3 opacity-0" strokeWidth={3} />
          </span>
        </button>

        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-semibold leading-snug tracking-[-0.2px] text-pretty" style={{ color: INK }}>{t.title}</div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className="rounded-full px-2 py-0.5 text-[10.5px] font-bold" style={{ background: TIER[tier].soft, color: TIER[tier].dot }}>{TIER[tier].label}</span>
            {t.isOverdue && <span className="size-[5px] shrink-0 rounded-full" style={{ background: CLAY }} />}
            <span className="text-[12.5px]" style={{ color: SUB }}>{itemMeta(t)}</span>
          </div>
        </div>

        {t.estimatedMinutes != null && (
          <span className="shrink-0 text-[12.5px] font-semibold" style={{ color: FAINT }}>{t.estimatedMinutes}m</span>
        )}
        {expanded
          ? <ChevronUpIcon className="size-[18px] shrink-0" style={{ color: FAINT }} />
          : <ChevronDownIcon className="size-[18px] shrink-0" style={{ color: FAINT }} />}
      </div>

      {expanded && (
        <ExpandedDetail
          homeId={homeId}
          taskInstanceId={t.taskInstanceId}
          expanded={expanded}
          onDone={onDone}
          onSnooze={onSnooze}
          onOpenGuide={onOpenGuide}
        />
      )}
    </div>
  )
}

function itemMeta(t: WeekAgendaItem): string {
  const where = t.itemName ?? t.roomName ?? "Home"
  return `${where} · ${whenLabel(t)}`
}

// ── Segmented controls ────────────────────────────────────────────────────────
function Calendar({
  tasks, sel, setSel,
}: {
  tasks: WeekAgendaItem[]
  sel: number | null
  setSel: (n: number | null) => void
}) {
  const cal = useMemo(() => monthCalendar(tasks), [tasks])
  return (
    <div style={{ padding: `14px ${PAD}px 0` }}>
      <div className="rounded-2xl p-4 shadow-[0_1px_2px_rgba(15,23,42,0.05)]" style={{ background: SURFACE }}>
        <div className="mb-2.5 text-[15px] font-extrabold" style={{ color: INK }}>{cal.monthLabel}</div>
        <div className="grid grid-cols-7 gap-[3px]">
          {["S", "M", "T", "W", "T", "F", "S"].map((w, i) => (
            <div key={i} className="py-0.5 text-center text-[10px] font-bold" style={{ color: FAINT }}>{w}</div>
          ))}
          {cal.cells.map((c, i) => {
            if (!c) return <div key={i} />
            const isToday = c.day === cal.todayDate
            const on = sel === c.day
            const dots = [...new Set(c.tiers)].slice(0, 3)
            return (
              <button
                key={i}
                type="button"
                onClick={() => setSel(on ? null : c.day)}
                className="flex aspect-square flex-col items-center justify-center gap-0.5 rounded-[9px] font-mono text-[13.5px]"
                style={{
                  background: on ? TEAL : isToday ? "var(--hh-teal-wash)" : "transparent",
                  color: on ? "#fff" : INK,
                  fontWeight: isToday || on ? 800 : 500,
                }}
              >
                {c.day}
                <div className="flex h-1 gap-0.5">
                  {dots.map((tr, k) => <span key={k} className="size-1 rounded-full" style={{ background: on ? "#fff" : TIER[tr].dot }} />)}
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Group header ──────────────────────────────────────────────────────────────
function GroupHeader({ label, tone, count, mins }: { label: string; tone: string; count: number; mins: number }) {
  return (
    <div className="mb-2 flex items-center gap-1.5 pl-0.5">
      <span className="size-2 rounded-full" style={{ background: tone }} />
      <span className="text-[15px] font-extrabold tracking-[-0.2px]" style={{ color: INK }}>{label}</span>
      <span className="text-[13.5px] font-bold" style={{ color: tone === CLAY ? CLAY : FAINT }}>{count}</span>
      <div className="flex-1" />
      {mins > 0 && <span className="text-[12.5px] font-semibold" style={{ color: FAINT }}>{mins} min</span>}
    </div>
  )
}

// ── Screen ────────────────────────────────────────────────────────────────────
export function RefinedWeek({ homeId }: { homeId: string | null; density?: "spacious" | "cozy" | "compact" }) {
  const navigate = useNavigate()
  const [view, setView] = useState<View>("list")
  const [lens, setLens] = useState<Lens>("urgency")
  const [tier, setTier] = useTierFilter()
  // Item filtering is now the "Item" lens; kept as a constant so the shared
  // tier helpers keep their signature.
  const item = "all"
  const [openId, setOpenId] = useState<string | null>(null)
  const [selDay, setSelDay] = useState<number | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [items, setItems] = useState<WeekAgendaItem[]>([])
  const [loading, setLoading] = useState(true)
  const [pendingId, setPendingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!homeId) return
    const res = await getWeekAgenda(homeId, { days: HORIZON_DAYS })
    setItems(res.data ?? [])
    setLoading(false)
  }, [homeId])

  useEffect(() => { void load() }, [load])

  const onDone = useCallback(async (id: string) => {
    if (!homeId) return
    setPendingId(id)
    const res = await markTaskInstanceDone(homeId, id)
    setPendingId(null)
    setOpenId(null)
    if (res.success) setItems((xs) => xs.filter((x) => x.taskInstanceId !== id))
  }, [homeId])

  const onSnooze = useCallback(async (id: string) => {
    if (!homeId) return
    setPendingId(id)
    const res = await snoozeTaskInstance(homeId, id, addDays(todayStr(), 7))
    setPendingId(null)
    setOpenId(null)
    if (res.success) setItems((xs) => xs.filter((x) => x.taskInstanceId !== id))
  }, [homeId])

  const all = useMemo(() => applyTierFilter(items, tier, item), [items, tier, item])
  const groups = useMemo(() => groupTasks(all, lens), [all, lens])
  const insight = useMemo(() => computeInsight(all), [all])
  const tierCounts = useMemo(() => tierFilterCounts(items, item), [items, item])
  const activeTier = TIER_FILTERS.find((t) => t.value === tier) ?? TIER_FILTERS[0]
  const [tierOpen, setTierOpen] = useState(false)
  const tierRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!tierOpen) return
    // A menu you can only close by choosing is a trap on touch.
    const onDown = (e: PointerEvent) => {
      if (!tierRef.current?.contains(e.target as Node)) setTierOpen(false)
    }
    document.addEventListener("pointerdown", onDown)
    return () => document.removeEventListener("pointerdown", onDown)
  }, [tierOpen])
  // Total ignoring the tier filter (for the "All · N" chip + the empty-focus link).
  const totalAll = useMemo(() => applyTierFilter(items, "all", item).length, [items, item])

  const total = all.length
  const totalMins = all.reduce((a, t) => a + (t.estimatedMinutes ?? 0), 0)
  const dayTasks = selDay == null ? [] : tasksDueOnDay(all, selDay)

  const toggle = (id: string) => setOpenId((cur) => (cur === id ? null : id))
  const openGuide = (t: WeekAgendaItem) => navigate(`/tasks/${t.taskInstanceId}`)

  const renderRow = (t: WeekAgendaItem) => (
    <TaskRow
      key={t.taskInstanceId}
      homeId={homeId}
      t={t}
      expanded={openId === t.taskInstanceId && pendingId !== t.taskInstanceId}
      onToggle={() => toggle(t.taskInstanceId)}
      onDone={() => onDone(t.taskInstanceId)}
      onSnooze={() => onSnooze(t.taskInstanceId)}
      onOpenGuide={() => openGuide(t)}
    />
  )

  return (
    <div className="flex min-h-full flex-col" style={{ background: BG }}>
      {/* Header */}
      <div className="pt-2" style={{ paddingInline: PAD }}>
        <h1 className="text-[28px] font-extrabold tracking-[-0.6px]" style={{ color: INK }}>Tasks</h1>
        <div className="mt-1.5 text-[13.5px]" style={{ color: SUB }}>
          {/* When a filter is on, the headline must say so — "2 to do" while
              hiding nine more read as the whole truth and wasn't. */}
          {loading ? "Loading…" : total === 0 ? "Nothing due — enjoy the calm."
            : tier === "all" ? `${total} to do · ~${Math.round(totalMins / 5) * 5} min total`
            : `${total} of ${totalAll} · ~${Math.round(totalMins / 5) * 5} min`}
        </div>
      </div>

      {/* "Start here" insight banner — dismissible */}
      {!loading && !dismissed && insight && total > 0 && (
        <div style={{ padding: `${17}px ${PAD}px 0` }}>
          <div
            className="relative flex items-center gap-3 overflow-hidden rounded-2xl p-4"
            style={{ background: SURFACE, border: `1.5px solid ${insight.tone}33`, boxShadow: `0 2px 14px ${insight.tone}1f` }}
          >
            <span className="absolute inset-y-0 left-0 w-1" style={{ background: insight.tone }} />
            <span className="ml-1 flex size-[38px] shrink-0 items-center justify-center rounded-[11px]" style={{ background: insight.tone }}>
              {insight.kind === "start"
                ? <FlagIcon className="size-[19px] text-white" strokeWidth={2.4} />
                : <SparklesIcon className="size-[19px] text-white" strokeWidth={2.4} />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="mb-0.5 block text-[10.5px] font-extrabold uppercase tracking-[0.6px]" style={{ color: insight.tone }}>{insight.label}</span>
              <span className="block text-[14.5px] font-semibold leading-snug" style={{ color: INK }}>{insight.text}</span>
            </span>
            <button type="button" onClick={() => setDismissed(true)} aria-label="Dismiss" className="-m-1 flex shrink-0 rounded-lg p-2">
              <XIcon className="size-[17px]" style={{ color: FAINT }} />
            </button>
          </div>
        </div>
      )}

      {/* ONE control line.
          Was three stacked strips — a List/Calendar segment, a scrolling chip
          row, and a "Group by" segment — roughly 190px, a quarter of the phone,
          before a single task appeared.
          Two of them turned out to be removable rather than shrinkable:
            · the item filter, because grouping BY item is the same operation;
            · the List/Calendar toggle, because "as a calendar" is just a fourth
              way to look at the same list, so it joins the lens tabs.
          What's left is one lens and one priority menu, side by side. */}
      <div
        className="sticky top-0 z-20"
        style={{ background: BG, boxShadow: "0 8px 14px -10px rgba(15,23,42,0.18)" }}
      >
        <div
          className="flex items-center gap-1"
          style={{ padding: `14px ${PAD}px 0`, borderBottom: "1px solid var(--hh-line)" }}
        >
          {/* Tabs scroll rather than squeeze: four labels plus the priority pill
              overflow a 390px screen, and a control half off the edge is worse
              than one you scroll to. The pill stays pinned. */}
          {/* touch-action pan-y: the four tabs fit on every supported width, so
              this strip kept its overflow scroller only as insurance for huge
              font settings — but as a plain scroller it grabbed horizontal
              wobble mid-scroll and slid the headers around under the finger,
              which a tester read (fairly) as the headers being broken. Vertical
              pans now pass through to the page; genuine overflow still scrolls. */}
          <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto no-scrollbar" style={{ touchAction: "pan-y" }}>
          {([["urgency", "Urgency"], ["room", "Room"], ["item", "Item"], ["calendar", "Calendar"]] as const).map(
            ([k, label]) => {
              const on = k === "calendar" ? view === "calendar" : view === "list" && lens === k
              return (
                <button
                  key={k}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    if (k === "calendar") { setView("calendar"); return }
                    setView("list"); setLens(k as Lens)
                  }}
                  className="relative shrink-0 rounded-t-lg px-2.5 pb-2 pt-1 text-[13.5px] font-bold"
                  style={{ color: on ? INK : SUB }}
                >
                  {label}
                  {on && (
                    <span
                      className="absolute inset-x-2.5 rounded-full"
                      style={{ bottom: -1, height: 2.5, background: TEAL }}
                    />
                  )}
                </button>
              )
            },
          )}
          </div>

          <div className="relative shrink-0 pb-1.5" ref={tierRef}>
            <button
              type="button"
              aria-haspopup="listbox"
              aria-expanded={tierOpen}
              onClick={() => setTierOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-[12.5px] font-bold"
              style={{ border: "1.5px solid var(--hh-line2)", background: SURFACE, color: INK }}
            >
              {activeTier.dot && <span className="size-[7px] shrink-0 rounded-full" style={{ background: activeTier.dot }} />}
              {activeTier.short}
              <ChevronDownIcon className="size-3.5" style={{ color: SUB }} />
            </button>

            {tierOpen && (
              <div
                role="listbox"
                className="absolute right-0 z-30 mt-1.5 w-[218px] overflow-hidden rounded-2xl"
                style={{ background: SURFACE, border: "1px solid var(--hh-line2)", boxShadow: "0 12px 28px rgba(15,23,42,0.16)" }}
              >
                {TIER_FILTERS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    role="option"
                    aria-selected={tier === o.value}
                    onClick={() => { setTier(o.value); setTierOpen(false) }}
                    className="flex w-full items-center gap-2 px-3.5 py-3 text-left"
                    style={{ borderBottom: "1px solid var(--hh-line)" }}
                  >
                    {o.dot
                      ? <span className="size-[7px] shrink-0 rounded-full" style={{ background: o.dot }} />
                      : <span className="size-[7px] shrink-0" />}
                    <span className="flex-1 text-[13.5px] font-bold" style={{ color: INK }}>{o.label}</span>
                    {/* The count is the point: it says what you'd get, before you pick. */}
                    <span className="font-mono text-[11px]" style={{ color: SUB }}>{tierCounts[o.value]}</span>
                    {tier === o.value && <CheckIcon className="size-4" style={{ color: TEAL }} />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 pb-4">
        {loading ? (
          <div className="py-10 text-center text-[14px]" style={{ color: SUB }}>Loading…</div>
        ) : view === "list" ? (
          <div style={{ padding: `17px ${PAD}px 0` }}>
            {groups.length === 0 && (
              tier === "focus" && totalAll > 0 ? (
                // Calm empty-focus state — never a blank page; one tap reveals the rest.
                <div className="py-10 text-center">
                  <div className="text-[15px] font-semibold" style={{ color: INK }}>You're all caught up on the essentials.</div>
                  <button
                    type="button"
                    onClick={() => setTier("all")}
                    className="mt-2 text-[13.5px] font-bold"
                    style={{ color: TEAL }}
                  >
                    Show {totalAll} {totalAll === 1 ? "other task" : "other tasks"} →
                  </button>
                </div>
              ) : (
                <div className="py-10 text-center text-[15px]" style={{ color: SUB }}>Nothing matches these filters.</div>
              )
            )}
            {groups.map((g) => (
              <div key={g.key} className="mb-4">
                <GroupHeader label={g.label} tone={g.tone} count={g.items.length} mins={g.mins} />
                <div className="overflow-hidden rounded-2xl shadow-[0_1px_2px_rgba(15,23,42,0.05)]" style={{ background: SURFACE }}>
                  {g.items.map(renderRow)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <>
            <Calendar tasks={all} sel={selDay} setSel={setSelDay} />
            <div style={{ padding: `17px ${PAD}px 0` }}>
              <div className="mb-2 pl-0.5 text-[12px] font-bold uppercase tracking-[0.6px]" style={{ color: SUB }}>
                {selDay ? dayLabel(selDay) : "Pick a day"}
              </div>
              {selDay == null && <div className="px-0.5 py-1.5 text-[13.5px]" style={{ color: FAINT }}>Tap a date to see what's due — dots show priority.</div>}
              {selDay != null && dayTasks.length === 0 && <div className="px-0.5 py-1.5 text-[13.5px]" style={{ color: FAINT }}>Nothing due {dayLabel(selDay)} — enjoy the calm.</div>}
              {dayTasks.length > 0 && (
                <div className="overflow-hidden rounded-2xl shadow-[0_1px_2px_rgba(15,23,42,0.05)]" style={{ background: SURFACE }}>
                  {dayTasks.map(renderRow)}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
