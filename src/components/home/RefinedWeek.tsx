import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  AlarmClockIcon, CalendarDaysIcon, CheckIcon, ChevronDownIcon, ChevronUpIcon, FlagIcon,
  ListIcon, PackageIcon, SparklesIcon, XIcon,
} from "lucide-react"
import { getWeekAgenda, markTaskInstanceDone, snoozeTaskInstance, type WeekAgendaItem } from "@/modules/care"
import { TIER, type Tier } from "@/lib/redesign/tokens"
import { parseSteps } from "@/pages/item-detail/utils"
import { InfoBlurb, StepList } from "@/components/tasks/TaskHowTo"
import {
  addDays, applyFilters, computeInsight, dayLabel, groupTasks, itemOptions, monthCalendar,
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
  const up = () => {
    const g = drag.current
    drag.current = null
    setDragging(false)
    if (!g) return
    if (!g.moved) { setDx(0); onToggle(); return }
    if (g.dx > TH) { setDx(0); onDone() }
    else if (g.dx < -TH) { setDx(0); onSnooze() }
    else setDx(0)
  }

  return (
    <div className="relative overflow-hidden" style={{ borderTop: `0.5px solid ${LINE}` }}>
      {/* swipe reveals: right → Done (teal), left → Snooze (amber) */}
      <div className="absolute inset-0 flex">
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
function Segmented<T extends string>({
  value, onChange, options,
}: {
  value: T
  onChange: (v: T) => void
  options: [T, string, React.ReactNode?][]
}) {
  return (
    <div className="flex gap-0.5 rounded-[11px] p-[3px]" style={{ background: "#E7EAE9" }}>
      {options.map(([k, l, icon]) => {
        const on = value === k
        return (
          <button
            key={k}
            type="button"
            onClick={() => onChange(k)}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-[9px] py-2.5 text-[13.5px]"
            style={on
              ? { background: SURFACE, color: INK, fontWeight: 700, boxShadow: "0 1px 3px rgba(0,0,0,0.12)" }
              : { background: "transparent", color: SUB, fontWeight: 600 }}
          >
            {icon}{l}
          </button>
        )
      })}
    </div>
  )
}

// ── Filters: tier chips + item sheet ──────────────────────────────────────────
function Filters({
  tier, setTier, item, setItem, items,
}: {
  tier: string
  setTier: (t: string) => void
  item: string
  setItem: (i: string) => void
  items: string[]
}) {
  const [sheet, setSheet] = useState(false)
  const tiers: [string, string][] = [["all", "All"], ["essential", "Essential"], ["recommended", "Recommended"], ["optional", "Optional"]]
  return (
    <>
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar" style={{ padding: `0 ${PAD}px` }}>
        {tiers.map(([k, l]) => {
          const on = tier === k
          const c = k === "all" ? TEAL : TIER[k as Tier].dot
          return (
            <button
              key={k}
              type="button"
              onClick={() => setTier(k)}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-[13.5px] font-bold"
              style={{ border: `1.5px solid ${on ? "transparent" : "var(--hh-line2)"}`, background: on ? c : SURFACE, color: on ? "#fff" : INK }}
            >
              {k !== "all" && <span className="size-1.5 rounded-full" style={{ background: on ? "#fff" : TIER[k as Tier].dot }} />}
              {l}
            </button>
          )
        })}
        <button
          type="button"
          onClick={() => setSheet(true)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-[13.5px] font-bold"
          style={{ border: `1.5px solid ${item !== "all" ? "transparent" : "var(--hh-line2)"}`, background: item !== "all" ? INK : SURFACE, color: item !== "all" ? "#fff" : INK }}
        >
          <PackageIcon className="size-[13px]" /> {item === "all" ? "Item" : item}<ChevronDownIcon className="size-[13px]" />
        </button>
      </div>

      {sheet && (
        <>
          <div onClick={() => setSheet(false)} className="fixed inset-0 z-40" style={{ background: "rgba(8,12,11,0.4)" }} />
          <div
            className="fixed inset-x-0 bottom-0 z-50 mx-auto max-h-[70%] w-full max-w-[460px] overflow-y-auto rounded-t-[20px]"
            style={{ background: SURFACE, padding: `16px ${PAD}px calc(18px + env(safe-area-inset-bottom))`, boxShadow: "0 -8px 30px rgba(0,0,0,0.18)" }}
          >
            <div className="mx-auto mb-3.5 h-1 w-9 rounded-full" style={{ background: "var(--hh-line2)" }} />
            <div className="mb-3 text-[16px] font-extrabold" style={{ color: INK }}>Filter by item</div>
            <button
              type="button"
              onClick={() => { setItem("all"); setSheet(false) }}
              className="flex w-full items-center gap-2.5 px-1.5 py-3 text-left"
              style={{ borderBottom: `0.5px solid ${LINE}` }}
            >
              <span className="flex-1 text-[15px] font-semibold" style={{ color: INK }}>All items</span>
              {item === "all" && <CheckIcon className="size-[18px]" style={{ color: TEAL }} />}
            </button>
            {items.map((it) => (
              <button
                key={it}
                type="button"
                onClick={() => { setItem(it); setSheet(false) }}
                className="flex w-full items-center gap-2.5 px-1.5 py-3 text-left"
                style={{ borderBottom: `0.5px solid ${LINE}` }}
              >
                <span className="flex-1 text-[15px] font-semibold" style={{ color: INK }}>{it}</span>
                {item === it && <CheckIcon className="size-[18px]" style={{ color: TEAL }} />}
              </button>
            ))}
          </div>
        </>
      )}
    </>
  )
}

// ── Month calendar ────────────────────────────────────────────────────────────
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
  const [tier, setTier] = useState("all")
  const [item, setItem] = useState("all")
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

  const all = useMemo(() => applyFilters(items, tier, item), [items, tier, item])
  const groups = useMemo(() => groupTasks(all, lens), [all, lens])
  const insight = useMemo(() => computeInsight(all), [all])
  const itemList = useMemo(() => itemOptions(items), [items])

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
          {loading ? "Loading…" : total === 0 ? "Nothing due — enjoy the calm." : `${total} to do · ~${Math.round(totalMins / 5) * 5} min total`}
        </div>
      </div>

      {/* "Start here" insight banner — dismissible */}
      {!loading && !dismissed && total > 0 && (
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

      {/* Sticky controls: toggle + filters + group-by */}
      <div
        className="sticky top-0 z-20"
        style={{ background: BG, paddingBottom: 14, boxShadow: "0 8px 14px -10px rgba(15,23,42,0.18)" }}
      >
        <div style={{ padding: `16px ${PAD}px 0` }}>
          <Segmented<View>
            value={view}
            onChange={setView}
            options={[
              ["list", "List", <ListIcon key="l" className="size-[15px]" />],
              ["calendar", "Calendar", <CalendarDaysIcon key="c" className="size-[15px]" />],
            ]}
          />
        </div>
        <div className="h-3.5" />
        <Filters tier={tier} setTier={setTier} item={item} setItem={setItem} items={itemList} />
        {view === "list" && (
          <div className="flex items-center gap-2" style={{ padding: `14px ${PAD}px 0` }}>
            <span className="shrink-0 text-[13.5px] font-semibold" style={{ color: SUB }}>Group by</span>
            <div className="flex-1">
              <Segmented<Lens>
                value={lens}
                onChange={setLens}
                options={[["urgency", "Urgency"], ["room", "Room"], ["item", "Item"]]}
              />
            </div>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 pb-4">
        {loading ? (
          <div className="py-10 text-center text-[14px]" style={{ color: SUB }}>Loading…</div>
        ) : view === "list" ? (
          <div style={{ padding: `17px ${PAD}px 0` }}>
            {groups.length === 0 && (
              <div className="py-10 text-center text-[15px]" style={{ color: SUB }}>Nothing matches these filters.</div>
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
