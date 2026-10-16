/**
 * The item page's task row under the owner's standing rule: a homeowner is
 * never shown DIY steps for gas, combustion or live electrical work. Opening
 * "See how" on a hazardous task shows "Leave this to a licensed professional"
 * and NOT its steps (not rendered at all); a DIY task still shows its steps.
 */
import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import type { ItemUnit } from "@/integrations/types"
import { CareBlock } from "./CareBlock"

vi.mock("@/modules/care", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getTaskInstances: vi.fn(() => Promise.resolve({ data: [], error: null })),
}))
vi.mock("@/pages/item-detail/useSetupCompletion", () => ({
  useSetupCompletion: () => ({ done: new Set<string>(), toggle: vi.fn(), allDone: false }),
}))
vi.mock("./SupplyRows", () => ({ SupplyRows: () => null }))

const item = { item_unit_id: "i1", display_name: "York furnace" } as ItemUnit

const GAS_STEPS = ["Turn the gas valve to OFF and wait five minutes.", "Hold the pilot knob down and press the igniter."]
const DIY_STEPS = ["Switch the thermostat off at the wall.", "Slide the old filter out of the return grille."]

const task = (id: string, title: string, steps: string[]) => ({
  task_template_id: id,
  title,
  instructions_override: steps.map((s, i) => `${i + 1}. ${s}`).join("\n"),
  care_type: "maintenance",
  scope_type: "item_unit",
  item_unit_id: "i1",
  priority_tier: "recommended",
  risk_level: null,
  estimated_minutes: 15,
  is_active: true,
  deleted_at: null,
  schedule_rule: [{ schedule_type: "annual", interval_days: null }],
})

function openRow(t: ReturnType<typeof task>) {
  render(
    <MemoryRouter>
      <CareBlock item={item} homeId="h1" tasks={[t] as never} chunks={[]} hasManual notificationsBlocked={false} onAddManual={vi.fn()} />
    </MemoryRouter>,
  )
  fireEvent.click(screen.getByRole("button", { name: /See how/ }))
}

describe("CareBlock row — hazardous work never shows DIY steps", () => {
  it("a hazardous task shows the pro notice and NOT its steps", async () => {
    openRow(task("t-gas", "Relight the gas furnace pilot", GAS_STEPS))
    expect(await screen.findByText("Leave this to a licensed professional")).toBeInTheDocument()
    for (const s of GAS_STEPS) expect(screen.queryByText(s)).toBeNull()
  })

  it("a DIY task still shows its steps", async () => {
    openRow(task("t-diy", "Replace the furnace filter", DIY_STEPS))
    for (const s of DIY_STEPS) expect(await screen.findByText(s)).toBeInTheDocument()
    expect(screen.queryByText("Leave this to a licensed professional")).toBeNull()
  })
})
