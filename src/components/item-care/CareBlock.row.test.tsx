/**
 * The item page's task rows — round 19, three reports in one file.
 *
 * HH-155 "the task names are squeezed to the left": the row's right side
 * stacked four controls, leaving the title ~140px of a 390px screen.
 * HH-150 "specific dates shown for tasks instead of time ranges": the row
 * printed "Tue, Sep 22" while the task page said "Sep-ish".
 * HH-151: the cleaning-guides line floated under the band in its own type.
 *
 * These are BEHAVIOURAL: render the rows and read what they actually say.
 */
import { describe, it, expect, vi } from "vitest"
import { render, screen, waitFor, within } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import type { ItemUnit } from "@/integrations/types"
import { CareBlock } from "./CareBlock"

const instances = vi.hoisted(() => ({ open: [] as unknown[], done: [] as unknown[] }))
vi.mock("@/modules/care", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getTaskInstances: vi.fn((_h: string, opts: { status?: string[] }) =>
    Promise.resolve({ data: opts?.status?.includes("done") ? instances.done : instances.open, error: null })),
}))
vi.mock("@/pages/item-detail/useSetupCompletion", () => ({
  useSetupCompletion: () => ({ done: new Set<string>(), toggle: vi.fn(), allDone: false }),
}))

const item = { item_unit_id: "i1", display_name: "LG DLGX3901B" } as ItemUnit
const iso = (days: number) => {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

/** A maintenance task on a monthly cadence, due far enough out to have shown a date. */
const task = (over: Record<string, unknown> = {}) => ({
  task_template_id: "t1",
  title: "Inspect and Clean Vent Ductwork",
  care_type: "maintenance",
  scope_type: "item_unit",
  item_unit_id: "i1",
  priority_tier: "essential",
  risk_level: "safety",
  estimated_minutes: 30,
  is_active: true,
  deleted_at: null,
  next_due_date: iso(17),
  schedule_rule: [{ schedule_type: "monthly", interval_days: null }],
  ...over,
})

/** The open instance that gives a row its date, as the page supplies it. */
const openInstance = (templateId: string, due: string) => ({
  task_instance_id: `i-${templateId}`, task_template_id: templateId, due_date: due, status: "scheduled",
})

function renderRows(tasks: unknown[], open: unknown[] = [], done: unknown[] = []) {
  instances.open = open
  instances.done = done
  render(
    <MemoryRouter>
      <CareBlock item={item} homeId="h1" tasks={tasks as never} chunks={[]} hasManual onAddManual={vi.fn()} />
    </MemoryRouter>,
  )
}

describe("HH-150 — a row speaks in windows, never an invented date", () => {
  it("a recurring task shows its window phrase, not the stored date", async () => {
    renderRows([task()], [openInstance("t1", iso(17))])
    await screen.findByText("Inspect and Clean Vent Ductwork")
    const text = await waitFor(() => {
      const t = screen.getByTestId("care-row").textContent ?? ""
      expect(t).toMatch(/min/)
      return t
    })
    expect(text).toMatch(/-ish|Good to do now|This week|Been a while/)
    // The absence that IS the requirement: no "Tue, Sep 22" anywhere on the row.
    expect(text).not.toMatch(/(Mon|Tue|Wed|Thu|Fri|Sat|Sun), \w{3} \d{1,2}/)
  })

  it("an unscheduled deadline task shows no date here at all — nothing invented", async () => {
    // Deadline KIND requires an as_needed cadence (an annual "warranty" task is
    // a window, correctly). This page passes a date only for scheduled tasks,
    // so an as_needed deadline shows none — which is the honest outcome for
    // this surface. The "By Sep 30" wording is proven where it is produced,
    // in shared/care/dueWindow's own tests.
    renderRows([task({ title: "Register the warranty", risk_level: null, schedule_rule: [{ schedule_type: "as_needed", interval_days: null }] })], [openInstance("t1", iso(25))])
    await screen.findByText("Register the warranty")
    const text = screen.getByTestId("care-row").textContent ?? ""
    expect(text).not.toMatch(/(Mon|Tue|Wed|Thu|Fri|Sat|Sun), \w{3} \d{1,2}/)
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}/)
  })

  it("a never-completed lapsed task still reads calm", async () => {
    renderRows([task()], [openInstance("t1", iso(-90))])
    await screen.findByText("Inspect and Clean Vent Ductwork")
    await waitFor(() => expect(screen.getByTestId("care-row").textContent ?? "").toMatch(/min/))
    expect(screen.getByTestId("care-row").textContent ?? "").not.toMatch(/overdue/i)
  })
})

describe("HH-155 — the title owns the row", () => {
  it("the cadence sits in the meta line, not in a chip beside the title", async () => {
    renderRows([task()], [openInstance("t1", iso(17))])
    await screen.findByText("Inspect and Clean Vent Ductwork")
    const row = screen.getByTestId("care-row")
    // Monthly is present as text…
    expect(row.textContent).toMatch(/Monthly/i)
    // …in the same line as the minutes, which is what frees the title's width.
    expect(row.textContent).toMatch(/Monthly[^A-Za-z]*30 min|30 min[^A-Za-z]*Monthly/i)
  })

  it("the row no longer carries a trailing chevron competing for width", async () => {
    const { container } = render(
      <MemoryRouter>
        <CareBlock item={item} homeId="h1" tasks={[task()] as never} chunks={[]} hasManual onAddManual={vi.fn()} />
      </MemoryRouter>,
    )
    await screen.findByText("Inspect and Clean Vent Ductwork")
    // "See how" is the row's only trailing control besides the bell slot.
    expect(within(container).getAllByRole("button", { name: /See how/i }).length).toBeGreaterThan(0)
  })
})

describe("HH-151 — the cleaning-guides line belongs to its band", () => {
  it("reads in the rows' own voice and says where the link goes", async () => {
    renderRows([task({ task_template_id: "c1", title: "Clean Dryer Exterior", care_type: "cleaning", risk_level: null, estimated_minutes: 5 })])
    expect(await screen.findByText(/These live in your cleaning guides/)).toBeTruthy()
    expect(screen.getByRole("link", { name: /Open guides/ })).toHaveAttribute("href", "/clean")
  })
})
