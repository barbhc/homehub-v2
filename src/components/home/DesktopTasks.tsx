import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  CheckIcon, ChevronDownIcon, ChevronUpIcon, FlagIcon, SparklesIcon, XIcon,
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

const INK = "var(--hh-ink)", SUB = "var(--hh-sub)", FAINT = "var(--hh-faint)"
const LINE = "var(--hh-line2)", SURFACE = "var(--hh-surface)"

const HORIZON_DAYS = 31

// ── Expanded two-column detail (why · notes left · actions right) ─────────────
function DkDetail({
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
    <div className="grid items-start gap-7" style={{ gridTemplateColumns: "1.5fr 1fr", padding: "4px 20px 20px 56px" }}>
      <div className="flex flex-col gap-3.5">
        {loading ? (
          <div className="text-[13.5px]" style={{ color: FAINT }}>Loading…</div>
        ) : (
          <>
            {detail?.justification && <InfoBlurb text={detail.justification} />}
            {detail?.notes && <StepList steps={parseSteps(detail.notes)} />}
            {!detail?.justification && !detail?.notes && (
              <div className="text-[13.5px]" style={{ color: FAINT }}>No extra details yet.</div>
            )}
          </>
        )}
      </div>
      <div className="flex flex-col gap-3.5">
        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={onDone}
            className="flex flex-1 items-center justify-center gap-2 rounded-[11px] py-2.5 text-[13.5px] font-bold text-white"
            style={{ background: TEAL }}
          >
            <CheckIcon className="size-4" strokeWidth={2.6} /> Mark done
          </button>
          <button
            type="button"
            onClick={onSnooze}
            className="rounded-[11px] px-4 py-2.5 text-[13.5px] font-bold"
            style={{ border: `1.5px solid ${LINE}`, background: SURFACE, color: INK }}
          >
            Snooze
          </button>
        </div>
        <button
          type="button"
          onClick={onOpenGuide}
          className="self-start text-[13px] font-semibold underline-offset-2 hover:underline"
          style={{ color: TEAL }}
        >
          View full guide
        </button>
      </div>
    </div>
  )
}

// ── Expandable desktop row ────────────────────────────────────────────────────
function DkRow({
  homeId, t, expanded, last, onToggle, onDone, onSnooze, onOpenGuide,
}: {
  homeId: string | null
  t: WeekAgendaItem
  expanded: boolean
  last: boolean
  onToggle: () => void
  onDone: () => void
  onSnooze: () => void
  onOpenGuide: () => void
}) {
  const tier = (t.priorityTier as Tier) ?? "optional"
  const where = t.itemName ?? t.roomName ?? "Home"
  return (
    <div style={{ borderTop: last ? "none" : `1px solid ${LINE}` }}>
      <div onClick={onToggle} className="flex cursor-pointer items-center gap-4 px-5 py-[15px]">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDone() }}
          aria-label="Mark done"
          className="-m-1.5 flex shrink-0 p-1.5"
        >
          <span className="flex size-[22px] items-center justify-center rounded-full border-2" style={{ borderColor: TEAL }}>
            <CheckIcon className="size-3 opacity-0" strokeWidth={3} />
          </span>
        </button>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-semibold leading-snug tracking-[-0.2px]" style={{ color: INK }}>{t.title}</div>
          <div className="mt-1 flex items-center gap-2">
            <span className="rounded-full px-2.5 py-0.5 text-[11px] font-bold" style={{ background: TIER[tier].soft, color: TIER[tier].dot }}>{TIER[tier].label}</span>
            {t.isOverdue && <span className="size-[5px] rounded-full" style={{ background: CLAY }} />}
            <span className="text-[13px]" style={{ color: SUB }}>{where}</span>
          </div>
        </div>
        <span className="w-[88px] text-right text-[13px] font-semibold" style={{ color: t.isOverdue ? CLAY : SUB }}>{whenLabel(t)}</span>
        <span className="w-12 text-right text-[13px] font-semibold" style={{ color: FAINT }}>{t.estimatedMinutes != null ? `${t.estimatedMinutes} min` : ""}</span>
        {expanded
          ? <ChevronUpIcon className="size-[18px] shrink-0" style={{ color: FAINT }} />
          : <ChevronDownIcon className="size-[18px] shrink-0" style={{ color: FAINT }} />}
      </div>
      {expanded && (
        <DkDetail
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

// ── Month calendar (desktop aside) ────────────────────────────────────────────
function DkCalendar({
  tasks, sel, setSel,
}: {
  tasks: WeekAgendaItem[]
  sel: number | null
  setSel: (n: number | null) => void
}) {
  const cal = useMemo(() => monthCalendar(tasks), [tasks])
  return (
    <div>
      <div className="mb-3 text-[15px] font-extrabold" style={{ color: INK }}>{cal.monthLabel}</div>
      <div className="grid grid-cols-7 gap-1">
        {["S", "M", "T", "W", "T", "F", "S"].map((w, i) => (
          <div key={i} className="py-0.5 text-center text-[10.5px] font-bold" style={{ color: FAINT }}>{w}</div>
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
              className="flex aspect-square flex-col items-center justify-center gap-0.5 rounded-[9px] font-mono text-[12.5px]"
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
  )
}

// ── Tier pill ─────────────────────────────────────────────────────────────────
function TierPill({ active, color, onClick, children, dot, count }: {
  active: boolean; color: string; onClick: () => void; children: React.ReactNode; dot?: boolean
  /** What this filter would yield. Shown always, computed over the unfiltered
   *  set, so picking one doesn't zero out the others and strand you. */
  count?: number
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-bold"
      style={{ border: `1.5px solid ${active ? "transparent" : LINE}`, background: active ? color : SURFACE, color: active ? "#fff" : INK }}
    >
      {dot && <span className="size-1.5 rounded-full" style={{ background: active ? "#fff" : color }} />}
      {children}
      {count != null && (
        <span className="font-mono text-[11px]" style={{ opacity: active ? 0.75 : 0.55 }}>{count}</span>
      )}
    </button>
  )
}

export function DesktopTasks({ homeId }: { homeId: string | null }) {
  const navigate = useNavigate()
  const [tier, setTier] = useTierFilter()
  // Item filtering is the "Item" lens now; kept as a constant so the shared
  // tier helpers keep their signature.
  const item = "all"
  const [lens, setLens] = useState<Lens>("urgency")
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
  // Total ignoring the tier filter (for the "All · N" chip + empty-focus link).
  const totalAll = useMemo(() => applyTierFilter(items, "all", item).length, [items, item])

  const total = all.length
  const totalMins = all.reduce((a, t) => a + (t.estimatedMinutes ?? 0), 0)
  const dayTasks = selDay == null ? null : tasksDueOnDay(all, selDay)

  const toggle = (id: string) => setOpenId((cur) => (cur === id ? null : id))
  const openGuide = (t: WeekAgendaItem) => navigate(`/tasks/${t.taskInstanceId}`)

  const tierCounts = useMemo(() => tierFilterCounts(items, item), [items, item])

  return (
    <div style={{ maxWidth: 1140, margin: "0 auto", padding: "30px 0 48px" }}>
      {/* Header */}
      <div className="mb-[22px] flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[30px] font-extrabold leading-tight tracking-[-0.7px]" style={{ color: INK }}>This week</h1>
          <div className="mt-1.5 text-[14px]" style={{ color: SUB }}>
            {loading ? "Loading…" : total === 0 ? "Nothing due — enjoy the calm." : `${total} thing${total === 1 ? "" : "s"} across your home · about ${Math.round(totalMins / 5) * 5} min total`}
          </div>
        </div>
        <button
          type="button"
          onClick={() => navigate("/chat")}
          className="inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-[14px] font-bold"
          style={{ border: `1.5px solid ${LINE}`, background: SURFACE, color: INK }}
        >
          <SparklesIcon className="size-[17px]" style={{ color: TEAL }} /> Ask Homehub
        </button>
      </div>

      {/* "Start here" insight banner — dismissible */}
      {!loading && !dismissed && insight && total > 0 && (
        <div
          className="relative mb-6 flex items-center gap-3.5 overflow-hidden rounded-2xl px-[18px] py-4"
          style={{ background: SURFACE, border: `1.5px solid ${insight.tone}33`, boxShadow: `0 2px 16px ${insight.tone}1f` }}
        >
          <span className="absolute inset-y-0 left-0 w-1" style={{ background: insight.tone }} />
          <span className="ml-1 flex size-10 shrink-0 items-center justify-center rounded-xl" style={{ background: insight.tone }}>
            {insight.kind === "start"
              ? <FlagIcon className="size-5 text-white" strokeWidth={2.4} />
              : <SparklesIcon className="size-5 text-white" strokeWidth={2.4} />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="mb-0.5 text-[10.5px] font-extrabold uppercase tracking-[0.6px]" style={{ color: insight.tone }}>{insight.label}</div>
            <div className="text-[14.5px] font-semibold" style={{ color: INK }}>{insight.text}</div>
          </div>
          <button type="button" onClick={() => setDismissed(true)} aria-label="Dismiss" className="flex shrink-0 p-2">
            <XIcon className="size-[18px]" style={{ color: FAINT }} />
          </button>
        </div>
      )}

      {/* Same model as mobile: lens on the left, priority on the right, and the
          same words. Desktop has the width to leave priority as visible chips
          rather than a menu, so it does — but "Needs you", the counts, and the
          lens tabs are shared, because a filter that means one thing on a phone
          and another on a laptop is two filters. */}
      <div className="mb-[22px] flex flex-wrap items-center gap-x-3.5 gap-y-3" style={{ borderBottom: `1px solid ${LINE}` }}>
        <div className="flex items-center gap-1">
          {(["urgency", "room", "item"] as Lens[]).map((k) => {
            const on = lens === k
            return (
              <button
                key={k}
                type="button"
                aria-pressed={on}
                onClick={() => setLens(k)}
                className="relative rounded-t-lg px-3 pb-2.5 pt-1 text-[14px] font-bold capitalize"
                style={{ color: on ? INK : SUB }}
              >
                {k}
                {on && <span className="absolute inset-x-3 rounded-full" style={{ bottom: -1, height: 2.5, background: TEAL }} />}
              </button>
            )
          })}
        </div>

        <div className="ml-auto flex flex-wrap gap-2 pb-2">
          {TIER_FILTERS.map((o) => (
            <TierPill
              key={o.value}
              active={tier === o.value}
              color={o.dot ?? TEAL}
              dot={!!o.dot}
              onClick={() => setTier(o.value)}
              count={tierCounts[o.value]}
            >
              {o.label}
            </TierPill>
          ))}
        </div>
      </div>

      <div className="grid items-start gap-7" style={{ gridTemplateColumns: "minmax(0,1fr) 340px" }}>
        <div className="flex flex-col gap-[26px]">
          {loading ? (
            <div className="py-16 text-center text-[15px]" style={{ color: SUB }}>Loading…</div>
          ) : groups.length === 0 ? (
            tier === "focus" && totalAll > 0 ? (
              <div className="py-16 text-center">
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
              <div className="py-16 text-center text-[15px]" style={{ color: SUB }}>Nothing matches these filters.</div>
            )
          ) : (
            groups.map((g) => (
              <div key={g.key}>
                <div className="mb-3 flex items-center gap-2.5 pl-0.5">
                  <span className="size-[9px] rounded-full" style={{ background: g.tone }} />
                  <span className="text-[16px] font-extrabold tracking-[-0.3px]" style={{ color: INK }}>{g.label}</span>
                  <span className="text-[13.5px] font-bold" style={{ color: g.tone === CLAY ? CLAY : FAINT }}>{g.items.length}</span>
                  <div className="flex-1" />
                  {g.mins > 0 && <span className="text-[13px] font-semibold" style={{ color: FAINT }}>{g.mins} min</span>}
                </div>
                <div className="overflow-hidden rounded-2xl shadow-[0_1px_2px_rgba(15,23,42,0.05)]" style={{ background: SURFACE, border: `1px solid ${LINE}` }}>
                  {g.items.map((t, i) => (
                    <DkRow
                      key={t.taskInstanceId}
                      homeId={homeId}
                      t={t}
                      expanded={openId === t.taskInstanceId && pendingId !== t.taskInstanceId}
                      last={i === g.items.length - 1}
                      onToggle={() => toggle(t.taskInstanceId)}
                      onDone={() => onDone(t.taskInstanceId)}
                      onSnooze={() => onSnooze(t.taskInstanceId)}
                      onOpenGuide={() => openGuide(t)}
                    />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Aside: calendar + what's-due-this-date */}
        <div className="sticky top-6 flex flex-col gap-[18px]">
          <div className="rounded-2xl p-5 shadow-[0_1px_2px_rgba(15,23,42,0.05)]" style={{ background: SURFACE, border: `1px solid ${LINE}` }}>
            <DkCalendar tasks={all} sel={selDay} setSel={setSelDay} />
          </div>
          <div className="rounded-2xl p-[18px] shadow-[0_1px_2px_rgba(15,23,42,0.05)]" style={{ background: SURFACE, border: `1px solid ${LINE}` }}>
            <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.5px]" style={{ color: SUB }}>
              {selDay ? `Due ${dayLabel(selDay)}` : "Pick a date"}
            </div>
            {selDay == null && <div className="text-[13px] leading-relaxed" style={{ color: FAINT }}>Tap a date on the calendar to see exactly what's due — dots show task priority.</div>}
            {dayTasks && dayTasks.length === 0 && <div className="text-[13px]" style={{ color: FAINT }}>Nothing due {dayLabel(selDay!)}.</div>}
            {dayTasks?.map((t, i) => {
              const tr = (t.priorityTier as Tier) ?? "optional"
              return (
                <button
                  key={t.taskInstanceId}
                  type="button"
                  onClick={() => openGuide(t)}
                  className="flex w-full items-center gap-2.5 py-2.5 text-left"
                  style={{ borderTop: i ? `1px solid ${LINE}` : "none" }}
                >
                  <span className="size-[7px] shrink-0 rounded-full" style={{ background: TIER[tr].dot }} />
                  <span className="flex-1 truncate text-[13px] font-semibold" style={{ color: INK }}>{t.title}</span>
                  {t.estimatedMinutes != null && <span className="text-[12px]" style={{ color: FAINT }}>{t.estimatedMinutes}m</span>}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
