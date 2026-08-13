import { Link } from "react-router-dom"
import {
  SparklesIcon, ChevronRightIcon, ArrowRightIcon, PackageIcon,
  ShieldCheckIcon, MegaphoneIcon, ReceiptIcon, SprayCanIcon,
} from "lucide-react"
import type { DashboardTask, ExpiringWarrantyItem, HomeNotices, MaintenanceTaskFull } from "@/lib/dashboard"
import type { DeepCleanGuide } from "@/lib/cleanSession"
import type { UserLevel } from "@/hooks/useUserLevel"
import { TIER, greeting, priorityTier } from "@/lib/redesign/tokens"
import { HomeComposed } from "@/components/home/HomeComposed"
import { useDisplayName } from "@/hooks/useDisplayName"

const INK = "var(--hh-ink)", SUB = "var(--hh-sub)", TEAL = "var(--hh-teal)", FAINT = "var(--hh-faint)"
const GOLD = "#9A7B3A"

/** Signed day offset for a task (negative = overdue) — WeekStrip's dot maths. */
function dueDays(t: DashboardTask): number {
  if (t.isOverdue && t.daysOverdue != null) return -t.daysOverdue
  return t.daysUntilDue ?? 0
}

/** Item chip glyph, used by the "add details" nudge. */
function Glyph({ size = 56, icon: Icon = PackageIcon }: { size?: number; icon?: typeof PackageIcon }) {
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-[12px]"
      style={{ width: size, height: size, background: "var(--hh-teal-wash)" }}
    >
      <Icon style={{ width: size * 0.45, height: size * 0.45, color: TEAL }} />
    </div>
  )
}

function fullToday(): string {
  return new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
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
  tasks, upcoming, warranties, notices, cleaningGuides, level, homeId, completingId, onComplete, onSnooze,
}: {
  tasks: DashboardTask[]
  /** Forward schedule for the Coming-up drawer. */
  upcoming: MaintenanceTaskFull[]
  warranties: ExpiringWarrantyItem[]
  notices: HomeNotices
  cleaningGuides: DeepCleanGuide[]
  level: UserLevel
  homeId: string | null
  completingId: string | null
  onComplete: (id: string) => void
  onSnooze: (id: string) => void
}) {
  const showClean = level === "power"
  const { firstName } = useDisplayName()

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
            <h1 className="mt-1 whitespace-nowrap text-[28px] font-extrabold leading-[1.15] tracking-[-0.7px]" style={{ color: INK }}>{firstName ? `${greeting()}, ${firstName}` : greeting()}</h1>
          </div>
          <Link to="/chat" className="inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2.5 text-[14px] font-bold text-white" style={{ background: TEAL }}>
            <SparklesIcon className="size-[17px]" /> Ask Homehub
          </Link>
        </div>

        <div className="grid items-start gap-[22px] lg:grid-cols-[minmax(0,1.85fr)_minmax(280px,1fr)]">
          {/* Main column — leads with Your Focus; the task counts moved to the
              side-rail "Tasks" card so the focus card wins the eye (spec #1). */}
          <div className="flex flex-col gap-[22px]">
            {/* The composed top (design rounds 1-4), same component as mobile at
                the desktop scale — one source of truth so the two can't drift
                the way the Tasks header did. Replaces the focus card, the
                agenda, the "You're all caught up" dead end, and the Home-upkeep
                list (whose rows already appear here and in the drawer: they are
                agenda-eligible, so that card was duplication, not unique data). */}
            <HomeComposed
              variant="desktop"
              tasks={tasks}
              upcoming={upcoming}
              homeId={homeId}
              completingId={completingId}
              onComplete={onComplete}
              onSnooze={onSnooze}
            />
          </div>

          {/* Side rail */}
          <div className="flex flex-col gap-[18px]">
            {/* The "Tasks" counts card that stood here is gone: the hero's stat
                band says the same thing better — it's clickable, and its zero
                is honest rather than decorative. Two near-identical count
                blocks on one page was the crowding we spent this week removing. */}

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
