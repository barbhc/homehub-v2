/**
 * HH-161 — Upkeep carries the read, and after Save it says where the upkeep
 * lives. Each case is a "must be true" line from the approved mock
 * (design/mocks/scan-indicator), rendered and read the way a person reads it.
 */
import { describe, it, expect, vi } from "vitest"
import { render, screen, within } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import type { ItemUnit } from "@/integrations/types"
import type { ManualReading } from "@/lib/manualReviewState"
import { SCAN_KEEPS_GOING_SHORT } from "@/lib/scanCopy"
import { CareBlock } from "./CareBlock"

vi.mock("@/modules/care", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getTaskInstances: vi.fn().mockResolvedValue({ data: [], error: null }),
}))
vi.mock("@/pages/item-detail/useSetupCompletion", () => ({
  useSetupCompletion: () => ({ isDone: () => false, loadingIds: new Set<string>(), doneCount: 0, toggleDone: vi.fn(), markAllDone: vi.fn() }),
}))

const item = { item_unit_id: "i1", display_name: "Sharp microwave", setup_revealed_at: null } as unknown as ItemUnit

const task = (id: string, title: string, over: Record<string, unknown> = {}) => ({
  task_template_id: id, title, care_type: "cleaning", scope_type: "item_unit", item_unit_id: "i1",
  priority_tier: "recommended", risk_level: "performance", estimated_minutes: 5, is_active: true, deleted_at: null,
  schedule_rule: [{ schedule_type: "as_needed", interval_days: null }], ...over,
})

function renderCare(props: {
  tasks?: unknown[]; hasManual?: boolean; reading?: ManualReading | null; manualAwaitingReview?: boolean; notificationsBlocked?: boolean
}) {
  return render(
    <MemoryRouter>
      <CareBlock
        item={item}
        homeId="h1"
        tasks={(props.tasks ?? []) as never}
        chunks={[]}
        hasManual={props.hasManual ?? false}
        reading={props.reading ?? null}
        manualAwaitingReview={props.manualAwaitingReview}
        notificationsBlocked={props.notificationsBlocked ?? false}
        onAddManual={vi.fn()}
        m
      />
    </MemoryRouter>,
  )
}

describe("S1 — while the manual is read, Upkeep carries the read", () => {
  it("says 'Reading the manual', the worker's page count, the keeps-going line, and one rail that sweeps", () => {
    renderCare({ reading: { stage: "claude_call", pages: 42 } })
    expect(screen.getByText("Reading the manual")).toBeInTheDocument()
    expect(screen.getByText("42 pages")).toBeInTheDocument()
    expect(screen.getByText(new RegExp(`Pulling out care steps and schedules… ${SCAN_KEEPS_GOING_SHORT}`))).toBeInTheDocument()
    const rails = screen.getAllByRole("progressbar", { name: "Reading the manual" })
    expect(rails).toHaveLength(1)
    // Indeterminate: a sweep, never a fill — no value it cannot measure.
    expect(rails[0]).not.toHaveAttribute("aria-valuenow")
    expect(rails[0].firstElementChild).toHaveClass("hh-scanrail")
  })

  it("S1.2 — never 'No upkeep yet — add the manual', and no Add the manual button (not rendered)", () => {
    renderCare({ reading: { stage: "queued", pages: null } })
    expect(screen.queryByText(/No upkeep yet/)).toBeNull()
    expect(screen.queryByRole("button", { name: /Add the manual/ })).toBeNull()
  })

  it("S1.5 — the count is the worker's; before it has counted, there is none, never a guess or 'page N of M'", () => {
    renderCare({ reading: { stage: "started", pages: null } })
    expect(screen.queryByText(/pages?\b/)).toBeNull()
    expect(screen.queryByText(/page \d+ of/)).toBeNull()
    expect(document.body.textContent).not.toMatch(/\d+\s*%/)
  })

  it("a read parked for capacity says it is queued, not that it is being worked on (HH-132)", () => {
    renderCare({ reading: { stage: "awaiting_capacity", pages: null } })
    expect(screen.getByText(/Queued — it starts on its own\./)).toBeInTheDocument()
  })

  it("a read of a manual whose upkeep is already here: the same line, once, above the upkeep", () => {
    renderCare({
      hasManual: true,
      reading: { stage: "claude_call", pages: 42 },
      tasks: [task("t1", "Clean the filter", { care_type: "maintenance", schedule_rule: [{ schedule_type: "monthly", interval_days: null }] })],
    })
    expect(screen.getAllByText("Reading the manual")).toHaveLength(1)
    expect(screen.getByText("Clean the filter")).toBeInTheDocument()
  })
})

describe("S3c — after Save, a manual with no maintenance says where its upkeep lives", () => {
  const SAVED = [
    task("c1", "Wipe the drawer interior", { priority_tier: "optional", schedule_rule: [{ schedule_type: "weekly", interval_days: null }] }),
    // Essential AND on a cadence: the case that used to draw a bell the push
    // sweep never rings — item cleaning never notifies, whatever its tier.
    task("c2", "Clean the waveguide cover", { priority_tier: "essential", schedule_rule: [{ schedule_type: "monthly", interval_days: null }] }),
    task("c3", "Clean the door seals"),
    task("c4", "Wipe the control panel", { estimated_minutes: 2 }),
    task("s1", "Verify the drawer is grounded", { care_type: "maintenance", schedule_rule: [{ schedule_type: "setup", interval_days: null }] }),
    task("s2", "Level the drawer front", { care_type: "maintenance", schedule_rule: [{ schedule_type: "setup", interval_days: null }] }),
  ]

  it("S3c.2 — 'Nothing here goes into Tasks' and '4 cleaning tips and 2 setup steps live below.'", () => {
    renderCare({ hasManual: true, tasks: SAVED })
    const card = screen.getByTestId("upkeep-lives-here")
    expect(within(card).getByText("Nothing here goes into Tasks")).toBeInTheDocument()
    expect(within(card).getByText("4 cleaning tips and 2 setup steps live below.")).toBeInTheDocument()
  })

  it("S3c.1 — Cleaning (4, open) then Setup (2, closed, 'already installed?')", () => {
    renderCare({ hasManual: true, tasks: SAVED })
    const bands = screen.getAllByRole("button", { expanded: true }).concat(screen.getAllByRole("button", { expanded: false }))
      .filter((b) => /^(Cleaning|Setup)/.test(b.textContent ?? ""))
    const cleaning = bands.find((b) => b.textContent?.startsWith("Cleaning"))!
    const setup = bands.find((b) => b.textContent?.startsWith("Setup"))!
    expect(cleaning).toHaveAttribute("aria-expanded", "true")
    expect(cleaning.textContent).toContain("4")
    expect(setup).toHaveAttribute("aria-expanded", "false")
    expect(setup.textContent).toContain("already installed?")
    expect(setup.textContent).toContain("2")
    // Kind order: Cleaning comes before Setup on the page.
    expect(cleaning.compareDocumentPosition(setup) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it("S3c.3 — a row with a cadence shows it in its meta line", () => {
    renderCare({ hasManual: true, tasks: SAVED })
    const rows = screen.getAllByTestId("care-row").map((r) => r.textContent ?? "")
    expect(rows.find((t) => t.includes("Wipe the drawer interior"))).toMatch(/Weekly · 5 min · Deep Clean/)
    expect(rows.find((t) => t.includes("Clean the waveguide cover"))).toMatch(/Monthly · 5 min · Deep Clean/)
  })

  it("S3c.4 — no row shows a bell, not even an Essential cleaning job with a cadence", () => {
    renderCare({ hasManual: true, tasks: SAVED })
    expect(screen.queryAllByLabelText("Notifies you")).toHaveLength(0)
    expect(document.querySelectorAll("svg.lucide-bell-ring")).toHaveLength(0)
  })

  it("is not said when something here DOES go into Tasks", () => {
    renderCare({
      hasManual: true,
      tasks: [...SAVED, task("m1", "Clean the filter", { care_type: "maintenance", schedule_rule: [{ schedule_type: "monthly", interval_days: null }] })],
    })
    expect(screen.queryByTestId("upkeep-lives-here")).toBeNull()
  })
})

describe("the bell rule on the item page — only where it can ring", () => {
  const ESSENTIAL = task("m1", "Check the door seal", {
    care_type: "maintenance", priority_tier: "essential", schedule_rule: [{ schedule_type: "annual", interval_days: null }],
  })

  it("an Essential maintenance row on a cadence carries its bell", () => {
    renderCare({ hasManual: true, tasks: [ESSENTIAL] })
    expect(screen.getAllByLabelText("Notifies you")).toHaveLength(1)
  })

  it("on a phone that refused notifications, it carries none (round 18, HH-161 S5)", () => {
    renderCare({ hasManual: true, tasks: [ESSENTIAL], notificationsBlocked: true })
    expect(screen.queryAllByLabelText("Notifies you")).toHaveLength(0)
    expect(screen.getByText("Check the door seal")).toBeInTheDocument()
  })
})
