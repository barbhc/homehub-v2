/**
 * Deep Clean's expanded task row under the owner's standing rule: a homeowner
 * is never shown DIY steps for gas, combustion or live electrical work. A
 * hazardous row shows "Leave this to a licensed professional" and NOT its steps
 * (not rendered); a DIY row still shows them.
 */
import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import type { CleanTask } from "@/lib/cleanSession"

vi.mock("@/modules/home", () => ({ useCurrentHome: () => ({ home: { home_id: "h1" } }) }))
vi.mock("@/modules/care", () => ({ markTaskInstanceDone: vi.fn() }))

const { CleanTaskRow } = await import("./DeepClean")

const GAS_STEPS = ["Turn the gas valve to OFF before you start.", "Lift out the burner assembly."]
const DIY_STEPS = ["Pull out the filter from the base.", "Rinse it under warm running water."]

const clean = (title: string, steps: string[]): CleanTask => ({
  id: title, source: "instance", title, description: null,
  instructions: steps.map((s, i) => `${i + 1}. ${s}`).join("\n"),
  itemUnitId: null, itemName: null, roomId: null, roomName: null, dueDate: null,
  estimatedMinutes: 10, scheduleType: "monthly", lastCompletedDate: null, staleDays: 0,
  priorityScore: 0, isOverdue: false,
})

const renderRow = (t: CleanTask) =>
  render(
    <MemoryRouter>
      <CleanTaskRow task={t} checked={false} onToggle={vi.fn()} expanded onExpand={vi.fn()} />
    </MemoryRouter>,
  )

describe("Deep Clean row — hazardous work never shows DIY steps", () => {
  it("a hazardous task shows the pro notice and NOT its steps", () => {
    // Hazardous by its title alone (burner assembly), and its steps work the gas valve.
    renderRow(clean("Remove and clean the oven burner assembly", GAS_STEPS))
    expect(screen.getByText("Leave this to a licensed professional")).toBeInTheDocument()
    for (const s of GAS_STEPS) expect(screen.queryByText(s)).toBeNull()
  })

  it("a DIY task still shows its steps", () => {
    renderRow(clean("Clean the dishwasher filter", DIY_STEPS))
    for (const s of DIY_STEPS) expect(screen.getByText(s)).toBeInTheDocument()
    expect(screen.queryByText("Leave this to a licensed professional")).toBeNull()
  })
})
