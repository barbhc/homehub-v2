import { useState } from "react"
import { Link } from "react-router-dom"
import {
  SparklesIcon,
  ArrowUpIcon,
  ChevronUpIcon,
  ChevronRightIcon,
  ArrowRightIcon,
  WrenchIcon,
  BookOpenIcon,
  RepeatIcon,
  ShieldCheckIcon,
  SprayCanIcon,
  HomeIcon,
  ChevronDownIcon,
} from "lucide-react"
import type { DashboardTask, ExpiringWarrantyItem, MaintenanceTaskFull } from "@/lib/dashboard"
import type { DeepCleanGuide } from "@/lib/cleanSession"
import type { UserLevel } from "@/hooks/useUserLevel"
import { dens, greeting, shortDate } from "@/lib/redesign/tokens"
import { HomeComposed } from "@/components/home/HomeComposed"
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

// Calm inline reveal below the hero — real data only (Why + meta + notes +
// Open-full-view). No fabricated steps/supplies/manual: TaskDetail carries no
// such structured fields, so the panel shows only what exists.
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
        <ShieldCheckIcon className="size-[18px]" style={{ color: "var(--hh-gold)" }} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-0.5 text-[10.5px] font-bold uppercase tracking-[0.5px]" style={{ color: "var(--hh-gold)" }}>Warranty</div>
        <div className="text-[15px] font-bold tracking-[-0.2px]" style={{ color: INK }}>{w.display_name}</div>
        <div className="mt-0.5 text-[13px] leading-snug" style={{ color: "#5A6863" }}>
          Warranty ends in {w.days_remaining} day{w.days_remaining === 1 ? "" : "s"}
        </div>
        <span className="mt-2.5 inline-flex items-center gap-1 text-[13px] font-bold" style={{ color: "var(--hh-gold)" }}>
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
  upcoming,
  nextUp = null,
  briefingReady = true,
  warranties,
  cleaningGuides = [],
  level,
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
  const showClean = level === "power"
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

        {/* The composed top (design round 4): stateful hero + Coming-up drawer +
            on-demand briefing. Replaces the urgent-card stack, the "You're all
            caught up" dead end, and the pinned Home-upkeep row — home-scoped
            tasks now live in the Tasks page's "Whole home" group. */}
        <HomeComposed
          tasks={tasks}
          upcoming={upcoming}
          nextUp={nextUp}
          briefingReady={briefingReady}
          homeId={homeId}
          completingId={completingId}
          onComplete={onComplete}
          onSnooze={onSnooze}
        />

        {/* Notices — warranties (timely, calm) */}
        {warranties.length > 0 && (
          <div className="flex flex-col gap-3" style={{ gap: d.gap }}>
            <SectionLabel
              right={
                <Link to="/warranties" className="whitespace-nowrap pl-2.5 text-[12.5px] font-semibold" style={{ color: "var(--hh-gold)" }}>
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
