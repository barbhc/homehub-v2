/**
 * /reminders: a proposal for the last home never lands on this one (H4).
 *
 * "Propose my reminders" asks the server about one home's tasks and can take
 * a few seconds. Its answer was applied whatever home was on screen by then —
 * so home A's proposal, answering after a switch to home B, listed A's tasks
 * on B's page, and "Turn these on" would have written A's task ids into B.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen } from "@testing-library/react"

const m = vi.hoisted(() => ({ homeId: "home-a", proposeReminders: vi.fn() }))
vi.mock("@/modules/home", () => ({ useCurrentHome: () => ({ home: { home_id: m.homeId } }) }))
vi.mock("@/modules/auth", () => {
  const auth = { user: { id: "u1" } }
  return { useAuth: () => auth }
})
vi.mock("@/modules/care", () => ({
  proposeReminders: (...a: unknown[]) => m.proposeReminders(...a),
  getTaskTemplates: vi.fn(async () => ({ data: [], error: null })),
  setTaskReminder: vi.fn(),
  setTaskCadence: vi.fn(),
  deleteTaskTemplate: vi.fn(),
  archiveTaskTemplate: vi.fn(),
}))
vi.mock("@/modules/items", () => ({ getItemUnits: vi.fn(async () => ({ data: [], error: null })) }))
vi.mock("@/lib/userPreferences", () => ({
  getNotificationPrefs: vi.fn(async () => ({ push_mode: "curated+essential", events: {}, weekly_digest: { enabled: true, day: 0, hour: 17 }, quiet_hours: null, lead_time_days: 0 })),
  setNotificationPrefs: vi.fn(),
}))
vi.mock("react-router-dom", () => ({
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => <a href={to} {...rest}>{children}</a>,
}))

const { default: YourReminders } = await import("./YourReminders")

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}
const proposalFor = (id: string, title: string) => ({
  task_template_id: id, title, item_name: "Furnace", reason: "You mentioned filters.",
  current_schedule_type: "quarterly", current_interval_days: null,
  suggested_schedule_type: null, suggested_interval_days: null, remind_already_on: false, priority_tier: "recommended",
})

async function proposeOnHomeA() {
  const answer = deferred<{ ok: true; total_templates: number; proposals: unknown[] }>()
  m.proposeReminders.mockReturnValue(answer.promise)
  const view = render(<YourReminders />)
  fireEvent.change(screen.getByLabelText("What do you want to stay on top of?"), { target: { value: "the furnace filters" } })
  fireEvent.click(screen.getByRole("button", { name: "Propose my reminders" }))
  expect(screen.getByRole("button", { name: /Proposing/ })).toBeInTheDocument()
  return { ...view, answer }
}

beforeEach(() => {
  vi.clearAllMocks()
  m.homeId = "home-a"
})

describe("YourReminders — a proposal for the last home lands nowhere", () => {
  it("home A's proposal, answering after the switch to B, is not listed on B", async () => {
    const { rerender, answer } = await proposeOnHomeA()
    m.homeId = "home-b"
    rerender(<YourReminders />)

    await act(async () => {
      answer.resolve({ ok: true, total_templates: 1, proposals: [proposalFor("t-a", "Replace the furnace filter")] })
    })
    expect(screen.queryByText(/proposed · from what you told us/)).toBeNull()
    expect(screen.queryByLabelText("Replace the furnace filter")).toBeNull()
    // Not left proposing: B can ask for its own.
    expect(screen.getByRole("button", { name: "Propose my reminders" })).toBeInTheDocument()
  })

  it("home A's proposal failing after the switch is not said on B", async () => {
    const { rerender, answer } = await proposeOnHomeA()
    m.homeId = "home-b"
    rerender(<YourReminders />)

    await act(async () => { answer.reject(new Error("The proposal service is busy")) })
    expect(screen.queryByText("The proposal service is busy")).toBeNull()
    expect(screen.getByRole("button", { name: "Propose my reminders" })).toBeInTheDocument()
  })
})
