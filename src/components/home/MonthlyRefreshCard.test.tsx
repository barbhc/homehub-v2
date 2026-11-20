/**
 * "This month at your home" (design/day-one-home.md, release D): the first-
 * minute list, monthly, on Home. Nothing added until Add; Add or Not now
 * answers the month; nothing the home already has is offered; failures said.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { SWRConfig } from "swr"
import type { HomeProfile } from "@/modules/home/services/homeProfileService"

const svc = vi.hoisted(() => ({
  titles: [] as string[],
  templatesFail: false,
  taskFails: false,
  saveFails: false,
}))
const addLibraryTask = vi.hoisted(() => vi.fn(async () => (svc.taskFails ? { data: null, error: { message: "Offline." } } : { data: {}, error: null })))
const upsertHomeProfile = vi.hoisted(() => vi.fn(async () => (svc.saveFails ? { data: null, error: { message: "Offline." } } : { data: {}, error: null })))
vi.mock("@/modules/care", () => ({
  getTaskTemplates: async () => (svc.templatesFail ? { data: null, error: { message: "Offline." } } : { data: svc.titles.map((title) => ({ title, schedule: { scheduleType: "annual" } })), error: null }),
  addLibraryTask,
}))
vi.mock("@/modules/home/services/homeProfileService", () => ({ upsertHomeProfile }))
vi.mock("@/lib/analytics", () => ({ track: vi.fn() }))
vi.mock("../../../shared/dates/calendar", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  localToday: () => "2026-12-03",
}))

const { MonthlyRefreshCard } = await import("./MonthlyRefreshCard")

/** A Dallas house created in November: December's list. */
const dallas = (over: Partial<HomeProfile> = {}): HomeProfile => ({
  home_id: "h1", task_level: null, home_type: "house", ownership: "own", ownership_duration: null, top_concerns: [], preferred_mode: "unset",
  climate: "moderate", freeze_risk: true, zip: "75201", climate_source: "zip",
  area: { hazards: [], hazardsCorrected: [], hardinessZone: "8b", county: "Dallas County", observesDst: true, tableVersion: "2026-11-19" },
  care_facts: { has_outdoor_taps: true, has_gutters: true }, dismissed_care: [],
  winterizing_offer_answered_at: null, refresh_answered_month: null, completed_at: "2026-11-19", created_at: "2026-11-19T18:00:00.000Z", updated_at: "",
  ...over,
})

const onChanged = vi.fn()
const renderCard = (profile: HomeProfile) =>
  render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <MonthlyRefreshCard homeId="h1" profile={profile} fallback={<div data-testid="fallback" />} onChanged={onChanged} />
    </SWRConfig>,
  )
const rowTitles = () => screen.getAllByTestId("monthly-refresh-row").map((r) => r.querySelector("p")?.textContent)

beforeEach(() => {
  Object.assign(svc, { titles: [], templatesFail: false, taskFails: false, saveFails: false })
  vi.clearAllMocks()
})

describe("MonthlyRefreshCard", () => {
  it("offers only what is timely: no year-round fillers", async () => {
    // Dallas in December with alarms, taps and gutters already on the list:
    // onboarding would top up with the extinguisher and the water heater; the
    // monthly card offers only January's radon test (opening next month).
    svc.titles = ["Test smoke and CO alarms", "Shut off and drain the outdoor taps", "Clean the gutters"]
    renderCard(dallas())
    expect(await screen.findByText("This month at your home")).toBeInTheDocument()
    expect(rowTitles()).toEqual(["Test for radon"])
    expect(screen.queryByText("Check the fire extinguisher")).toBeNull()
  })

  it("a month with nothing timely shows the usual card", async () => {
    svc.titles = ["Test smoke and CO alarms", "Shut off and drain the outdoor taps", "Clean the gutters", "Test for radon"]
    renderCard(dallas())
    expect(await screen.findByTestId("fallback")).toBeInTheDocument()
  })

  it("offers this month's list, skipping what the home already has", async () => {
    svc.titles = ["Test smoke and CO alarms"]
    renderCard(dallas())
    expect(await screen.findByText("This month at your home")).toBeInTheDocument()
    expect(screen.getByText("December")).toBeInTheDocument()
    expect(rowTitles()).not.toContain("Test smoke and CO alarms")
    expect(rowTitles().length).toBeGreaterThan(0)
    expect(rowTitles().length).toBeLessThanOrEqual(3)
    expect(addLibraryTask).not.toHaveBeenCalled()
  })

  it("Add adds the checked tasks, then marks the month answered", async () => {
    renderCard(dallas())
    const add = await screen.findByRole("button", { name: /^Add \d+ tasks?$/ })
    const n = Number(add.textContent!.match(/\d+/)![0])
    fireEvent.click(add)
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
    expect(addLibraryTask).toHaveBeenCalledTimes(n)
    expect(upsertHomeProfile).toHaveBeenCalledWith("h1", expect.objectContaining({ refresh_answered_month: "2026-12" }))
  })

  it("Not now answers the month and adds nothing", async () => {
    renderCard(dallas())
    fireEvent.click(await screen.findByRole("button", { name: "Not now" }))
    await waitFor(() => expect(upsertHomeProfile).toHaveBeenCalledWith("h1", { refresh_answered_month: "2026-12" }))
    expect(addLibraryTask).not.toHaveBeenCalled()
    expect(onChanged).toHaveBeenCalled()
  })

  it("a failed task says so and keeps the card unanswered", async () => {
    svc.taskFails = true
    renderCard(dallas())
    fireEvent.click(await screen.findByRole("button", { name: /^Add \d+ tasks?$/ }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn’t add your tasks.")
    expect(upsertHomeProfile).not.toHaveBeenCalled()
    expect(onChanged).not.toHaveBeenCalled()
  })

  it("tasks added but the answer not saved: says so, and Try again saves only the answer", async () => {
    svc.saveFails = true
    renderCard(dallas())
    fireEvent.click(await screen.findByRole("button", { name: /^Add \d+ tasks?$/ }))
    expect(await screen.findByText("Your tasks were added, but this card couldn’t be marked done. Try again.")).toBeInTheDocument()
    const calls = addLibraryTask.mock.calls.length
    svc.saveFails = false
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
    expect(addLibraryTask).toHaveBeenCalledTimes(calls)
  })

  it("shows the slot's usual card when answered, in the creation month, or when tasks can't be read", async () => {
    const { unmount } = renderCard(dallas({ refresh_answered_month: "2026-12" }))
    expect(screen.getByTestId("fallback")).toBeInTheDocument()
    unmount()
    const second = renderCard(dallas({ created_at: "2026-12-01T10:00:00.000Z" }))
    expect(screen.getByTestId("fallback")).toBeInTheDocument()
    second.unmount()
    svc.templatesFail = true
    renderCard(dallas())
    expect(await screen.findByTestId("fallback")).toBeInTheDocument()
    expect(screen.queryByText("This month at your home")).toBeNull()
  })
})
