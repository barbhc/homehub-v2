import { useState } from "react"
import { Link } from "react-router-dom"
import {
  SparklesIcon,
  ArrowUpIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ChevronRightIcon,
  ArrowRightIcon,
  WrenchIcon,
  BookOpenIcon,
  PackageIcon,
  ShieldCheckIcon,
  SprayCanIcon,
  RepeatIcon,
} from "lucide-react"
import type { DashboardTask, ExpiringWarrantyItem } from "@/lib/dashboard"
import type { DeepCleanGuide } from "@/lib/cleanSession"
import type { UserLevel } from "@/hooks/useUserLevel"
import { InfoIcon, ClockIcon, CalendarIcon } from "lucide-react"
import { TIER, dens, dueLabel, greeting, shortDate, effortMins, priorityTier, type Tier } from "@/lib/redesign/tokens"
import { useTaskExpandDetail, recurLabel, isRecurring } from "@/components/home/useTaskExpandDetail"
import { HowToSteps } from "@/components/tasks/HowToSteps"

// Calm palette (design/hh-home2.jsx)
const INK = "var(--hh-ink)", SUB = "var(--hh-sub)", TEAL = "var(--hh-teal)", BG = "var(--hh-bg)"

/** Signed day offset for a task (negative = overdue), for dueLabel. */
function dueDays(t: DashboardTask): number {
  if (t.isOverdue && t.daysOverdue != null) return -t.daysOverdue
  return t.daysUntilDue ?? 0
}

function TierChip({ tier }: { tier: Tier }) {
  const tc = TIER[tier]
  return (
    <span
      style={{ background: tc.soft, color: tc.dot }}
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[0.5px]"
    >
      <span style={{ background: tc.dot }} className="h-1.5 w-1.5 rounded-full" />
      {tc.label}
    </span>
  )
}

function ItemGlyph({ size = 44 }: { size?: number }) {
  return (
    <div
      style={{ width: size, height: size, background: "var(--hh-teal-wash)", color: TEAL }}
      className="flex shrink-0 items-center justify-center rounded-[15px]"
    >
      <PackageIcon style={{ width: size * 0.5, height: size * 0.5 }} strokeWidth={2} />
    </div>
  )
}

// ── Ask module (mini) — pinned on top, taps through to Ask ────────────────────
function AskModule({ d }: { d: ReturnType<typeof dens> }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="overflow-hidden rounded-[18px] border border-[var(--hh-line2)] shadow-[0_1px_2px_rgba(15,23,42,0.04)]" style={{ background: "var(--hh-surface)" }}>
      <div className="flex items-center gap-2.5 py-2 pl-4 pr-2">
        <SparklesIcon className="size-[17px] shrink-0" style={{ color: TEAL }} />
        <Link to="/chat" className="flex-1 text-[15px] text-[#8A9994]">
          Ask about your home…
        </Link>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label="Quick actions"
          aria-expanded={open}
          className="flex size-9 shrink-0 items-center justify-center rounded-[10px] border border-[var(--hh-line2)]"
          style={{ background: open ? "var(--hh-teal-wash)" : "var(--hh-surface)" }}
        >
          {open ? <ChevronUpIcon className="size-4" style={{ color: TEAL }} /> : <WrenchIcon className="size-4" style={{ color: TEAL }} />}
        </button>
        <Link
          to="/chat"
          aria-label="Ask"
          className="flex size-9 shrink-0 items-center justify-center rounded-full"
          style={{ background: TEAL }}
        >
          <ArrowUpIcon className="size-[18px] text-white" strokeWidth={2.6} />
        </Link>
      </div>
      {open && (
        <div className="flex gap-3 border-t border-[var(--hh-line)] bg-[var(--hh-surface2)] p-4" style={{ gap: d.gap }}>
          {[
            { icon: WrenchIcon, label: "Troubleshoot", to: "/chat" },
            { icon: BookOpenIcon, label: "Ask a manual", to: "/chat" },
          ].map((b) => (
            <Link
              key={b.label}
              to={b.to}
              className="flex flex-1 flex-col items-center gap-1.5 rounded-xl border-0 bg-[var(--hh-surface2)] py-3 text-center"
            >
              <b.icon className="size-[19px]" style={{ color: TEAL }} />
              <span className="text-[12.5px] font-semibold" style={{ color: INK }}>{b.label}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

// Calm inline reveal below the hero — real data only (Why + meta + notes +
// Open-full-view). No fabricated steps/supplies/manual: TaskDetail carries no
// such structured fields, so the panel shows only what exists.
function HeroExpandPanel({
  d, taskId, detail, loading, days, mins, neverStarted,
}: {
  d: ReturnType<typeof dens>
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
    <div className="flex flex-col" style={{ borderTop: "1px solid var(--hh-line)", background: "var(--hh-surface2)", padding: d.cardPad, gap: d.gap }}>
      {loading ? (
        <div className="text-[13px]" style={{ color: SUB }}>Loading details…</div>
      ) : (
        <>
          {detail?.justification && (
            <div className="flex items-start gap-2.5 rounded-xl px-3 py-2.5" style={{ background: "#EAF1EF" }}>
              <InfoIcon className="mt-0.5 size-[14px] shrink-0" style={{ color: TEAL }} />
              <span className="text-[13px] leading-snug text-pretty" style={{ color: "#3A4A45" }}>{detail.justification}</span>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-[12.5px]" style={{ color: SUB }}>
            {mins != null && <span className="inline-flex items-center gap-1.5"><ClockIcon className="size-[14px]" /> {mins} min</span>}
            {recurText && <span className="inline-flex items-center gap-1.5"><RepeatIcon className="size-[14px]" /> {recurText}</span>}
            {!neverStarted && <span className="inline-flex items-center gap-1.5"><CalendarIcon className="size-[14px]" /> {dueLabel(days)}</span>}
          </div>

          <HowToSteps notes={detail?.notes ?? null} steps={detail?.steps ?? null} supplies={detail?.supplies} />

          <Link to={`/tasks/${taskId}`} className="inline-flex items-center gap-1.5 self-start text-[13px] font-bold" style={{ color: TEAL }}>
            Open full view <ArrowRightIcon className="size-[14px]" strokeWidth={2.4} />
          </Link>
        </>
      )}
    </div>
  )
}

// ── Hero — most imminent task ─────────────────────────────────────────────────
function TaskHero({
  d, task, homeId, completing, onComplete,
}: {
  d: ReturnType<typeof dens>
  task: DashboardTask
  homeId: string | null
  completing: boolean
  onComplete: (id: string) => void
}) {
  const tier = priorityTier(task.priority)
  const mins = effortMins(task.effort)
  const days = dueDays(task)
  const neverStarted = task.neverCompleted && days < 0
  const { open, toggle, detail, loading } = useTaskExpandDetail(homeId, task.id)
  return (
    <div className="overflow-hidden rounded-[20px] shadow-[0_6px_24px_rgba(11,26,22,0.08)]" style={{ background: "var(--hh-surface)", opacity: completing ? 0.6 : 1 }}>
      <div style={{ padding: d.cardPad + 2 }}>
        <div className="flex items-center justify-between">
          <TierChip tier={tier} />
          {(!neverStarted || mins != null) && (
            <span className="text-[12.5px] font-bold" style={{ color: TEAL }}>
              {neverStarted ? `${mins} min` : `${dueLabel(days)}${mins != null ? ` · ${mins} min` : ""}`}
            </span>
          )}
        </div>
        <div className="mt-3.5 flex items-center gap-3.5">
          <ItemGlyph size={d.tap + 22} />
          <div className="min-w-0 flex-1">
            <div className="text-[21px] font-extrabold leading-tight tracking-[-0.4px] text-balance" style={{ color: INK }}>
              {task.name}
            </div>
            {task.itemName && <div className="mt-0.5 text-[13.5px]" style={{ color: SUB }}>{task.itemName}</div>}
          </div>
        </div>
        <div className="mt-4 flex gap-3" style={{ gap: d.gap }}>
          <button
            type="button"
            disabled={completing}
            onClick={() => onComplete(task.id)}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-[13px] border-0 py-3 text-[15px] font-bold text-white disabled:opacity-60"
            style={{ background: TEAL }}
          >
            <CheckIcon className="size-[17px]" strokeWidth={2.6} /> Mark done
          </button>
          <button
            type="button"
            onClick={toggle}
            aria-expanded={open}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-[13px] border-[1.5px] px-4 py-3 text-[15px] font-bold"
            style={{ borderColor: "var(--hh-line2)", color: INK }}
          >
            See how {open ? <ChevronUpIcon className="size-4" strokeWidth={2.4} /> : <ChevronDownIcon className="size-4" strokeWidth={2.4} />}
          </button>
        </div>
      </div>
      {open && <HeroExpandPanel d={d} taskId={task.id} detail={detail} loading={loading} days={days} mins={mins} neverStarted={neverStarted} />}
    </div>
  )
}

// ── Agenda timeline (upcoming, expandable to a "See how" panel + action) ──────
// Mirrors the hero's inline reveal (spec #3): tap → numbered steps + why +
// supplies, then Mark done. Owns its own detail fetch via useTaskExpandDetail.
function AgendaRow({
  d, task, homeId, completing, onComplete,
}: {
  d: ReturnType<typeof dens>
  task: DashboardTask
  homeId: string | null
  completing: boolean
  onComplete: (id: string) => void
}) {
  const mins = effortMins(task.effort)
  const days = dueDays(task)
  const neverStarted = task.neverCompleted && days < 0
  const { open, toggle, detail, loading } = useTaskExpandDetail(homeId, task.id)
  return (
    <div className="relative" style={{ marginBottom: d.gap + 2 }}>
      <div
        className="absolute -left-6 top-4 size-3 rounded-full border-2"
        style={{ borderColor: TIER[priorityTier(task.priority)].dot, background: "var(--hh-surface)" }}
      />
      <div className="overflow-hidden rounded-2xl shadow-[0_1px_2px_rgba(15,23,42,0.05)]" style={{ background: "var(--hh-surface)", opacity: completing ? 0.6 : 1 }}>
        <button type="button" onClick={toggle} aria-expanded={open} className="flex w-full items-center gap-3 text-left" style={{ padding: `${d.rowPy}px ${d.cardPad}px` }}>
          <ItemGlyph size={d.tap + 4} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-semibold tracking-[-0.2px]" style={{ color: INK }}>{task.name}</div>
            <div className="mt-0.5 text-[12.5px]" style={{ color: SUB }}>
              {[task.itemName, neverStarted ? null : dueLabel(days), mins != null ? `${mins} min` : null].filter(Boolean).join(" · ")}
            </div>
          </div>
          <span className="whitespace-nowrap text-[12px] font-bold" style={{ color: TEAL }}>See how</span>
          {open ? <ChevronUpIcon className="size-[18px] text-[#94A3B8]" /> : <ChevronDownIcon className="size-[18px] text-[#94A3B8]" />}
        </button>
        {open && (
          <>
            <HeroExpandPanel d={d} taskId={task.id} detail={detail} loading={loading} days={days} mins={mins} neverStarted={neverStarted} />
            <div className="border-t border-[var(--hh-line)] bg-[var(--hh-surface2)]" style={{ padding: d.cardPad }}>
              <button
                type="button"
                disabled={completing}
                onClick={() => onComplete(task.id)}
                className="w-full rounded-[11px] border-0 py-2.5 text-[14px] font-bold text-white disabled:opacity-60"
                style={{ background: TEAL }}
              >
                Mark done
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function SectionLabel({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between pl-0.5">
      <span className="text-xs font-bold uppercase tracking-[0.6px]" style={{ color: SUB }}>{children}</span>
      {right}
    </div>
  )
}

// ── Notices (warranties) — calm gold ──────────────────────────────────────────
function WarrantyNotice({ d, w }: { d: ReturnType<typeof dens>; w: ExpiringWarrantyItem }) {
  return (
    <Link
      to={`/inventory/${w.item_unit_id}`}
      className="flex w-full items-start gap-3 rounded-2xl border text-left"
      style={{ background: "#FAF6EC", borderColor: "#EFE6CE", padding: d.cardPad }}
    >
      <div className="flex size-9 shrink-0 items-center justify-center rounded-[10px] border" style={{ borderColor: "#EFE6CE", background: "var(--hh-surface)" }}>
        <ShieldCheckIcon className="size-[18px]" style={{ color: "#9A7B3A" }} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-0.5 text-[10.5px] font-bold uppercase tracking-[0.5px]" style={{ color: "#9A7B3A" }}>Warranty</div>
        <div className="text-[15px] font-bold tracking-[-0.2px]" style={{ color: INK }}>{w.display_name}</div>
        <div className="mt-0.5 text-[13px] leading-snug" style={{ color: "#5A6863" }}>
          Warranty ends in {w.days_remaining} day{w.days_remaining === 1 ? "" : "s"}
        </div>
        <span className="mt-2.5 inline-flex items-center gap-1 text-[13px] font-bold" style={{ color: "#9A7B3A" }}>
          Review <ArrowRightIcon className="size-3" />
        </span>
      </div>
    </Link>
  )
}

// ── Level-gated entry card (Home upkeep / Deep clean) ─────────────────────────
function EntryCard({ d, icon: Icon, label, sub, to }: { d: ReturnType<typeof dens>; icon: typeof RepeatIcon; label: string; sub: string; to: string }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 rounded-2xl border border-[var(--hh-line)] shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
      style={{ padding: `${d.rowPy}px ${d.cardPad}px`, background: "var(--hh-surface)" }}
    >
      <div className="flex size-9 shrink-0 items-center justify-center rounded-[10px]" style={{ background: "var(--hh-teal-wash)" }}>
        <Icon className="size-[18px]" style={{ color: TEAL }} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-semibold tracking-[-0.2px]" style={{ color: INK }}>{label}</div>
        <div className="text-[12.5px]" style={{ color: SUB }}>{sub}</div>
      </div>
      <ChevronRightIcon className="size-[18px] text-[#94A3B8]" />
    </Link>
  )
}

// ── Screen ────────────────────────────────────────────────────────────────────
export function RefinedHome({
  tasks,
  warranties,
  cleaningGuides = [],
  level,
  homeId,
  completingId,
  onComplete,
  density = "cozy",
}: {
  tasks: DashboardTask[]
  warranties: ExpiringWarrantyItem[]
  cleaningGuides?: DeepCleanGuide[]
  level: UserLevel
  homeId: string | null
  completingId: string | null
  onComplete: (id: string) => void
  density?: "spacious" | "cozy" | "compact"
}) {
  const d = dens(density)

  const sorted = [...tasks].sort((a, b) => dueDays(a) - dueDays(b))
  const hero = sorted[0]
  // Fix A: cap the Home "Upcoming" list so it stays calm; the rest is one tap
  // away via a quiet "N more this week →" link to the full Tasks screen.
  const UPCOMING_CAP = 4
  const upcomingAll = sorted.slice(1)
  const upcoming = upcomingAll.slice(0, UPCOMING_CAP)
  const moreThisWeek = upcomingAll.length - upcoming.length

  const showUpkeep = level !== "essentials"
  const showClean = level === "power"

  return (
    <div className="flex min-h-full flex-col" style={{ background: BG }}>
      {/* Compact header */}
      <div className="flex items-baseline justify-between px-5 pt-3" style={{ paddingInline: d.pad }}>
        <span className="text-[19px] font-extrabold tracking-[-0.4px]" style={{ color: INK }}>{greeting()}, Barb</span>
        <span className="text-[12.5px] font-semibold" style={{ color: SUB }}>{shortDate(0)}</span>
      </div>

      <div className="flex flex-1 flex-col px-5 pt-4" style={{ paddingInline: d.pad, gap: d.stack }}>
        <AskModule d={d} />

        {hero ? (
          <>
            <div className="flex flex-col gap-2.5">
              <SectionLabel right={upcomingAll.length > 0 ? <span className="whitespace-nowrap pl-2.5 text-[12.5px] font-medium" style={{ color: SUB }}>{upcomingAll.length} more this week</span> : undefined}>
                Due today
              </SectionLabel>
              <TaskHero d={d} task={hero} homeId={homeId} completing={completingId === hero.id} onComplete={onComplete} />
            </div>

            {upcoming.length > 0 && (
              <div>
                <div className="mb-3 pl-0.5">
                  <SectionLabel>Upcoming</SectionLabel>
                </div>
                <div className="relative pl-6">
                  <div className="absolute bottom-2 left-[5px] top-1.5 w-0.5" style={{ background: "var(--hh-line)" }} />
                  {upcoming.map((t) => (
                    <AgendaRow
                      key={t.id}
                      d={d}
                      task={t}
                      homeId={homeId}
                      completing={completingId === t.id}
                      onComplete={onComplete}
                    />
                  ))}
                </div>
                {moreThisWeek > 0 && (
                  <Link to="/tasks" className="mt-2 block pl-6 text-[13px] font-semibold" style={{ color: SUB }}>
                    {moreThisWeek} more this week →
                  </Link>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="rounded-[20px] p-6 text-center shadow-[0_1px_2px_rgba(15,23,42,0.05)]" style={{ background: "var(--hh-surface)" }}>
            <div className="text-[15px] font-semibold" style={{ color: INK }}>You&apos;re all caught up</div>
            <div className="mt-1 text-[13px]" style={{ color: SUB }}>Nothing needs attention right now.</div>
          </div>
        )}

        {/* Notices — warranties (timely, calm) */}
        {warranties.length > 0 && (
          <div className="flex flex-col gap-3" style={{ gap: d.gap }}>
            <SectionLabel
              right={
                <Link to="/warranties" className="whitespace-nowrap pl-2.5 text-[12.5px] font-semibold" style={{ color: "#9A7B3A" }}>
                  See all
                </Link>
              }
            >
              Good to know
            </SectionLabel>
            {warranties.slice(0, 3).map((w) => <WarrantyNotice key={w.item_unit_id} d={d} w={w} />)}
          </div>
        )}

        {/* Level-gated secondary surfaces */}
        {showUpkeep && (
          <EntryCard d={d} icon={RepeatIcon} label="Home upkeep" sub="Recurring home-level tasks" to="/maintenance" />
        )}
        {showClean && (
          cleaningGuides.length > 0 ? (
            <div className="flex flex-col gap-2.5">
              <SectionLabel right={<Link to="/clean" className="whitespace-nowrap pl-2.5 text-[12.5px] font-semibold" style={{ color: TEAL }}>All</Link>}>Deep-clean guides</SectionLabel>
              <div className="divide-y divide-[var(--hh-line)] overflow-hidden rounded-2xl shadow-[0_1px_2px_rgba(15,23,42,0.04)]" style={{ background: "var(--hh-surface)" }}>
                {cleaningGuides.map((g) => (
                  <Link key={g.id} to={g.itemUnitId ? `/clean/${g.itemUnitId}` : "/clean"} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-[10px]" style={{ background: "var(--hh-teal-wash)" }}>
                      <SprayCanIcon className="size-[18px]" style={{ color: TEAL }} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[14.5px] font-semibold tracking-[-0.2px]" style={{ color: INK }}>{g.title}</div>
                      {g.estimatedMinutes != null && <div className="text-[12.5px]" style={{ color: SUB }}>{g.estimatedMinutes} min guide</div>}
                    </div>
                    <ChevronRightIcon className="size-[18px] text-[#94A3B8]" />
                  </Link>
                ))}
              </div>
            </div>
          ) : (
            <EntryCard d={d} icon={SprayCanIcon} label="Deep-clean guides" sub="Guided room-by-room cleaning" to="/clean" />
          )
        )}

        <div className="h-1" />
      </div>
    </div>
  )
}
