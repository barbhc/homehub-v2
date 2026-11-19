/**
 * The first minute, steps 2 and 3 (D8) — must-be-true 5–13 of
 * design/first-minute-onboarding.md, against the approved mock's worked
 * examples. The clock is pinned to Wed 18 Nov 2026 (Pacific), the mock's day.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, within } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import type { HomeProfile } from "@/modules/home/services/homeProfileService"

const svc = vi.hoisted(() => ({
  profile: null as unknown as HomeProfile,
  upsert: vi.fn(),
  addLibraryTask: vi.fn(),
  track: vi.fn(),
}))

vi.mock("@/modules/home", () => ({
  useCurrentHome: () => ({ home: { home_id: "h1", name: "My home" } }),
  useHomeProfile: () => ({ profile: svc.profile, isLoading: false, error: undefined, refresh: async () => {} }),
}))
vi.mock("@/modules/home/services/homeProfileService", () => ({
  upsertHomeProfile: (...a: unknown[]) => svc.upsert(...a),
}))
vi.mock("@/modules/care/services/careSuggestionService", () => ({
  addLibraryTask: (...a: unknown[]) => svc.addLibraryTask(...a),
}))
vi.mock("@/lib/analytics", () => ({ track: (...a: unknown[]) => svc.track(...a) }))

const { default: FirstMinute } = await import("./FirstMinute")

const SF: Partial<HomeProfile> = {
  zip: "94110", climate: "mild", freeze_risk: false, climate_source: "zip",
  area: { hazards: ["earthquake"], hazardsCorrected: [], hardinessZone: "10b", county: "San Francisco County", observesDst: true, tableVersion: "2026-11-19" },
}
const MN: Partial<HomeProfile> = {
  zip: "55406", climate: "cold", freeze_risk: true, climate_source: "zip",
  area: { hazards: [], hazardsCorrected: [], hardinessZone: "5a", county: "Hennepin County", observesDst: true, tableVersion: "2026-11-19" },
}
function profile(over: Partial<HomeProfile> = {}): HomeProfile {
  return {
    home_id: "h1", home_type: null, ownership: null, ownership_duration: null, top_concerns: [], preferred_mode: "unset",
    climate: null, freeze_risk: null, zip: null, area: null, climate_source: null, care_facts: {}, dismissed_care: [],
    winterizing_offer_answered_at: null, completed_at: null, created_at: "", updated_at: "", ...over,
  }
}

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true })
  vi.setSystemTime(new Date("2026-11-18T20:00:00-08:00"))
})
afterAll(() => vi.useRealTimers())

beforeEach(() => {
  vi.clearAllMocks()
  svc.upsert.mockImplementation(async (_h: string, patch: Partial<HomeProfile>) => ({ data: { ...svc.profile, ...patch }, error: null }))
  svc.addLibraryTask.mockImplementation(async (_h: string, _i: null, entry: { key: string }) => ({ data: { task_template_id: `t-${entry.key}` }, error: null }))
})

function renderFlow() {
  render(
    <MemoryRouter initialEntries={["/onboarding/first"]}>
      <Routes>
        <Route path="/onboarding/first" element={<FirstMinute />} />
        <Route path="/home" element={<p>HOME</p>} />
      </Routes>
    </MemoryRouter>,
  )
}
const tap = (name: string | RegExp) => fireEvent.click(screen.getByRole("button", { name }))
const rows = () => screen.getAllByTestId("first-list-row")
const rowTitles = () => rows().map((r) => r.querySelector("p")!.textContent)
async function toList(type: RegExp) {
  fireEvent.click(screen.getByRole("radio", { name: type }))
  tap("See this month")
  await screen.findByText("Worth doing this month")
}

describe("step 2 — what your area means", () => {
  it("names the zip and county, and shows each fact with its source", () => {
    svc.profile = profile(SF)
    renderFlow()
    expect(screen.getByText("94110 · San Francisco County")).toBeInTheDocument()
    expect(screen.getByText("Pipes rarely freeze here")).toBeInTheDocument()
    expect(screen.getByText("Coldest nights are 35 to 40°F. USDA zone 10b.")).toBeInTheDocument()
    expect(screen.getByText("Earthquake risk is high")).toBeInTheDocument()
    expect(screen.getByText("FEMA risk index for San Francisco County.")).toBeInTheDocument()
  })

  it("5: 'Not true here' takes effect in one tap, and Undo puts it back", () => {
    svc.profile = profile(SF)
    renderFlow()
    const freezeRow = screen.getByText("Pipes rarely freeze here").closest("li")!
    fireEvent.click(within(freezeRow).getByRole("button", { name: "Not true here" }))
    expect(screen.getByText("Pipes can freeze here")).toBeInTheDocument()
    expect(screen.getByText("You changed this. Winterizing stays on.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Undo" }))
    expect(screen.getByText("Pipes rarely freeze here")).toBeInTheDocument()
  })

  it("6: shows only facts that change this month's list (Minneapolis: freeze matters, no hazard to show)", () => {
    svc.profile = profile(MN)
    renderFlow()
    expect(screen.getByText("Pipes can freeze here")).toBeInTheDocument()
    expect(screen.queryByText(/risk is high/)).toBeNull()
  })

  it("saves the home type and any correction on 'See this month' — and a corrected hazard is remembered as corrected", async () => {
    svc.profile = profile(SF)
    renderFlow()
    const quakeRow = screen.getByText("Earthquake risk is high").closest("li")!
    fireEvent.click(within(quakeRow).getByRole("button", { name: "Not true here" }))
    await toList(/Condo/)
    expect(svc.upsert).toHaveBeenCalledTimes(1)
    const [, patch] = svc.upsert.mock.calls[0]
    expect(patch).toMatchObject({ home_type: "condo", area: { hazards: [], hazardsCorrected: ["earthquake"] } })
    expect(rowTitles()).not.toContain("Check the water heater's quake straps")
    expect(svc.track).toHaveBeenCalledWith("area_fact_corrected", { fact: "earthquake" })
  })
})

describe("step 3 — worth doing this month (condo, 94110, November)", () => {
  beforeEach(() => {
    svc.profile = profile(SF)
    renderFlow()
  })

  it("the mock's rows, reasons and questions; 7: three rows, two questions", async () => {
    await toList(/Condo/)
    expect(screen.getByText("November · Condo · 94110")).toBeInTheDocument()
    expect(rowTitles()).toEqual(["Test smoke and CO alarms", "Replace the air filter", "Check the water heater's quake straps"])
    expect(screen.getByText("The clocks changed this month. Test them together.")).toBeInTheDocument()
    expect(screen.getByText("Is there a water heater in your unit?")).toBeInTheDocument()
    expect(screen.getAllByRole("radiogroup").length).toBe(2)
  })

  it("9: a row with an open question is never pre-checked; Yes checks it, No locks it off", async () => {
    await toList(/Condo/)
    const [alarm, filter, quake] = rows()
    expect(within(alarm).getByRole("checkbox")).toHaveAttribute("aria-checked", "true")
    expect(within(filter).getByRole("checkbox")).toHaveAttribute("aria-checked", "false")
    fireEvent.click(within(quake).getByRole("radio", { name: "Yes" }))
    expect(within(quake).getByRole("checkbox")).toHaveAttribute("aria-checked", "true")
    fireEvent.click(within(filter).getByRole("radio", { name: "No" }))
    expect(within(filter).getByText("Got it. We won't suggest this.")).toBeInTheDocument()
    expect(within(filter).getByRole("checkbox")).toBeDisabled()
    expect(screen.getByRole("button", { name: "Add 2 tasks" })).toBeInTheDocument()
  })

  it("10: no winterizing, and 'Not on your list' says why", async () => {
    await toList(/Condo/)
    expect(rowTitles().join()).not.toMatch(/outdoor taps|winteri/i)
    const box = screen.getByTestId("not-on-your-list")
    expect(box).toHaveTextContent("Winterizing: it rarely freezes here.")
    expect(box).toHaveTextContent("Roof and gutters: usually the building’s job in a condo.")
  })

  it("8: nothing is saved before Add, and Not now saves nothing", async () => {
    await toList(/Condo/)
    svc.upsert.mockClear()
    fireEvent.click(within(rows()[1]).getByRole("radio", { name: "Yes" }))
    fireEvent.click(within(rows()[2]).getByRole("button", { name: /^Not / }))
    fireEvent.click(await screen.findByRole("button", { name: "Just not for me" }))
    expect(svc.upsert).not.toHaveBeenCalled()
    expect(svc.addLibraryTask).not.toHaveBeenCalled()
    tap("Not now")
    expect(await screen.findByText("HOME")).toBeInTheDocument()
    expect(svc.upsert).not.toHaveBeenCalled()
    expect(svc.addLibraryTask).not.toHaveBeenCalled()
  })

  it("11 + 13: Add writes her answers, then each task through the library, due this weekend", async () => {
    await toList(/Condo/)
    svc.upsert.mockClear()
    fireEvent.click(within(rows()[1]).getByRole("radio", { name: "Yes" }))
    fireEvent.click(within(rows()[2]).getByRole("radio", { name: "No" }))
    tap("Add 2 tasks")
    expect(await screen.findByText("HOME")).toBeInTheDocument()
    expect(svc.upsert).toHaveBeenCalledWith("h1", expect.objectContaining({
      care_facts: expect.objectContaining({ has_air_filter: true, has_water_heater: false, building_handles_exterior: true }),
    }))
    expect(svc.addLibraryTask.mock.calls.map((c) => [c[2].key, c[3].firstDue])).toEqual([
      ["home.alarm_test", "2026-11-21"],
      ["home.air_filter", "2026-11-22"],
    ])
    expect(svc.track).toHaveBeenCalledWith("first_list_added", { count: 2, keys: "home.alarm_test,home.air_filter" })
  })

  it("12: a failed Add keeps the screen and every choice, says nothing was saved, and offers Try again", async () => {
    await toList(/Condo/)
    svc.upsert.mockClear()
    svc.upsert.mockResolvedValueOnce({ data: null, error: { message: "unavailable" } })
    fireEvent.click(within(rows()[1]).getByRole("radio", { name: "Yes" }))
    tap("Add 2 tasks")
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn’t add your tasks. Nothing was saved. Check your connection and try again.")
    expect(svc.addLibraryTask).not.toHaveBeenCalled()
    expect(screen.queryByText("HOME")).toBeNull()
    expect(within(rows()[1]).getByRole("radio", { name: "Yes" })).toHaveAttribute("aria-checked", "true")
    tap("Try again")
    expect(await screen.findByText("HOME")).toBeInTheDocument()
  })

  it("12: a partial failure names the rows that did not save, and Try again retries only those", async () => {
    await toList(/Condo/)
    fireEvent.click(within(rows()[1]).getByRole("radio", { name: "Yes" }))
    svc.addLibraryTask.mockImplementationOnce(async () => ({ data: { task_template_id: "t1" }, error: null }))
    svc.addLibraryTask.mockImplementationOnce(async () => ({ data: null, error: { message: "unavailable" } }))
    tap("Add 2 tasks")
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn’t add “Replace the air filter”. The others were added.")
    expect(rowTitles()).not.toContain("Test smoke and CO alarms")
    svc.addLibraryTask.mockClear()
    tap("Try again")
    expect(await screen.findByText("HOME")).toBeInTheDocument()
    expect(svc.addLibraryTask.mock.calls.map((c) => c[2].key)).toEqual(["home.air_filter"])
  })

  it("'Change' on winterizing puts it back as her answer, saved with Add", async () => {
    await toList(/Condo/)
    svc.upsert.mockClear()
    const box = screen.getByTestId("not-on-your-list")
    fireEvent.click(within(box).getAllByRole("button", { name: "Change" })[0])
    expect(screen.getByTestId("not-on-your-list")).not.toHaveTextContent("Winterizing")
    tap("Add 1 task")
    await screen.findByText("HOME")
    expect(svc.upsert).toHaveBeenCalledWith("h1", expect.objectContaining({ freeze_risk: true, climate_source: "owner" }))
  })
})

describe("the skip path (Version E)", () => {
  it("no zip: straight to the list, no step bar, no area words, an 'Add zip' row", () => {
    svc.profile = profile()
    renderFlow()
    expect(screen.getByText("What most homes need now. Nothing is added until you tap Add.")).toBeInTheDocument()
    expect(screen.queryByText(/Step \d of 3/)).toBeNull()
    expect(rowTitles()).toEqual(["Test smoke and CO alarms", "Replace the air filter"])
    expect(screen.getByText("Fall is a good time for the first one.")).toBeInTheDocument()
    // must-be-true 15: no clock-change copy without a zip
    expect(screen.queryByText(/clock/i)).toBeNull()
    expect(screen.getByRole("button", { name: "Add zip" })).toBeInTheDocument()
  })
})

describe("the house in Minneapolis", () => {
  it("outdoor taps 'if not done yet', and the filter question for a furnace", async () => {
    svc.profile = profile(MN)
    renderFlow()
    await toList(/House/)
    expect(rowTitles()).toEqual(["Test smoke and CO alarms", "Shut off and drain the outdoor taps", "Replace the air filter"])
    expect(screen.getByText("If not done yet. Hard freezes start here in November.")).toBeInTheDocument()
    expect(screen.getByText("Any outdoor taps or hose bibs?")).toBeInTheDocument()
    expect(screen.getByText("Does the furnace take a filter?")).toBeInTheDocument()
    expect(screen.queryByTestId("not-on-your-list")).toBeNull()
  })
})
