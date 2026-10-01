/**
 * The item page's setup checklist, when a read or a tick fails (audit H6).
 *
 * Both were swallowed: a failed read rendered every step unchecked ("nothing
 * done yet", as if known) and still offered "It's already installed", and a
 * tick the server refused simply didn't take, with nothing said.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import type { ItemUnit } from "@/integrations/types"

const fs = vi.hoisted(() => ({ getDocs: vi.fn() }))
const care = vi.hoisted(() => ({ logTaskCompletion: vi.fn() }))

vi.mock("firebase/firestore", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getDocs: (...a: unknown[]) => fs.getDocs(...a),
}))
vi.mock("@/modules/care", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getTaskInstances: vi.fn(async () => ({ data: [], error: null })),
  logTaskCompletion: (...a: unknown[]) => care.logTaskCompletion(...a),
}))

const { CareBlock } = await import("./CareBlock")

// Opened before: the Setup band renders open.
const item = { item_unit_id: "i1", display_name: "Bosch Dishwasher", setup_revealed_at: "2026-01-01T00:00:00Z" } as ItemUnit
const setupTask = {
  task_template_id: "s1",
  title: "Level the dishwasher",
  care_type: "maintenance",
  scope_type: "item_unit",
  item_unit_id: "i1",
  priority_tier: "recommended",
  risk_level: "performance",
  estimated_minutes: 10,
  is_active: true,
  deleted_at: null,
  next_due_date: null,
  schedule_rule: [{ schedule_type: "setup", interval_days: null }],
}

const empty = { docs: [], empty: true, size: 0, metadata: { fromCache: false, hasPendingWrites: false }, forEach: () => {} }

beforeEach(() => {
  vi.clearAllMocks()
  fs.getDocs.mockResolvedValue(empty)
  care.logTaskCompletion.mockResolvedValue({ data: { task_instance_id: "done-1" }, error: null })
})

function renderBlock() {
  render(
    <MemoryRouter>
      <CareBlock item={item} homeId="h1" tasks={[setupTask] as never} chunks={[]} hasManual notificationsBlocked={false} onAddManual={vi.fn()} />
    </MemoryRouter>,
  )
}

describe("setup checklist — failures are said", () => {
  it("a tick the server refuses stays unticked and says so", async () => {
    care.logTaskCompletion.mockResolvedValue({ data: null, error: { message: "permission-denied" } })
    renderBlock()

    fireEvent.click(await screen.findByRole("button", { name: "Mark done" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't update that step.")
    expect(screen.getByRole("button", { name: "Mark done" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Mark not done" })).toBeNull()
  })

  it("steps that could not be read say so, and 'It's already installed' is not offered over a guess", async () => {
    fs.getDocs.mockRejectedValueOnce(new Error("unavailable"))
    renderBlock()

    expect(await screen.findByText("Couldn't load which steps are done.")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "It's already installed" })).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    await waitFor(() => expect(screen.queryByText("Couldn't load which steps are done.")).toBeNull())
    expect(screen.getByRole("button", { name: "It's already installed" })).toBeInTheDocument()
  })
})
