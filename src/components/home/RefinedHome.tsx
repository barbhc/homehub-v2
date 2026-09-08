import { useState } from "react"
import { Link } from "react-router-dom"
import {
  SparklesIcon,
  ArrowUpIcon,
  ChevronUpIcon,
  WrenchIcon,
  BookOpenIcon,
  HomeIcon,
  ChevronDownIcon,
} from "lucide-react"
import type { DashboardTask, ExpiringWarrantyItem, MaintenanceTaskFull } from "@/lib/dashboard"
import type { DeepCleanGuide } from "@/lib/cleanSession"
import type { UserLevel } from "@/hooks/useUserLevel"
import { dens, greeting, shortDate } from "@/lib/redesign/tokens"
import { ThisWeekList, TimelyWarrantyLine } from "@/components/home/ThisWeekList"
import { useDisplayName } from "@/hooks/useDisplayName"

// Calm palette (design/hh-home2.jsx)
const INK = "var(--hh-ink)", SUB = "var(--hh-sub)", TEAL = "var(--hh-teal)", BG = "var(--hh-bg)"
const LINE = "var(--hh-line)"

function AskModule({ d }: { d: ReturnType<typeof dens> }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="overflow-hidden rounded-[18px] border border-[var(--hh-line2)] shadow-[0_1px_2px_rgba(15,23,42,0.04)]" style={{ background: "var(--hh-surface)" }}>
      <div className="flex items-center gap-2.5 py-2 pl-4 pr-2">
        <SparklesIcon className="size-[17px] shrink-0" style={{ color: TEAL }} />
        <Link to="/chat" className="flex-1 text-[15px]" style={{ color: "var(--hh-sub)" }}>
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

// ── Screen ────────────────────────────────────────────────────────────────────
export function RefinedHome({
  tasks,
  upcoming,
  nextUp = null,
  warranties,
  homeId,
  homeName,
  onSelectHome,
  completingId,
  onComplete,
  onSnooze,
  density = "cozy",
}: {
  tasks: DashboardTask[]
  /** Forward schedule for the Coming-up drawer. */
  upcoming: MaintenanceTaskFull[]
  nextUp?: { dueDate: string; windowStart: string } | null
  briefingReady?: boolean
  warranties: ExpiringWarrantyItem[]
  cleaningGuides?: DeepCleanGuide[]
  level: UserLevel
  homeId: string | null
  /** Shown under the greeting so a shared-home member knows where they are. */
  homeName?: string | null
  /** Makes the home name a pill that opens the switcher. Absent = plain text. */
  onSelectHome?: () => void
  completingId: string | null
  onComplete: (id: string) => void
  onSnooze: (id: string) => void
  density?: "spacious" | "cozy" | "compact"
}) {
  const d = dens(density)
  // Was the literal string "Barb". A tester's very first impression of the app
  // was being greeted by its author's name; drop the name entirely when we
  // don't know it rather than guessing.
  const { firstName } = useDisplayName()


  return (
    <div className="flex min-h-full flex-col" style={{ background: BG }}>
      {/* Compact header */}
      <div className="flex items-baseline justify-between px-5 pt-3" style={{ paddingInline: d.pad }}>
        <span className="min-w-0">
          <span className="block text-[19px] font-extrabold tracking-[-0.4px]" style={{ color: INK }}>
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
                className="mt-0.5 flex max-w-full items-center gap-1 rounded-full border px-2 py-[3px] text-[12px]"
                style={{ borderColor: LINE, background: "var(--hh-surface)", color: SUB }}
              >
                <HomeIcon className="size-3 shrink-0" style={{ color: TEAL }} aria-hidden />
                <span className="truncate">{homeName}</span>
                <ChevronDownIcon className="size-3 shrink-0" aria-hidden />
              </button>
            ) : (
              <span className="block truncate text-[12.5px]" style={{ color: SUB }}>{homeName}</span>
            ))}
        </span>
        <span className="text-[12.5px] font-semibold" style={{ color: SUB }}>{shortDate(0)}</span>
      </div>

      <div className="flex flex-1 flex-col px-5 pt-4" style={{ paddingInline: d.pad, gap: d.stack }}>
        <AskModule d={d} />

        {/* Home, focused (design/home-focus.md, owner 2026-09-08): ONE list —
            the week, first task open — where the hero, the stat band, the
            Coming-up drawer and the reminders section each showed the same
            tasks. Below it only what is timely. */}
        <ThisWeekList
          homeId={homeId}
          tasks={tasks}
          upcoming={upcoming}
          nextUp={nextUp}
          completingId={completingId}
          onComplete={onComplete}
          onSnooze={onSnooze}
        />
        <TimelyWarrantyLine warranties={warranties} />
        <div className="h-1" />
      </div>
    </div>
  )
}
