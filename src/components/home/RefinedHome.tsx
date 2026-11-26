import type { ReactNode } from "react"
import { Link } from "react-router-dom"
import { HomeIcon, ChevronDownIcon } from "lucide-react"
import type { DashboardTask, ExpiringWarrantyItem, HomeNotices, MaintenanceTaskFull } from "@/lib/dashboard"
import type { DeepCleanGuide } from "@/lib/cleanSession"
import type { UserLevel } from "@/hooks/useUserLevel"
import { dens, greeting, shortDate } from "@/lib/redesign/tokens"
import type { ComingUp as ComingUpLine } from "@/lib/homeWeek"
import type { AskStarter } from "../../../shared/care/dayOne"
import { useDisplayName } from "@/hooks/useDisplayName"
import { useScanTray } from "@/components/manuals/scanStatus"
import { AskField, ComingUp, HeadsUp, HomeLoadNote, NextUp, PinchAndPinned, type HomeExtras } from "@/components/home/HomeSections"

// Calm palette (design/hh-home2.jsx)
const INK = "var(--hh-ink)", SUB = "var(--hh-sub)", TEAL = "var(--hh-teal)", BG = "var(--hh-bg)"
const LINE = "var(--hh-line)"

/** Two questions this home would ask now — each opens Ask with it sent (design/day-one-home.md). */
export function AskStarters({ starters }: { starters: AskStarter[] }) {
  return (
    <div className="mt-2.5 flex flex-wrap gap-2" data-testid="ask-starters">
      {starters.map((s) => (
        <Link
          key={s.question}
          to={`/chat?q=${encodeURIComponent(s.question)}`}
          className="inline-flex min-h-9 items-center rounded-full border px-3 text-[0.8125rem] font-medium"
          style={{ borderColor: "var(--hh-line2)", background: "var(--hh-surface)", color: INK }}
        >
          {s.label}
        </Link>
      ))}
    </div>
  )
}

// ── Screen ────────────────────────────────────────────────────────────────────
export function RefinedHome({
  tasks,
  upcoming,
  nextUp = null,
  comingUp = null,
  askStarters = [],
  warranties,
  notices,
  extras,
  onRetryExtras,
  nextStep,
  belowNextUp,
  setupRow,
  homeId,
  homeName,
  onSelectHome,
  completingId,
  actionError = null,
  onComplete,
  onSnooze,
  density = "cozy",
}: {
  tasks: DashboardTask[]
  /** Forward schedule: the week's rest and Coming up. */
  upcoming: MaintenanceTaskFull[]
  /** Kept for callers; Home now derives "next" from `upcoming` (design/home-next.md). */
  nextUp?: { dueDate: string; windowStart: string } | null
  comingUp?: ComingUpLine | null
  /** Starter questions under the Ask bar, for an early home (design/day-one-home.md). */
  askStarters?: AskStarter[]
  warranties: ExpiringWarrantyItem[]
  /** Recalls for Heads up. */
  notices: HomeNotices
  /** Whether this home's recalls, warranties and schedule have loaded, and what failed. */
  extras: HomeExtras
  onRetryExtras: () => void
  /** The one next-step card (What's in your home? / This month at your home), placed after Coming up. */
  nextStep?: ReactNode
  /** One row under Next up: "Add your zip" when the home has none (mock m5). */
  belowNextUp?: ReactNode
  /** An empty home after Not now (mock m3): this row stands in Next up's place,
   *  and only In a pinch follows — no Next up, Coming up or "All quiet". */
  setupRow?: ReactNode
  cleaningGuides?: DeepCleanGuide[]
  level: UserLevel
  homeId: string | null
  /** Shown under the greeting so a shared-home member knows where they are. */
  homeName?: string | null
  /** Makes the home name a pill that opens the switcher. Absent = plain text. */
  onSelectHome?: () => void
  completingId: string | null
  /** A refused check-off or snooze, shown on its row (HomeSections NextUp). */
  actionError?: { id: string; message: string } | null
  onComplete: (id: string) => void
  onSnooze: (id: string) => void
  density?: "spacious" | "cozy" | "compact"
}) {
  const d = dens(density)
  // Was the literal string "Barb". A tester's very first impression of the app
  // was being greeted by its author's name; drop the name entirely when we
  // don't know it rather than guessing.
  const { firstName } = useDisplayName()
  const tray = useScanTray()


  return (
    <div className="flex min-h-full flex-col" style={{ background: BG }}>
      {/* Compact header */}
      <div className="flex items-baseline justify-between px-5 pt-3" style={{ paddingInline: d.pad }}>
        <span className="min-w-0">
          <span className="block text-[1.1875rem] font-extrabold tracking-[-0.4px]" style={{ color: INK }}>
            {firstName ? `${greeting()}, ${firstName}` : greeting()}
          </span>
          {/* A tester signed in and found tasks and items he had never added,
              with nothing on screen to explain that he had joined someone
              else's home. Naming the home answers "whose data is this?" before
              the question turns into alarm. */}
          {homeName &&
            (onSelectHome ? (
              // Tappable once there is somewhere to go: this line is the only
              // place the current home is named, so it has to be where you
              // discover switching and adding.
              <button
                type="button"
                onClick={onSelectHome}
                className="hit-44 mt-0.5 flex max-w-full items-center gap-1 rounded-full border px-2 py-[3px] text-[0.75rem]"
                style={{ borderColor: LINE, background: "var(--hh-surface)", color: SUB }}
              >
                <HomeIcon className="size-3 shrink-0" style={{ color: TEAL }} aria-hidden />
                <span className="truncate">{homeName}</span>
                <ChevronDownIcon className="size-3 shrink-0" aria-hidden />
              </button>
            ) : (
              <span className="block truncate text-[0.78125rem]" style={{ color: SUB }}>{homeName}</span>
            ))}
        </span>
        <span className="text-[0.78125rem] font-semibold" style={{ color: SUB }}>{shortDate(0)}</span>
      </div>

      <div className="flex flex-1 flex-col px-5 pb-6 pt-4" style={{ paddingInline: d.pad, gap: 24 }}>
        <div>
          <AskField />
          {askStarters.length > 0 && <AskStarters starters={askStarters} />}
        </div>
        {setupRow ? (
          <>
            {setupRow}
            {homeId && <PinchAndPinned homeId={homeId} tree="phone" />}
          </>
        ) : (
          <>
        {/* Home, next (design/home-next.md, owner 2026-11-21): one task, then
            only what the Tasks tab can't show. Each section hides when it has
            nothing to say, except In a pinch, which is fixed. */}
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
        <HomeLoadNote extras={extras} onRetry={onRetryExtras} />
        <HeadsUp recalls={notices.recalls} ready={tray.ready} warranties={warranties} extras={extras} />
        <ComingUp tasks={tasks} upcoming={upcoming} forecast={comingUp} extras={extras} />
        {nextStep}
        {homeId && <PinchAndPinned homeId={homeId} tree="phone" />}
          </>
        )}
      </div>
    </div>
  )
}
