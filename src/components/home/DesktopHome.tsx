import { Link } from "react-router-dom"
import {
  SparklesIcon, ArrowRightIcon, MegaphoneIcon, } from "lucide-react"
import type { DashboardTask, ExpiringWarrantyItem, HomeNotices, MaintenanceTaskFull } from "@/lib/dashboard"
import type { DeepCleanGuide } from "@/lib/cleanSession"
import type { UserLevel } from "@/hooks/useUserLevel"
import { greeting } from "@/lib/redesign/tokens"
import { ThisWeekList, TimelyWarrantyLine } from "@/components/home/ThisWeekList"
import { timelyWarranty } from "@/lib/homeWeek"
import { useDisplayName } from "@/hooks/useDisplayName"

const INK = "var(--hh-ink)", SUB = "var(--hh-sub)", TEAL = "var(--hh-teal)"

/** Signed day offset for a task (negative = overdue) — WeekStrip's dot maths. */

/** Item chip glyph, used by the "add details" nudge. */

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





export function DesktopHome({
  tasks, upcoming, nextUp = null, warranties, notices, homeId, completingId, onComplete, onSnooze,
}: {
  tasks: DashboardTask[]
  /** Forward schedule for the Coming-up drawer. */
  upcoming: MaintenanceTaskFull[]
  nextUp?: { dueDate: string; windowStart: string } | null
  briefingReady?: boolean
  warranties: ExpiringWarrantyItem[]
  notices: HomeNotices
  cleaningGuides: DeepCleanGuide[]
  level: UserLevel
  homeId: string | null
  completingId: string | null
  onComplete: (id: string) => void
  onSnooze: (id: string) => void
}) {
  const { firstName } = useDisplayName()

  const railHasContent = notices.recalls.length > 0 || timelyWarranty(warranties) != null

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

        <div className={railHasContent ? "grid items-start gap-[22px] lg:grid-cols-[minmax(0,1.85fr)_minmax(280px,1fr)]" : "grid items-start gap-[22px]"}>
          {/* Main column — leads with Your Focus; the task counts moved to the
              side-rail "Tasks" card so the focus card wins the eye (spec #1). */}
          <div className="flex flex-col gap-[22px]">
            {/* Home, focused (design/home-focus.md): one list, first task open. */}
            <ThisWeekList
              variant="desktop"
              homeId={homeId}
              tasks={tasks}
              upcoming={upcoming}
              nextUp={nextUp}
              completingId={completingId}
              onComplete={onComplete}
              onSnooze={onSnooze}
            />
          </div>

          {/* Side rail — only what is timely: a recall on something you own,
              a warranty ending inside 60 days. Nothing standing. */}
          {railHasContent && (
            <div className="flex flex-col gap-[18px]">
              {notices.recalls.length > 0 && (
                <div>
                  <SectionLabel>Recall</SectionLabel>
                  <div className="flex flex-col gap-3">
                    {notices.recalls.map((r) => <RecallCard key={r.item_unit_id} recall={r} />)}
                  </div>
                </div>
              )}
              <TimelyWarrantyLine warranties={warranties} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
