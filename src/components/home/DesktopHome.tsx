import { Link } from "react-router-dom"
import {
  SparklesIcon, CheckIcon, ChevronRightIcon, ChevronDownIcon, ChevronUpIcon, ArrowRightIcon,
  PackageIcon, ShieldCheckIcon, InfoIcon, ClockIcon, RepeatIcon, CalendarIcon,
  AlarmClockIcon, MegaphoneIcon, ReceiptIcon, SprayCanIcon, LeafIcon,
  HouseIcon, WindIcon, WrenchIcon,
} from "lucide-react"
import type { DashboardTask, ExpiringWarrantyItem, HomeNotices } from "@/lib/dashboard"
import type { DeepCleanGuide } from "@/lib/cleanSession"
import type { HomeUpkeepItem } from "@/modules/care"
import type { UserLevel } from "@/hooks/useUserLevel"
import { TIER, dueLabel, greeting, effortMins, priorityTier, type Tier } from "@/lib/redesign/tokens"
import { useTaskExpandDetail, recurLabel, isRecurring, cadenceLabel } from "@/components/home/useTaskExpandDetail"
import { HowToSteps } from "@/components/tasks/HowToSteps"

const INK = "var(--hh-ink)", SUB = "var(--hh-sub)", TEAL = "var(--hh-teal)", CLAY = "var(--hh-clay)", FAINT = "var(--hh-faint)"
const GOLD = "#9A7B3A"

function dueDays(t: DashboardTask): number {
  if (t.isOverdue && t.daysOverdue != null) return -t.daysOverdue
  return t.daysUntilDue ?? 0
}

/** Signed day offset (negative = overdue) from a YYYY-MM-DD due date. */
function daysFromDateStr(dateStr: string): number {
  const due = new Date(dateStr + "T12:00:00")
  const now = new Date()
  now.setHours(12, 0, 0, 0)
  return Math.round((due.getTime() - now.getTime()) / 86_400_000)
}

/** care_type → category glyph for home-upkeep rows. */
function upkeepIcon(careType: string | null): typeof PackageIcon {
  switch (careType) {
    case "cleaning": return SprayCanIcon
    case "maintenance": return WrenchIcon
    case "mixed": return WindIcon
    default: return HouseIcon
  }
}
function fullToday(): string {
  return new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
}

function TierChip({ tier }: { tier: Tier }) {
  const tc = TIER[tier]
  return (
    <span style={{ background: tc.soft, color: tc.dot }} className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[0.5px]">
      <span className="size-1.5 rounded-full" style={{ background: tc.dot }} />{tc.label}
    </span>
  )
}

function Glyph({ size = 56, icon: Icon = PackageIcon }: { size?: number; icon?: typeof PackageIcon }) {
  return (
    <div style={{ width: size, height: size, background: "var(--hh-teal-wash)", color: TEAL }} className="flex shrink-0 items-center justify-center rounded-[15px]">
      <Icon style={{ width: size * 0.5, height: size * 0.5 }} strokeWidth={2} />
    </div>
  )
}

// Inline "See how" panel for the Focus card: real data only (Why + meta +
// notes + Open-full-view). Matches the spec's expand panel (border-top,
// surface2 bg). We deliberately render no steps/supplies/manual blocks — those
// structured fields don't exist on TaskDetail, so inventing them would be fake.
function FocusExpandPanel({
  taskId, detail, loading, days, mins, neverStarted,
}: {
  taskId: string
  detail: ReturnType<typeof useTaskExpandDetail>["detail"]
  loading: boolean
  days: number
  mins: number | null
  neverStarted: boolean
}) {
  const recur = detail?.schedule ? recurLabel(detail.schedule.scheduleType) : null
  const recurText = detail?.schedule
    ? (isRecurring(detail.schedule.scheduleType) ? `Repeats ${recur}` : recur)
    : null
  return (
    <div className="flex flex-col gap-4 px-[22px] py-[18px]" style={{ borderTop: "1px solid var(--hh-line)", background: "var(--hh-surface2)" }}>
      {loading ? (
        <div className="text-[13.5px]" style={{ color: SUB }}>Loading details…</div>
      ) : (
        <>
          {/* Why it matters */}
          {detail?.justification && (
            <div className="flex items-start gap-2.5 rounded-xl px-3.5 py-3" style={{ background: "#EAF1EF" }}>
              <InfoIcon className="mt-0.5 size-[15px] shrink-0" style={{ color: TEAL }} />
              <span className="text-[13.5px] leading-snug text-pretty" style={{ color: "#3A4A45" }}>{detail.justification}</span>
            </div>
          )}

          {/* Meta row — minutes · recurrence · due */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px]" style={{ color: SUB }}>
            {mins != null && <span className="inline-flex items-center gap-1.5"><ClockIcon className="size-[15px]" /> {mins} min</span>}
            {recurText && <span className="inline-flex items-center gap-1.5"><RepeatIcon className="size-[15px]" /> {recurText}</span>}
            {!neverStarted && <span className="inline-flex items-center gap-1.5"><CalendarIcon className="size-[15px]" /> {dueLabel(days)}</span>}
          </div>

          {/* How-to — numbered steps with cautions split out + supplies */}
          <HowToSteps notes={detail?.notes ?? null} steps={detail?.steps ?? null} supplies={detail?.supplies} />

          <Link to={`/tasks/${taskId}`} className="inline-flex items-center gap-1.5 self-start text-[13px] font-bold" style={{ color: TEAL }}>
            Open full view <ArrowRightIcon className="size-[14px]" />
          </Link>
        </>
      )}
    </div>
  )
}

// ── Focus card — most imminent task. Single-row layout: tier chip + overdue
// label on top, then glyph + 23px title + actions. (spec #9)
function FocusCard({ task, homeId, completing, onComplete }: { task: DashboardTask; homeId: string | null; completing: boolean; onComplete: (id: string) => void }) {
  const tier = priorityTier(task.priority)
  const mins = effortMins(task.effort)
  const days = dueDays(task)
  // Never-started past-due work has no real deadline — the recurrence line
  // conveys the cadence, so we drop the timing chip rather than print filler.
  const neverStarted = task.neverCompleted && days < 0
  const { open, toggle, detail, loading } = useTaskExpandDetail(homeId, task.id)
  return (
    <div className="overflow-hidden rounded-[20px] bg-[var(--hh-surface)] shadow-[0_6px_24px_rgba(11,26,22,0.08)]" style={{ opacity: completing ? 0.6 : 1 }}>
      <div className="p-[22px]">
        <div className="flex items-center justify-between">
          <TierChip tier={tier} />
          {(!neverStarted || mins != null) && (
            <span className="text-[13px] font-bold" style={{ color: days < 0 && !neverStarted ? CLAY : TEAL }}>
              {neverStarted ? `${mins} min` : `${dueLabel(days)}${mins != null ? ` · ${mins} min` : ""}`}
            </span>
          )}
        </div>
        <div className="mt-4 flex items-center gap-4">
          <Glyph size={56} />
          <div className="min-w-0 flex-1">
            <div className="text-[23px] font-extrabold leading-[1.12] tracking-[-0.5px]" style={{ color: INK }}>{task.name}</div>
            {task.itemName && <div className="mt-1 text-[13.5px]" style={{ color: SUB }}>{task.itemName}</div>}
          </div>
          <div className="flex shrink-0 gap-2.5">
            <button
              type="button"
              onClick={toggle}
              aria-expanded={open}
              className="inline-flex items-center gap-1.5 rounded-[13px] border-[1.5px] px-4 py-2.5 text-[14px] font-bold"
              style={{ borderColor: "var(--hh-line2)", color: INK }}
            >
              See how {open ? <ChevronUpIcon className="size-4" /> : <ChevronDownIcon className="size-4" />}
            </button>
            <button disabled={completing} onClick={() => onComplete(task.id)} className="inline-flex items-center gap-1.5 rounded-[13px] px-4 py-2.5 text-[14px] font-bold text-white disabled:opacity-60" style={{ background: TEAL }}>
              <CheckIcon className="size-[17px]" strokeWidth={2.6} /> Mark done
            </button>
          </div>
        </div>
      </div>
      {open && <FocusExpandPanel taskId={task.id} detail={detail} loading={loading} days={days} mins={mins} neverStarted={neverStarted} />}
    </div>
  )
}

function SectionLabel({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline justify-between">
      <span className="text-[12px] font-bold uppercase tracking-[0.5px]" style={{ color: SUB }}>{children}</span>
      {right}
    </div>
  )
}

// ── Upcoming agenda (timeline) ────────────────────────────────────────────────
// Each row is expandable with the same "See how" panel as the focus card
// (spec #3): tap the row → numbered steps + why + supplies inline.
function AgendaRow({ t, homeId, completing, onComplete }: { t: DashboardTask; homeId: string | null; completing: boolean; onComplete: (id: string) => void }) {
  const { open, toggle, detail, loading } = useTaskExpandDetail(homeId, t.id)
  const days = dueDays(t)
  const neverStarted = t.neverCompleted && days < 0
  const mins = effortMins(t.effort)
  return (
    <div className="relative mb-3">
      <div className="absolute -left-6 top-[17px] size-3 rounded-full border-2 bg-[var(--hh-surface)]" style={{ borderColor: TIER[priorityTier(t.priority)].dot }} />
      <div className="overflow-hidden rounded-[16px] bg-[var(--hh-surface)] shadow-[0_1px_2px_rgba(15,23,42,0.05)]" style={{ opacity: completing ? 0.6 : 1 }}>
        <div onClick={toggle} className="flex cursor-pointer items-center gap-3 px-4 py-3">
          <Glyph size={36} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[14.5px] font-semibold tracking-[-0.2px]" style={{ color: INK }}>{t.name}</div>
            <div className="mt-0.5 text-[12.5px]" style={{ color: SUB }}>{[t.itemName, neverStarted ? null : dueLabel(days)].filter(Boolean).join(" · ")}</div>
          </div>
          <TierChip tier={priorityTier(t.priority)} />
          <span className="inline-flex items-center gap-1 whitespace-nowrap text-[12.5px] font-bold" style={{ color: TEAL }}>
            See how {open ? <ChevronUpIcon className="size-[15px]" /> : <ChevronDownIcon className="size-[15px]" />}
          </span>
          <button disabled={completing} onClick={(e) => { e.stopPropagation(); onComplete(t.id) }} className="rounded-[10px] px-3 py-2 text-[13px] font-bold text-white disabled:opacity-60" style={{ background: TEAL }}>Done</button>
        </div>
        {open && <FocusExpandPanel taskId={t.id} detail={detail} loading={loading} days={days} mins={mins} neverStarted={neverStarted} />}
      </div>
    </div>
  )
}

function Agenda({ tasks, homeId, completingId, onComplete }: { tasks: DashboardTask[]; homeId: string | null; completingId: string | null; onComplete: (id: string) => void }) {
  if (tasks.length === 0) return null
  return (
    <div>
      <SectionLabel>Upcoming</SectionLabel>
      <div className="relative pl-6">
        <div className="absolute bottom-2.5 left-[5px] top-2 w-0.5" style={{ background: "var(--hh-line)" }} />
        {tasks.map((t) => (
          <AgendaRow key={t.id} t={t} homeId={homeId} completing={completingId === t.id} onComplete={onComplete} />
        ))}
      </div>
    </div>
  )
}

// ── Home upkeep — live list of home-scoped recurring tasks (spec #7) ──────────
// Sourced from getHomeUpkeep: task_instance joined to task_template where
// scope_type='home' and item_unit_id is null, with schedule_rule for cadence.
// Each row is checkable (mark done → cross out) and snoozeable (push due out 2
// weeks). The cadence label + "Seasonal" tag come straight off the row's
// scheduleType/season. There is no real "suggested upkeep" source in the app, so
// the suggestion row from the prototype is intentionally omitted (see report).
function UpkeepRow({
  item, completing, onComplete, onSnooze,
}: {
  item: HomeUpkeepItem
  completing: boolean
  onComplete: (id: string) => void
  onSnooze: (id: string) => void
}) {
  const tier = item.priorityTier
  const days = daysFromDateStr(item.dueDate)
  const seasonal = item.scheduleType === "seasonal"
  const cadence = cadenceLabel(item.scheduleType, item.season, item.intervalDays)
  // Calm due colour: clay only when an essential task is actually overdue,
  // otherwise muted. Never red.
  const dueColor = days < 0 && tier === "essential" ? CLAY : SUB
  return (
    <div className="flex items-center gap-3 px-4 py-3" style={{ opacity: completing ? 0.6 : 1 }}>
      <button
        type="button"
        disabled={completing}
        onClick={() => onComplete(item.taskInstanceId)}
        title="Mark done"
        aria-label={`Mark ${item.title} done`}
        className="flex shrink-0 items-center justify-center rounded-full disabled:opacity-60"
        style={{ width: 22, height: 22, border: `2px solid ${completing ? TIER[tier].dot : "var(--hh-line2)"}`, background: completing ? TIER[tier].dot : "transparent" }}
      >
        {completing && <CheckIcon className="size-[13px] text-white" strokeWidth={3} />}
      </button>
      <Glyph size={34} icon={upkeepIcon(item.careType)} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-semibold" style={{ color: INK, textDecoration: completing ? "line-through" : "none" }}>{item.title}</div>
        <div className="mt-0.5 flex items-center gap-1.5">
          {seasonal && (
            <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[10.5px] font-bold" style={{ color: GOLD, background: "var(--hh-gold-soft)" }}>
              <LeafIcon className="size-[10px]" /> Seasonal
            </span>
          )}
          <span className="truncate text-[12.5px]" style={{ color: SUB }}>{cadence}</span>
        </div>
      </div>
      <span className="whitespace-nowrap text-[12.5px] font-semibold" style={{ color: dueColor }}>{dueLabel(days)}</span>
      <button
        type="button"
        onClick={() => onSnooze(item.taskInstanceId)}
        title="Snooze 2 weeks"
        aria-label={`Snooze ${item.title} 2 weeks`}
        className="flex size-[30px] shrink-0 items-center justify-center rounded-[9px] border"
        style={{ borderColor: "var(--hh-line2)", color: SUB }}
      >
        <AlarmClockIcon className="size-[15px]" />
      </button>
    </div>
  )
}

function DesktopHomeUpkeep({ items, completingId, onComplete, onSnooze }: { items: HomeUpkeepItem[]; completingId: string | null; onComplete: (id: string) => void; onSnooze: (id: string) => void }) {
  if (items.length === 0) return null
  return (
    <div>
      <SectionLabel right={<Link to="/maintenance" className="text-[12.5px] font-bold" style={{ color: TEAL }}>Manage</Link>}>Home upkeep</SectionLabel>
      <div className="divide-y divide-[var(--hh-line)] overflow-hidden rounded-[16px] bg-[var(--hh-surface)] shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
        {items.map((it) => (
          <UpkeepRow key={it.taskInstanceId} item={it} completing={completingId === it.taskInstanceId} onComplete={onComplete} onSnooze={onSnooze} />
        ))}
      </div>
    </div>
  )
}

// ── Good to know — recall NoticeCards + warranty notices + AddDetailsNudge ─────
function RecallCard({ recall }: { recall: HomeNotices["recalls"][number] }) {
  return (
    <Link
      to={`/inventory/${recall.item_unit_id}`}
      className="flex items-start gap-3 rounded-[14px] border p-[15px]"
      style={{ background: "var(--hh-slate-soft)", borderColor: "var(--hh-line)" }}
    >
      <div className="flex size-[38px] shrink-0 items-center justify-center rounded-[10px] border" style={{ background: "var(--hh-surface)", borderColor: "var(--hh-line)" }}>
        <MegaphoneIcon className="size-[18px]" style={{ color: "var(--hh-slate)" }} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-0.5 text-[10.5px] font-bold uppercase tracking-[0.5px]" style={{ color: "var(--hh-slate)" }}>Safety notice</div>
        <div className="text-[14px] font-bold tracking-[-0.2px]" style={{ color: INK }}>Safety update for {recall.display_name}</div>
        {recall.recall_notes && <div className="mt-0.5 text-[12.5px] leading-snug text-pretty" style={{ color: SUB }}>{recall.recall_notes}</div>}
        <span className="mt-2 inline-flex items-center gap-1 text-[12.5px] font-bold" style={{ color: "var(--hh-slate)" }}>Check my model <ArrowRightIcon className="size-[13px]" /></span>
      </div>
    </Link>
  )
}

function WarrantyNoticeCard({ w }: { w: ExpiringWarrantyItem }) {
  return (
    <Link to={`/inventory/${w.item_unit_id}`} className="flex items-start gap-3 rounded-[14px] border p-[15px]" style={{ background: "#FAF6EC", borderColor: "#EFE6CE" }}>
      <div className="flex size-[38px] shrink-0 items-center justify-center rounded-[10px] border" style={{ background: "var(--hh-surface)", borderColor: "#EFE6CE" }}>
        <ShieldCheckIcon className="size-[18px]" style={{ color: GOLD }} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-0.5 text-[10.5px] font-bold uppercase tracking-[0.5px]" style={{ color: GOLD }}>Warranty</div>
        <div className="text-[14px] font-bold tracking-[-0.2px]" style={{ color: INK }}>{w.display_name}</div>
        <div className="mt-0.5 text-[12.5px]" style={{ color: "#5A6863" }}>Ends in {w.days_remaining} day{w.days_remaining === 1 ? "" : "s"}</div>
      </div>
    </Link>
  )
}

function AddDetailsNudge({ items }: { items: HomeNotices["missingDetails"] }) {
  const n = items.length
  return (
    <div className="rounded-[14px] border border-dashed p-[15px]" style={{ borderColor: "var(--hh-line2)", background: "var(--hh-surface)" }}>
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-[11px]" style={{ background: "var(--hh-gold-soft)" }}>
          <ReceiptIcon className="size-[19px]" style={{ color: GOLD }} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-bold tracking-[-0.2px]" style={{ color: INK }}>Finish setting up {n} item{n === 1 ? "" : "s"}</div>
          <div className="mt-0.5 text-[12.5px] leading-snug" style={{ color: SUB }}>Add a purchase date or receipt and Homehub can track {n === 1 ? "its" : "their"} warranty and catch recalls for you.</div>
        </div>
      </div>
      <div className="mt-3 flex flex-col gap-1.5">
        {items.slice(0, 3).map((it) => (
          <Link key={it.item_unit_id} to={`/inventory/${it.item_unit_id}`} className="flex items-center gap-2.5 rounded-[10px] border px-2.5 py-2" style={{ borderColor: "var(--hh-line)", background: "var(--hh-surface2)" }}>
            <Glyph size={30} />
            <span className="min-w-0 flex-1 truncate text-[13px] font-semibold" style={{ color: INK }}>{it.display_name}</span>
            <span className="text-[11px] font-semibold" style={{ color: GOLD }}>Add details</span>
            <ChevronRightIcon className="size-[15px]" style={{ color: FAINT }} />
          </Link>
        ))}
      </div>
    </div>
  )
}

// ── Deep-clean guides — curated, capped guide-level list (advanced/power only,
// spec #6). The over-render fix: `guides` is now a SHORT (max ~5) de-duplicated,
// guide-level list from getDeepCleanGuides — NOT the full per-step cleaning feed
// — with an "All →" link to /clean for the rest.
function DeepCleanGuides({ guides }: { guides: DeepCleanGuide[] }) {
  return (
    <div>
      <SectionLabel right={<Link to="/clean" className="inline-flex items-center gap-0.5 text-[12.5px] font-bold" style={{ color: TEAL }}>All <ArrowRightIcon className="size-[13px]" /></Link>}>Deep-clean guides</SectionLabel>
      {guides.length > 0 ? (
        <div className="divide-y divide-[var(--hh-line)] overflow-hidden rounded-[16px] bg-[var(--hh-surface)] shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          {guides.map((g) => (
            <Link key={g.id} to={g.itemUnitId ? `/clean/${g.itemUnitId}` : "/clean"} className="flex w-full items-center gap-3 px-[15px] py-3 text-left">
              <Glyph size={34} icon={SprayCanIcon} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13.5px] font-semibold" style={{ color: INK }}>{g.title}</div>
                {g.estimatedMinutes != null && <div className="text-[12px]" style={{ color: SUB }}>{g.estimatedMinutes} min guide</div>}
              </div>
              <ChevronRightIcon className="size-4" style={{ color: FAINT }} />
            </Link>
          ))}
        </div>
      ) : (
        <Link to="/clean" className="flex items-center gap-3 rounded-[16px] border border-[var(--hh-line)] bg-[var(--hh-surface)] px-4 py-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-[10px]" style={{ background: "var(--hh-teal-wash)" }}><SparklesIcon className="size-[18px]" style={{ color: TEAL }} /></div>
          <div className="flex-1">
            <div className="text-[14px] font-semibold" style={{ color: INK }}>Deep-clean guides</div>
            <div className="text-[12.5px]" style={{ color: SUB }}>Guided room-by-room cleaning</div>
          </div>
          <ChevronRightIcon className="size-[18px] text-[#C2CBD4]" />
        </Link>
      )}
    </div>
  )
}

// ── This week strip — a real 7-day strip built from due tasks ─────────────────
function WeekStrip({ tasks }: { tasks: DashboardTask[] }) {
  const now = new Date()
  const days = Array.from({ length: 7 }, (_, i) => {
    const dt = new Date(now)
    dt.setDate(now.getDate() + i)
    const due = tasks.filter((t) => {
      const d = dueDays(t)
      const offset = d < 0 ? 0 : d
      return offset === i
    })
    return {
      i,
      label: dt.toLocaleDateString("en-US", { weekday: "narrow" }),
      num: dt.getDate(),
      tasks: due,
    }
  })
  return (
    <div className="grid grid-cols-7 gap-1.5">
      {days.map((day) => {
        const today = day.i === 0
        return (
          <div key={day.i} className="text-center">
            <div className="mb-1.5 text-[10.5px] font-bold" style={{ color: FAINT }}>{day.label}</div>
            <div
              className="flex flex-col items-center justify-center gap-[3px] rounded-[10px]"
              style={{
                height: 40,
                background: today ? TEAL : "var(--hh-surface2)",
                color: today ? "#fff" : INK,
                border: today ? "none" : "1px solid var(--hh-line)",
              }}
            >
              <span className="font-mono text-[13px] font-bold">{day.num}</span>
              <div className="flex gap-[2px]">
                {day.tasks.slice(0, 3).map((t, k) => (
                  <span
                    key={k}
                    className="rounded-full"
                    style={{
                      width: 4,
                      height: 4,
                      background: today ? "rgba(255,255,255,0.85)" : TIER[priorityTier(t.priority)].dot,
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function DesktopHome({
  tasks, warranties, notices, cleaningGuides, homeUpkeep, level, homeId, completingId, onComplete, onSnooze,
}: {
  tasks: DashboardTask[]
  warranties: ExpiringWarrantyItem[]
  notices: HomeNotices
  cleaningGuides: DeepCleanGuide[]
  homeUpkeep: HomeUpkeepItem[]
  level: UserLevel
  homeId: string | null
  completingId: string | null
  onComplete: (id: string) => void
  onSnooze: (id: string) => void
}) {
  const sorted = [...tasks].sort((a, b) => dueDays(a) - dueDays(b))
  const hero = sorted[0]
  const upcoming = sorted.slice(1)
  // Genuinely overdue only — a never-started cadence is "start anytime", not a
  // lapse, so it doesn't inflate the Overdue count.
  const overdue = sorted.filter((t) => t.isOverdue && !t.neverCompleted).length
  const dueToday = sorted.filter((t) => !t.isOverdue && dueDays(t) === 0).length
  const thisWeek = sorted.filter((t) => dueDays(t) >= 0 && dueDays(t) <= 7).length
  const stats: [string, number, string][] = [
    ["Due today", dueToday, TEAL],
    ["This week", thisWeek, INK],
    ["Overdue", overdue, overdue ? CLAY : FAINT],
  ]

  const showUpkeep = level !== "essentials" && homeUpkeep.length > 0
  const showClean = level === "power"

  const hasGoodToKnow = notices.recalls.length > 0 || warranties.length > 0 || notices.missingDetails.length > 0

  return (
    // Break out of the page's narrower max-w-5xl wrapper and re-center the Home
    // content at 1180px with the redesign's padding (spec #1).
    <div className="mx-[calc(50%-50vw)] w-screen">
      <div className="mx-auto w-full max-w-[1180px] px-7 pb-10 pt-[26px]">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[12.5px] font-bold uppercase tracking-[0.5px]" style={{ color: TEAL }}>{fullToday()}</div>
            <h1 className="mt-1 whitespace-nowrap text-[28px] font-extrabold leading-[1.15] tracking-[-0.7px]" style={{ color: INK }}>{greeting()}, Barb</h1>
          </div>
          <Link to="/chat" className="inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2.5 text-[14px] font-bold text-white" style={{ background: TEAL }}>
            <SparklesIcon className="size-[17px]" /> Ask Homehub
          </Link>
        </div>

        <div className="grid items-start gap-[22px] lg:grid-cols-[minmax(0,1.85fr)_minmax(280px,1fr)]">
          {/* Main column — leads with Your Focus; the task counts moved to the
              side-rail "Tasks" card so the focus card wins the eye (spec #1). */}
          <div className="flex flex-col gap-[22px]">
            {hero ? (
              <>
                <div>
                  <SectionLabel>Your focus</SectionLabel>
                  <FocusCard task={hero} homeId={homeId} completing={completingId === hero.id} onComplete={onComplete} />
                </div>

                <Agenda tasks={upcoming} homeId={homeId} completingId={completingId} onComplete={onComplete} />
              </>
            ) : (
              <div className="rounded-[20px] bg-[var(--hh-surface)] p-8 text-center shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
                <div className="text-[16px] font-semibold" style={{ color: INK }}>You&apos;re all caught up</div>
                <div className="mt-1 text-[13.5px]" style={{ color: SUB }}>Nothing needs attention right now.</div>
              </div>
            )}

            {showUpkeep && (
              <DesktopHomeUpkeep items={homeUpkeep} completingId={completingId} onComplete={onComplete} onSnooze={onSnooze} />
            )}
          </div>

          {/* Side rail */}
          <div className="flex flex-col gap-[18px]">
            {/* Tasks — counts in their own card (Option A). Centered metric
                columns with tabular figures + hairline dividers, so single
                digits sit balanced under their labels (no mono side-bearing
                drift). Calendar lives in its own card below. */}
            <div className="rounded-[18px] bg-[var(--hh-surface)] p-[18px] shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
              <SectionLabel>Tasks</SectionLabel>
              <div className="grid grid-cols-3 pt-1">
                {stats.map(([k, v, c], i) => (
                  <div
                    key={k}
                    className="flex flex-col items-center px-1 text-center"
                    style={i > 0 ? { borderLeft: "1px solid var(--hh-line)" } : undefined}
                  >
                    <span className="whitespace-nowrap text-[10.5px] font-bold uppercase tracking-[0.4px]" style={{ color: SUB }}>{k}</span>
                    <span className="mt-2 text-[26px] font-medium leading-none tabular-nums tracking-[-0.5px]" style={{ color: c }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* This week — the live 7-day strip in its own calm card, with the
                calendar link moved below the dates as a clear footer action. */}
            <div className="rounded-[18px] bg-[var(--hh-surface)] p-[18px] shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
              <SectionLabel>This week</SectionLabel>
              <WeekStrip tasks={tasks} />
              <Link
                to="/maintenance"
                className="mt-4 flex items-center justify-center gap-1.5 rounded-[12px] border py-2.5 text-[12.5px] font-bold"
                style={{ borderColor: "var(--hh-line2)", color: TEAL }}
              >
                Full calendar view <ArrowRightIcon className="size-[14px]" />
              </Link>
            </div>

            {/* Good to know — recalls + warranties + add-details nudge */}
            {hasGoodToKnow && (
              <div>
                <SectionLabel right={<Link to="/warranties" className="text-[12.5px] font-bold" style={{ color: GOLD }}>See all</Link>}>Good to know</SectionLabel>
                <div className="flex flex-col gap-3">
                  {notices.recalls.map((r) => <RecallCard key={r.item_unit_id} recall={r} />)}
                  {warranties.slice(0, 3).map((w) => <WarrantyNoticeCard key={w.item_unit_id} w={w} />)}
                  {notices.missingDetails.length > 0 && <AddDetailsNudge items={notices.missingDetails} />}
                </div>
              </div>
            )}

            {/* Deep-clean guides — advanced/power only */}
            {showClean && <DeepCleanGuides guides={cleaningGuides} />}
          </div>
        </div>
      </div>
    </div>
  )
}
