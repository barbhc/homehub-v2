import { useCallback, useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import {
  ChevronLeftIcon, ChevronDownIcon, ChevronUpIcon, CheckIcon, CheckCircle2Icon,
  RepeatIcon, InfoIcon, ClockIcon, MapPinIcon, CalendarIcon, PackageIcon, MinusIcon, PlusIcon,
  BookOpenIcon, ArrowUpRightIcon, SlidersHorizontalIcon,
} from "lucide-react"
import {
  getTaskDetail, markTaskInstanceDone, assignTaskInstance, computeNextDueDate,
  type TaskDetail,
} from "@/modules/care"
import { getHomeMembers, type HomeMember } from "@/modules/home"
import { canAssignTasks } from "@/modules/care"
import { TaskFeedbackSheet } from "@/components/care/TaskFeedbackSheet"
import { classifyActorFromText } from "@/lib/taskActor"
import { HowToSteps } from "@/components/tasks/HowToSteps"
import { TIER, dens, dueLabel, priorityTier } from "@/lib/redesign/tokens"
import type { ScheduleType } from "@/integrations/types"

const INK = "var(--hh-ink)", SUB = "var(--hh-sub)", TEAL = "var(--hh-teal)", TEALD = "var(--hh-teal-deep)", FAINT = "var(--hh-faint)", BG = "var(--hh-bg)"

function todayStr() { return new Date().toISOString().slice(0, 10) }
function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T12:00:00"); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10)
}
function fmt(dateStr: string | null): string {
  if (!dateStr) return "—"
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })
}
function rel(dateStr: string | null): string {
  if (!dateStr) return ""
  const days = Math.round((new Date(dateStr + "T12:00:00").getTime() - new Date(todayStr() + "T12:00:00").getTime()) / 86400000)
  if (days <= 0) return "today"
  if (days < 14) return `in ${days} days`
  if (days < 56) return `in ${Math.round(days / 7)} weeks`
  if (days < 365) return `in ${Math.round(days / 30)} months`
  return "in a year"
}
const RECUR_LABEL: Record<ScheduleType, string> = {
  weekly: "weekly", monthly: "monthly", quarterly: "every 3 months", semiannual: "every 6 months",
  annual: "yearly", every_n_days: "on a cycle", seasonal: "each season",
  after_each_use: "after each use", as_needed: "as needed", setup: "one-time setup",
}
const NON_RECURRING: ScheduleType[] = ["after_each_use", "as_needed", "setup"]
/** Safe label for any schedule type, including values not in the static map. */
function recurLabel(t: ScheduleType): string {
  return RECUR_LABEL[t] ?? "on a schedule"
}
function dueDaysFromDate(dateStr: string): number {
  return Math.round((new Date(dateStr + "T12:00:00").getTime() - new Date(todayStr() + "T12:00:00").getTime()) / 86400000)
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.5px]" style={{ color: SUB }}>{children}</div>
}

export function RefinedTaskDetail({
  taskInstanceId, homeId, onBack, density = "cozy",
}: {
  taskInstanceId: string
  homeId: string | null
  onBack: () => void
  density?: "spacious" | "cozy" | "compact"
}) {
  const d = dens(density)
  const [detail, setDetail] = useState<TaskDetail | null>(null)
  const [members, setMembers] = useState<HomeMember[]>([])
  const [loading, setLoading] = useState(true)
  const [assignOpen, setAssignOpen] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [done, setDone] = useState<{ nextDue: string | null } | null>(null)

  useEffect(() => {
    if (!homeId) return
    let cancelled = false
    Promise.all([getTaskDetail(homeId, taskInstanceId), getHomeMembers(homeId)]).then(([dRes, mRes]) => {
      if (cancelled) return
      setDetail(dRes.data ?? null)
      setMembers(mRes.data ?? [])
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [homeId, taskInstanceId])

  const recurring = !!detail?.schedule && !NON_RECURRING.includes(detail.schedule.scheduleType)

  const assignTo = useCallback(async (userId: string | null) => {
    if (!homeId || !detail) return
    setAssignOpen(false)
    setDetail((x) => (x ? { ...x, assignedTo: userId } : x))
    await assignTaskInstance(homeId, detail.taskInstanceId, userId)
  }, [homeId, detail])

  if (loading) return <div className="flex min-h-full items-center justify-center text-[14px]" style={{ background: BG, color: SUB }}>Loading…</div>
  if (!detail) return (
    <div className="flex min-h-full flex-col items-center justify-center gap-3" style={{ background: BG }}>
      <p className="text-[15px]" style={{ color: SUB }}>Task not found.</p>
      <button onClick={onBack} className="text-[14px] font-bold" style={{ color: TEAL }}>Go back</button>
    </div>
  )

  const tier = priorityTier(detail.tier === "essential" ? "critical" : detail.tier === "recommended" ? "high" : "medium")
  const assignee = members.find((m) => m.user_id === detail.assignedTo)
  const showAssign = canAssignTasks(members.length)

  // Shared assignment control (button + dropdown). Rendered inline on mobile
  // and inside the sticky rail on desktop — identical markup, no duplication.
  const assignControl = (
    <>
      <button onClick={() => setAssignOpen((v) => !v)} className="flex w-full items-center gap-3 rounded-[13px] border border-[var(--hh-line2)] px-3.5 py-3 text-left" style={{ background: "var(--hh-surface)" }}>
        <span className="flex size-[30px] shrink-0 items-center justify-center rounded-full text-[12px] font-bold" style={{ background: "var(--hh-teal-wash)", color: TEAL }}>
          {(assignee?.profile?.full_name ?? "?").slice(0, 1).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[10.5px] font-bold uppercase tracking-[0.4px]" style={{ color: SUB }}>Assigned to</span>
          <span className="block text-[15px] font-bold" style={{ color: INK }}>{assignee?.profile?.full_name ?? "Anyone"}</span>
        </span>
        {assignOpen ? <ChevronUpIcon className="size-[18px]" style={{ color: FAINT }} /> : <ChevronDownIcon className="size-[18px]" style={{ color: FAINT }} />}
      </button>
      {assignOpen && (
        <div className="mt-1.5 overflow-hidden rounded-xl border border-[var(--hh-line2)]" style={{ background: "var(--hh-surface)" }}>
          {[{ user_id: null as string | null, name: "Anyone" }, ...members.map((m) => ({ user_id: m.user_id, name: m.profile?.full_name ?? "Member" }))].map((m, i) => (
            <button key={m.user_id ?? "none"} onClick={() => assignTo(m.user_id)} className="flex w-full items-center gap-2.5 px-3.5 py-3 text-left" style={{ borderTop: i ? "0.5px solid var(--hh-line)" : "none", background: m.user_id === detail.assignedTo ? "var(--hh-surface2)" : "var(--hh-surface)" }}>
              <span className="flex size-[26px] items-center justify-center rounded-full text-[11px] font-bold" style={{ background: "var(--hh-teal-wash)", color: TEAL }}>{m.name.slice(0, 1).toUpperCase()}</span>
              <span className="flex-1 text-[15px] font-semibold" style={{ color: INK }}>{m.name}</span>
              {m.user_id === detail.assignedTo && <CheckIcon className="size-4" strokeWidth={2.6} style={{ color: TEAL }} />}
            </button>
          ))}
        </div>
      )}
    </>
  )

  return (
    <div className="flex min-h-full flex-col" style={{ background: BG }}>
      {/* Nav */}
      <div className="flex items-center px-3 pt-1 pb-2">
        <button onClick={onBack} className="inline-flex items-center gap-0.5 py-1.5 text-[16px] font-semibold" style={{ color: TEAL }}>
          <ChevronLeftIcon className="size-[22px]" strokeWidth={2.4} /> Back
        </button>
      </div>

      <div
        className="flex-1 px-5 pb-40 lg:grid lg:grid-cols-[minmax(0,1.7fr)_minmax(270px,1fr)] lg:items-start lg:gap-[22px] lg:pb-12"
        style={{ paddingInline: d.pad, display: "flex", flexDirection: "column", gap: d.stack }}
      >
        {/* ── MAIN COLUMN ── */}
        <div className="flex min-w-0 flex-col" style={{ gap: d.stack }}>
          {/* Header card */}
          <div className="rounded-[20px] p-5 shadow-[0_1px_2px_rgba(15,23,42,0.05)]" style={{ background: "var(--hh-surface)" }}>
            <div className="flex items-center gap-3.5">
              <div className="flex size-[52px] shrink-0 items-center justify-center rounded-2xl lg:size-[60px]" style={{ background: "var(--hh-teal-wash)", color: TEAL }}>
                <PackageIcon className="size-6 lg:size-7" strokeWidth={2} />
              </div>
              <div className="min-w-0 flex-1">
                <span style={{ background: TIER[tier].soft, color: TIER[tier].dot }} className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[0.5px]">
                  <span className="size-1.5 rounded-full" style={{ background: TIER[tier].dot }} />{TIER[tier].label}
                </span>
                <h1 className="mt-2 text-[24px] font-extrabold leading-tight tracking-[-0.5px] text-balance lg:text-[28px] lg:tracking-[-0.7px]" style={{ color: INK }}>{detail.title}</h1>
              </div>
            </div>
            <div className="mt-3.5 flex flex-wrap gap-x-4 gap-y-2 text-[13px] lg:text-[13.5px]" style={{ color: SUB }}>
              {detail.estimatedMinutes != null && <span className="inline-flex items-center gap-1.5"><ClockIcon className="size-[15px]" /> {detail.estimatedMinutes} min</span>}
              {(detail.itemName || detail.roomName) && <span className="inline-flex items-center gap-1.5"><MapPinIcon className="size-[15px]" /> {[detail.itemName, detail.roomName].filter(Boolean).join(" · ")}</span>}
              <span className="inline-flex items-center gap-1.5"><CalendarIcon className="size-[15px]" /> {detail.neverCompleted && dueDaysFromDate(detail.dueDate) < 0 ? "Start anytime" : dueLabel(dueDaysFromDate(detail.dueDate))}</span>
            </div>
          </div>

          {/* Recurrence strip — mobile only (desktop shows it in the rail) */}
          {detail.schedule && (
            <div className="flex items-center gap-2.5 rounded-xl border border-[var(--hh-line)] px-3.5 py-3 lg:hidden" style={{ background: "var(--hh-surface)" }}>
              <RepeatIcon className="size-4 shrink-0" style={{ color: TEAL }} />
              <span className="flex-1 text-[13.5px] font-semibold" style={{ color: INK }}>
                {recurring ? `Repeats ${recurLabel(detail.schedule.scheduleType)}` : recurLabel(detail.schedule.scheduleType)}
              </span>
              <span className="text-[13px]" style={{ color: SUB }}>Next: {fmt(detail.dueDate)}</span>
            </div>
          )}

          {/* Why it matters */}
          {detail.justification && (
            <div className="flex items-start gap-2.5 rounded-xl px-3.5 py-3" style={{ background: "var(--hh-surface2)" }}>
              <InfoIcon className="mt-0.5 size-[15px] shrink-0" style={{ color: TEAL }} />
              <span className="text-[13.5px] leading-snug text-pretty" style={{ color: "#3A4A45" }}>{detail.justification}</span>
            </div>
          )}

          {/* How to — designed numbered steps (warnings split into a caution
              callout) + supplies, instead of a raw instructions textarea. */}
          <HowToSteps notes={detail.notes} steps={detail.steps} supplies={detail.supplies} />

          {/* Manual reference — where this how-to came from; opens the item page
              (which has the manual viewer). */}
          {detail.manualPage != null && detail.itemUnitId && (
            <Link
              to={`/items/${detail.itemUnitId}?manualPage=${detail.manualPage}`}
              className="inline-flex items-center gap-2 self-start rounded-xl border px-3.5 py-2.5 text-[13px] font-bold"
              style={{ borderColor: "var(--hh-line2)", background: "var(--hh-surface)", color: TEAL }}
            >
              <BookOpenIcon className="size-[15px]" /> Open manual · p.{detail.manualPage}
              <ArrowUpRightIcon className="size-[13px]" />
            </Link>
          )}

          {/* Assignment — mobile only, below the instructions (desktop shows it in the rail) */}
          {showAssign && (
            <div className="lg:hidden">
              {assignControl}
            </div>
          )}

          {/* Feedback — "this task isn't right for my home". Opens the tune sheet
              (archive / re-tier / re-cadence / re-season + confirm-first sweep). */}
          <button
            onClick={() => setFeedbackOpen(true)}
            className="inline-flex items-center gap-2 self-start rounded-xl border px-3.5 py-2.5 text-[13px] font-bold"
            style={{ borderColor: "var(--hh-line2)", background: "var(--hh-surface)", color: SUB }}
          >
            <SlidersHorizontalIcon className="size-[15px]" /> Not quite right? Tune this task
          </button>
        </div>

        {/* ── STICKY RIGHT RAIL (desktop only) ── */}
        <div className="hidden lg:sticky lg:top-6 lg:flex lg:flex-col lg:gap-4">
          {/* Mark done / done state */}
          {done ? (
            <div className="flex items-center gap-2.5 rounded-2xl border p-4 shadow-[0_1px_2px_rgba(15,23,42,0.05)]" style={{ borderColor: "rgba(27,107,90,0.2)", background: "var(--hh-teal-wash)" }}>
              <CheckCircle2Icon className="size-5 shrink-0" style={{ color: TEAL }} />
              <span className="flex-1 text-[13.5px] font-bold" style={{ color: TEALD }}>
                {done.nextDue ? `Done · next due ${fmt(done.nextDue)}` : "Done"}
              </span>
              <button onClick={onBack} className="text-[14px] font-bold" style={{ color: TEAL }}>Back</button>
            </div>
          ) : (
            <div className="rounded-2xl p-4 shadow-[0_1px_2px_rgba(15,23,42,0.05)]" style={{ background: "var(--hh-surface)" }}>
              <button onClick={() => setSheetOpen(true)} className="flex w-full items-center justify-center gap-2 rounded-[14px] py-3.5 text-[15px] font-bold text-white" style={{ background: TEAL }}>
                <CheckIcon className="size-[18px]" strokeWidth={2.6} /> Mark done
              </button>
            </div>
          )}

          {/* Schedule / recurrence */}
          {detail.schedule && (
            <div>
              <Label>Schedule</Label>
              <div className="flex items-center gap-2.5 rounded-xl border border-[var(--hh-line)] px-3.5 py-3" style={{ background: "var(--hh-surface)" }}>
                <RepeatIcon className="size-4 shrink-0" style={{ color: TEAL }} />
                <span className="flex-1 text-[13.5px] font-semibold" style={{ color: INK }}>
                  {recurring ? `Repeats ${recurLabel(detail.schedule.scheduleType)}` : recurLabel(detail.schedule.scheduleType)}
                </span>
                <span className="text-[13px]" style={{ color: SUB }}>Next: {fmt(detail.dueDate)}</span>
              </div>
            </div>
          )}

          {/* Assignment */}
          {showAssign && (
            <div>
              <Label>Assignment</Label>
              {assignControl}
            </div>
          )}
        </div>
      </div>

      {/* Sticky Mark done (mobile only) */}
      {!done && (
        <div className="absolute inset-x-0 bottom-0 border-t border-[var(--hh-line)] px-5 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl lg:hidden" style={{ paddingInline: d.pad, background: "color-mix(in srgb, var(--hh-surface) 95%, transparent)" }}>
          <button onClick={() => setSheetOpen(true)} className="flex w-full items-center justify-center gap-2 rounded-[14px] py-4 text-[16px] font-bold text-white" style={{ background: TEAL }}>
            <CheckIcon className="size-[18px]" strokeWidth={2.6} /> Mark done
          </button>
        </div>
      )}

      {/* Done bar (mobile only) */}
      {done && (
        <div className="absolute inset-x-0 bottom-0 z-[45] flex items-center gap-2.5 border-t px-5 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3 lg:hidden" style={{ background: "var(--hh-teal-wash)", borderColor: "rgba(27,107,90,0.2)", paddingInline: d.pad }}>
          <CheckCircle2Icon className="size-5 shrink-0" style={{ color: TEAL }} />
          <span className="flex-1 text-[13.5px] font-bold" style={{ color: TEALD }}>
            {done.nextDue ? `Done · next due ${fmt(done.nextDue)}` : "Done"}
          </span>
          <button onClick={onBack} className="text-[14px] font-bold" style={{ color: TEAL }}>Back</button>
        </div>
      )}

      {sheetOpen && (
        <ConfirmDoneSheet
          d={d}
          recurring={recurring}
          scheduleType={detail.schedule?.scheduleType ?? null}
          intervalDays={detail.schedule?.intervalDays ?? null}
          season={detail.schedule?.season ?? null}
          onClose={() => setSheetOpen(false)}
          onConfirm={async ({ completedOn, nextDue }) => {
            if (!homeId) return
            setSheetOpen(false)
            await markTaskInstanceDone(homeId, detail.taskInstanceId, null, { completedOn, nextDueOverride: nextDue })
            setDone({ nextDue })
          }}
        />
      )}

      {homeId && feedbackOpen && (
        <TaskFeedbackSheet
          homeId={homeId}
          taskTemplateId={detail.taskTemplateId}
          taskInstanceId={detail.taskInstanceId}
          title={detail.title}
          tier={detail.tier}
          justification={detail.justification}
          manualPage={detail.manualPage}
          hazardous={classifyActorFromText([detail.title, detail.notes, detail.justification].filter(Boolean).join(" ")) === "hazardous"}
          onClose={() => setFeedbackOpen(false)}
          onApplied={() => { setFeedbackOpen(false); onBack() }}
        />
      )}
    </div>
  )
}

// ── Confirm-next-date sheet (Phase 1) ─────────────────────────────────────────
function ConfirmDoneSheet({
  d, recurring, scheduleType, intervalDays, season, onClose, onConfirm,
}: {
  d: ReturnType<typeof dens>
  recurring: boolean
  scheduleType: ScheduleType | null
  intervalDays: number | null
  season: string | null
  onClose: () => void
  onConfirm: (v: { completedOn: string; nextDue: string | null }) => void
}) {
  const [whenDone, setWhenDone] = useState<"today" | "earlier">("today")
  const [bump, setBump] = useState(0)

  const completedOn = whenDone === "today" ? todayStr() : addDays(todayStr(), -5)
  const nextDue = useMemo(() => {
    if (!recurring || !scheduleType) return null
    const base = computeNextDueDate(scheduleType, completedOn, {
      intervalDays: intervalDays ?? undefined,
      season: (season as "spring" | "summer" | "fall" | "winter" | null) ?? undefined,
    })
    return base ? addDays(base, bump * 7) : null
  }, [recurring, scheduleType, completedOn, intervalDays, season, bump])

  return (
    <>
      <div onClick={onClose} className="absolute inset-0 z-40" style={{ background: "rgba(8,12,11,0.4)" }} />
      <div className="absolute inset-x-0 bottom-0 z-41 rounded-t-[20px] px-5 pb-[calc(18px+env(safe-area-inset-bottom))] pt-4 shadow-[0_-8px_30px_rgba(0,0,0,0.18)]" style={{ paddingInline: d.pad, background: "var(--hh-surface)" }}>
        <div className="mx-auto mb-4 h-1 w-9 rounded-full" style={{ background: "rgba(15,23,42,0.15)" }} />
        <div className="mb-1 flex items-center gap-2.5">
          <span className="flex size-[30px] items-center justify-center rounded-full" style={{ background: TEAL }}><CheckIcon className="size-[17px] text-white" strokeWidth={3} /></span>
          <div className="text-[22px] font-extrabold tracking-[-0.4px]" style={{ color: INK }}>Nice work</div>
        </div>
        <div className="mb-4 text-[13.5px]" style={{ color: SUB }}>When did you do it?</div>
        <div className="mb-4 flex gap-2.5">
          {([["today", "Today"], ["earlier", "A few days ago"]] as ["today" | "earlier", string][]).map(([k, l]) => (
            <button key={k} onClick={() => setWhenDone(k)} className="flex-1 rounded-xl border-[1.5px] py-3 text-[13.5px] font-bold"
              style={whenDone === k ? { borderColor: TEAL, background: "var(--hh-teal-wash)", color: TEAL } : { borderColor: "var(--hh-line2)", background: "var(--hh-surface)", color: INK }}>{l}</button>
          ))}
        </div>
        {recurring && nextDue && (
          <div className="mb-4 flex items-center justify-between rounded-2xl px-4 py-3.5" style={{ background: "var(--hh-surface2)" }}>
            <div className="min-w-0">
              <div className="text-[11px] font-bold uppercase tracking-[0.4px]" style={{ color: SUB }}>Next due</div>
              <div className="mt-0.5 text-[18px] font-extrabold tracking-[-0.4px]" style={{ color: TEAL }}>{fmt(nextDue)} · {rel(nextDue)}</div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setBump((b) => b - 1)} aria-label="Earlier" className="flex size-10 items-center justify-center rounded-[10px] border border-[var(--hh-line2)]" style={{ background: "var(--hh-surface)" }}><MinusIcon className="size-4" /></button>
              <button onClick={() => setBump((b) => b + 1)} aria-label="Later" className="flex size-10 items-center justify-center rounded-[10px] border border-[var(--hh-line2)]" style={{ background: "var(--hh-surface)" }}><PlusIcon className="size-4" /></button>
            </div>
          </div>
        )}
        <button onClick={() => onConfirm({ completedOn, nextDue })} className="w-full rounded-[14px] py-4 text-[16px] font-bold text-white" style={{ background: TEAL }}>Confirm</button>
      </div>
    </>
  )
}
