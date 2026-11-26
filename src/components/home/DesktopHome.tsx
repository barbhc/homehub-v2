import type { ReactNode } from "react"
import { Link } from "react-router-dom"
import { SparklesIcon } from "lucide-react"
import type { DashboardTask, ExpiringWarrantyItem, HomeNotices, MaintenanceTaskFull } from "@/lib/dashboard"
import type { DeepCleanGuide } from "@/lib/cleanSession"
import type { UserLevel } from "@/hooks/useUserLevel"
import { greeting } from "@/lib/redesign/tokens"
import { ComingUp, HeadsUp, HomeLoadNote, NextUp, PinchAndPinned, type HomeExtras } from "@/components/home/HomeSections"
import { useScanTray } from "@/components/manuals/scanStatus"
import type { ComingUp as ComingUpLine } from "@/lib/homeWeek"
import type { AskStarter } from "../../../shared/care/dayOne"
import { AskStarters } from "@/components/home/RefinedHome"
import { useDisplayName } from "@/hooks/useDisplayName"

const INK = "var(--hh-ink)", TEAL = "var(--hh-teal)"

/** Signed day offset for a task (negative = overdue) — WeekStrip's dot maths. */

/** Item chip glyph, used by the "add details" nudge. */

function fullToday(): string {
  return new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
}

export function DesktopHome({
  tasks, upcoming, nextUp = null, comingUp = null, askStarters = [], warranties, notices, extras, onRetryExtras, homeId, completingId, actionError = null, onComplete, onSnooze, nextStep, belowNextUp, setupRow,
}: {
  tasks: DashboardTask[]
  /** Forward schedule for the Coming-up drawer. */
  upcoming: MaintenanceTaskFull[]
  nextUp?: { dueDate: string; windowStart: string } | null
  comingUp?: ComingUpLine | null
  askStarters?: AskStarter[]
  warranties: ExpiringWarrantyItem[]
  notices: HomeNotices
  /** Whether this home's recalls, warranties and schedule have loaded, and what failed. */
  extras: HomeExtras
  onRetryExtras: () => void
  cleaningGuides: DeepCleanGuide[]
  level: UserLevel
  homeId: string | null
  completingId: string | null
  /** A refused check-off or snooze, shown on its row (HomeSections NextUp). */
  actionError?: { id: string; message: string } | null
  onComplete: (id: string) => void
  onSnooze: (id: string) => void
  /** The one next step under the week, when Home has one (a home with tasks but no items: Snap a label). */
  nextStep?: ReactNode
  /** One row under Next up: "Add your zip" when the home has none (mock m5). */
  belowNextUp?: ReactNode
  /** An empty home after Not now (mock m3): this row stands in Next up's place,
   *  and only In a pinch follows. */
  setupRow?: ReactNode
}) {
  const { firstName } = useDisplayName()

  const tray = useScanTray()

  return (
    // Break out of the page's narrower max-w-5xl wrapper and re-center the Home
    // content at 1180px with the redesign's padding (spec #1).
    <div className="mx-[calc(50%-50vw)] w-screen">
      <div className="mx-auto w-full max-w-[1180px] px-7 pb-10 pt-[26px]">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[0.78125rem] font-bold uppercase tracking-[0.5px]" style={{ color: TEAL }}>{fullToday()}</div>
            <h1 className="mt-1 whitespace-nowrap text-[1.75rem] font-extrabold leading-[1.15] tracking-[-0.7px]" style={{ color: INK }}>{firstName ? `${greeting()}, ${firstName}` : greeting()}</h1>
          </div>
          <Link to="/chat" className="inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2.5 text-[0.875rem] font-bold text-white" style={{ background: "var(--hh-teal-fill)" }}>
            <SparklesIcon className="size-[17px]" /> Ask Homehub
          </Link>
        </div>
        {askStarters.length > 0 && <div className="-mt-1.5 mb-5 flex justify-end"><AskStarters starters={askStarters} /></div>}

        {/* Home, next (design/home-next.md): the same sections as the phone,
            in two columns — the day's task and what's ahead on the left, what
            to know and what to reach for on the right. */}
        <div className="grid items-start gap-[22px] lg:grid-cols-[minmax(0,1.6fr)_minmax(300px,1fr)]">
          {setupRow ? (
            <div className="flex flex-col gap-6 [&_[data-testid=empty-home-collapsed]]:ml-0">{setupRow}</div>
          ) : (
          <div className="flex flex-col gap-6">
            <NextUp
              homeId={homeId}
              tasks={tasks}
              upcoming={upcoming}
              nextUp={nextUp}
              extras={extras}
              completingId={completingId}
              actionError={actionError}
              onComplete={onComplete}
              onSnooze={onSnooze}
            />
            {belowNextUp}
            <ComingUp tasks={tasks} upcoming={upcoming} forecast={comingUp} extras={extras} />
            {nextStep && <div className="max-w-xl">{nextStep}</div>}
          </div>
          )}
          <div className="flex flex-col gap-6">
            {!setupRow && <HomeLoadNote extras={extras} onRetry={onRetryExtras} />}
            {!setupRow && <HeadsUp recalls={notices.recalls} ready={tray.ready} warranties={warranties} extras={extras} />}
            {homeId && <PinchAndPinned homeId={homeId} tree="desktop" />}
          </div>
        </div>
      </div>
    </div>
  )
}
