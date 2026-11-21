import { Link } from "react-router-dom"
import { ChevronRightIcon, HomeIcon } from "lucide-react"
import type { CareNote } from "@/integrations/types"
import { notesSummary } from "@/lib/notes"

const INK = "var(--hh-ink)", SUB = "var(--hh-sub)", FAINT = "var(--hh-faint)", TEAL = "var(--hh-teal)", CLAY = "var(--hh-clay)"

/**
 * The top of Items: the house's own notes — shutoffs, breakers, paint — the
 * things that belong to no single item (owner's pick, 2026-09-27). It is the
 * one notes door on Items: room notes are reached from House notes' "By room"
 * list, not from each room heading (owner, 2026-11-21).
 */
export function HouseNotesCard({ notes, error }: { notes: CareNote[] | null; error: string | null }) {
  const house = (notes ?? []).filter((n) => n.scope === "home")
  const line = error
    ? "Couldn't load notes — open to try again"
    : notes === null
      ? "Loading…"
      : notesSummary(house) ?? "Shutoffs, breakers, paint colors and more"
  return (
    <Link
      to="/inventory/notes"
      data-testid="house-notes-card"
      className="flex items-center gap-3 rounded-2xl px-3.5 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.05)]"
      style={{ background: "var(--hh-surface)" }}
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl" style={{ background: "var(--hh-teal-wash)" }}>
        <HomeIcon className="size-[18px]" style={{ color: TEAL }} aria-hidden />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[0.90625rem] font-bold tracking-[-0.2px]" style={{ color: INK }}>
          House notes{house.length > 0 && <span className="font-semibold" style={{ color: FAINT }}> · {house.length}</span>}
        </span>
        <span className="truncate text-[0.78125rem]" style={{ color: error ? CLAY : SUB }}>{line}</span>
      </span>
      <ChevronRightIcon className="size-[18px] shrink-0 text-[var(--hh-icon-faint)]" aria-hidden />
    </Link>
  )
}
