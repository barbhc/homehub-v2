/**
 * The first minute (D8) before any account (design/account-after-list.md) —
 * must-be-true 5–13 of design/first-minute-onboarding.md against the approved
 * mock's worked examples, plus the account ask: nothing is written until there
 * is an account, then home + profile + tasks are saved together.
 *
 * The clock is pinned to Wed 18 Nov 2026 (Pacific), the mock's day. The save
 * itself (firstMinuteCommit) has its own tests; here it is a stub whose calls
 * say what the screen asked to save.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen, within } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import type { DraftProfile, FirstMinuteDraft } from "@/modules/home/services/firstMinuteDraft"

const svc = vi.hoisted(() => ({
  user: null as null | { id: string },
  home: null as null | { home_id: string; name: string },
  commit: vi.fn(),
  addToExisting: vi.fn(),
  refresh: vi.fn(async () => {}),
  signUp: vi.fn(),
  track: vi.fn(),
  redirectError: null as string | null,
}))

vi.mock("@/modules/auth", () => ({
  useAuth: () => ({ user: svc.user, loading: false, signUp: svc.signUp, signIn: vi.fn(), signInWithApple: vi.fn(async () => ({ error: null })) }),
  takeAppleRedirectError: () => { const e = svc.redirectError; svc.redirectError = null; return e },
  APPLE_REDIRECT_ERROR_EVENT: "homehub:appleRedirectError",
  authErrorMessage: (e: Error) => e.message,
  AppleButton: ({ label, onClick }: { label: string; onClick: () => void }) => <button type="button" onClick={onClick}>{label}</button>,
}))
vi.mock("@/modules/home", () => ({
  useCurrentHome: () => ({ home: svc.home, loading: false, refresh: svc.refresh }),
}))
vi.mock("@/modules/home/services/homeProfileService", () => ({ toArea: (v: unknown) => v ?? null }))
vi.mock("@/modules/home/services/firstMinuteCommit", () => ({
  commitFirstMinute: (...a: unknown[]) => svc.commit(...a),
  addToExistingHome: (...a: unknown[]) => svc.addToExisting(...a),
}))
vi.mock("@/lib/analytics", () => ({ track: (...a: unknown[]) => svc.track(...a) }))

const { default: FirstMinute } = await import("./FirstMinute")
const { DRAFT_KEY, SAVE_MARK_KEY, loadDraft } = await import("@/modules/home/services/firstMinuteDraft")

const SF: DraftProfile = {
  zip: "94110", climate: "mild", freeze_risk: false, climate_source: "zip",
  area: { hazards: ["earthquake"], hazardsCorrected: [], hardinessZone: "10b", county: "San Francisco County", observesDst: true, tableVersion: "2026-11-19" },
}
const MN: DraftProfile = {
  zip: "55406", climate: "cold", freeze_risk: true, climate_source: "zip",
  area: { hazards: [], hazardsCorrected: [], hardinessZone: "5a", county: "Hennepin County", observesDst: true, tableVersion: "2026-11-19" },
}

function seed(over: Partial<FirstMinuteDraft>) {
  const d: FirstMinuteDraft = { v: 1, step: "zip", profile: {}, list: null, pending: null, createdHomeId: null, addedKeys: [], savedAt: Date.now(), ...over }
  window.localStorage.setItem(DRAFT_KEY, JSON.stringify(d))
}
/** The save was asked for in this browser visit (what Apple's redirect keeps). */
function askedThisVisit() {
  window.sessionStorage.setItem(SAVE_MARK_KEY, "1")
}

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true })
  vi.setSystemTime(new Date("2026-11-18T20:00:00-08:00"))
})
afterAll(() => vi.useRealTimers())

beforeEach(() => {
  vi.clearAllMocks()
  window.localStorage.clear()
  window.sessionStorage.clear()
  svc.user = { id: "u1" }
  svc.home = null
  svc.commit.mockImplementation(async (input: { tasks: { key: string }[] }) => ({ kind: "saved", homeId: "h1", addedKeys: input.tasks.map((t) => t.key) }))
  svc.addToExisting.mockImplementation(async (_h: string, tasks: { key: string }[]) => ({ kind: "saved", homeId: "h9", addedKeys: tasks.map((t) => t.key) }))
})

const tree = () => (
  <MemoryRouter initialEntries={["/onboarding/first"]}>
    <Routes>
      <Route path="/onboarding/first" element={<FirstMinute />} />
      <Route path="/home" element={<p>HOME</p>} />
    </Routes>
  </MemoryRouter>
)
function renderFlow() {
  const r = render(tree())
  return { rerender: () => r.rerender(tree()) }
}
const tap = (name: string | RegExp) => fireEvent.click(screen.getByRole("button", { name }))
const rows = () => screen.getAllByTestId("first-list-row")
const rowTitles = () => rows().map((r) => r.querySelector("p")!.textContent)
async function toList(type: RegExp) {
  fireEvent.click(screen.getByRole("radio", { name: type }))
  tap("See this month")
  await screen.findByText("Worth doing this month")
}
const atArea = (profile: DraftProfile) => { seed({ step: "area", profile }); return renderFlow() }

describe("step 1 — where's home", () => {
  it("asks for the zip only: no invite code, no sample-home link", () => {
    svc.user = null
    renderFlow()
    expect(screen.getByRole("heading", { name: "Where's home?" })).toBeInTheDocument()
    expect(screen.getByLabelText("Zip code")).toBeInTheDocument()
    expect(screen.queryByLabelText(/invite code/i)).toBeNull()
    expect(screen.queryByText(/early round/i)).toBeNull()
    expect(screen.queryByRole("link", { name: /sample home/i })).toBeNull()
  })

  it("a known zip goes to its area facts, held on the device — nothing is saved", async () => {
    svc.user = null
    renderFlow()
    fireEvent.change(screen.getByLabelText("Zip code"), { target: { value: "94110" } })
    tap("Continue")
    expect(await screen.findByText(/94110 · San Francisco County/)).toBeInTheDocument()
    expect(loadDraft()?.profile).toMatchObject({ zip: "94110", climate_source: "zip" })
    expect(svc.commit).not.toHaveBeenCalled()
  })

  it("Skip for now goes straight to the list", async () => {
    svc.user = null
    renderFlow()
    tap("Skip for now")
    expect(await screen.findByText("Worth doing this month")).toBeInTheDocument()
  })
})

describe("step 2 — what your area means", () => {
  it("names the zip and county, and shows each fact with its source", () => {
    atArea(SF)
    expect(screen.getByText("94110 · San Francisco County")).toBeInTheDocument()
    expect(screen.getByText("Pipes rarely freeze here")).toBeInTheDocument()
    expect(screen.getByText("A typical winter's coldest night is 35 to 40°F.")).toBeInTheDocument()
    expect(screen.getByText("Earthquake risk is high")).toBeInTheDocument()
    expect(screen.getByText("FEMA risk index for San Francisco County.")).toBeInTheDocument()
  })

  it("5: 'Not true here' takes effect in one tap, and Undo puts it back", () => {
    atArea(SF)
    const freezeRow = screen.getByText("Pipes rarely freeze here").closest("li")!
    fireEvent.click(within(freezeRow).getByRole("button", { name: "Not true here" }))
    expect(screen.getByText("Pipes can freeze here")).toBeInTheDocument()
    expect(screen.getByText("You changed this. Winterizing stays on.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Undo" }))
    expect(screen.getByText("Pipes rarely freeze here")).toBeInTheDocument()
  })

  it("6: shows only facts that change this month's list (Minneapolis: freeze matters, no hazard to show)", () => {
    atArea(MN)
    expect(screen.getByText("Pipes can freeze here")).toBeInTheDocument()
    expect(screen.queryByText(/risk is high/)).toBeNull()
  })

  it("keeps the home type and a corrected hazard in the draft on 'See this month' — no write", async () => {
    atArea(SF)
    const quakeRow = screen.getByText("Earthquake risk is high").closest("li")!
    fireEvent.click(within(quakeRow).getByRole("button", { name: "Not true here" }))
    await toList(/Condo/)
    expect(svc.commit).not.toHaveBeenCalled()
    expect(loadDraft()?.profile).toMatchObject({ home_type: "condo", area: { hazards: [], hazardsCorrected: ["earthquake"] } })
    expect(rowTitles()).not.toContain("Check the water heater's quake straps")
    expect(svc.track).toHaveBeenCalledWith("area_fact_corrected", { fact: "earthquake" })
  })
})

describe("step 3 — worth doing this month (condo, 94110, November)", () => {
  beforeEach(() => { atArea(SF) })

  it("the mock's rows and questions; 7: three rows, two questions; no explanation lines (owner, 2026-11-20)", async () => {
    await toList(/Condo/)
    expect(screen.getByText("November · Condo · 94110")).toBeInTheDocument()
    expect(rowTitles()).toEqual(["Test smoke and CO alarms", "Replace the air filter", "Check the water heater's quake straps"])
    expect(screen.queryByText("The clocks changed this month. Test them together.")).not.toBeInTheDocument()
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

  it("8: nothing is saved before Add or Not now", async () => {
    await toList(/Condo/)
    fireEvent.click(within(rows()[1]).getByRole("radio", { name: "Yes" }))
    fireEvent.click(within(rows()[2]).getByRole("button", { name: /^Not / }))
    fireEvent.click(await screen.findByRole("button", { name: "Just not for me" }))
    expect(svc.commit).not.toHaveBeenCalled()
  })

  it("11 + 13 (signed in): Add saves her answers and each task, due this weekend, in one save", async () => {
    await toList(/Condo/)
    fireEvent.click(within(rows()[1]).getByRole("radio", { name: "Yes" }))
    fireEvent.click(within(rows()[2]).getByRole("radio", { name: "No" }))
    tap("Add 2 tasks")
    expect(await screen.findByText("HOME")).toBeInTheDocument()
    expect(svc.commit).toHaveBeenCalledTimes(1)
    const [input] = svc.commit.mock.calls[0]
    expect(input.userId).toBe("u1")
    expect(input.patch).toMatchObject({
      zip: "94110", home_type: "condo",
      care_facts: expect.objectContaining({ has_air_filter: true, has_water_heater: false, building_handles_exterior: true }),
    })
    expect(input.tasks).toEqual([{ key: "home.alarm_test", due: "2026-11-21" }, { key: "home.air_filter", due: "2026-11-22" }])
    expect(svc.track).toHaveBeenCalledWith("first_list_added", { count: 2, keys: "home.alarm_test,home.air_filter" })
    expect(svc.refresh).toHaveBeenCalledWith("h1")
    expect(window.localStorage.getItem(DRAFT_KEY)).toBeNull()
  })

  it("'Change' on winterizing puts it back as her answer, saved with Add", async () => {
    await toList(/Condo/)
    const box = screen.getByTestId("not-on-your-list")
    fireEvent.click(within(box).getAllByRole("button", { name: "Change" })[0])
    expect(screen.getByTestId("not-on-your-list")).not.toHaveTextContent("Winterizing")
    tap("Add 1 task")
    await screen.findByText("HOME")
    expect(svc.commit.mock.calls[0][0].patch).toMatchObject({ freeze_risk: true, climate_source: "owner" })
  })

  it("the count says what is picked and never claims anything was added (owner, 2026-11-20)", async () => {
    await toList(/Condo/)
    expect(screen.getByTestId("picked-status")).toHaveTextContent("1 picked, not added yet")
    const [, filter] = rows()
    fireEvent.click(within(filter).getByRole("radio", { name: "Yes" }))
    expect(screen.getByTestId("picked-status")).toHaveTextContent("2 picked, not added yet")
    fireEvent.click(within(filter).getByRole("radio", { name: "No" }))
    expect(screen.getByTestId("picked-status")).toHaveTextContent("1 picked, not added yet")
    expect(screen.queryByText(/added to your list/i)).not.toBeInTheDocument()
  })
})

describe("Keep your list — the account ask (signed out)", () => {
  beforeEach(() => { svc.user = null })

  it("Add opens the sheet over the list; nothing is saved until there is an account", async () => {
    atArea(SF)
    await toList(/Condo/)
    tap("Add 1 task")
    const sheet = await screen.findByTestId("keep-list-sheet")
    expect(within(sheet).getByRole("heading", { name: "Keep your list" })).toBeInTheDocument()
    expect(within(sheet).getByText("Make a free account to save this task.")).toBeInTheDocument()
    expect(within(sheet).getByRole("button", { name: "Continue with Apple" })).toBeInTheDocument()
    expect(within(sheet).getByRole("button", { name: "Continue with email" })).toBeInTheDocument()
    expect(svc.commit).not.toHaveBeenCalled()
    expect(loadDraft()?.pending).toMatchObject({ kind: "add", tasks: [{ key: "home.alarm_test" }] })
    // The list is still on screen behind the sheet.
    expect(screen.getByText("Worth doing this month")).toBeInTheDocument()
  })

  it("email has two fields — no name — and a failed sign-up says why and saves nothing", async () => {
    svc.signUp.mockResolvedValueOnce({ error: new Error("There’s already an account with that email. Sign in instead.") })
    atArea(SF)
    await toList(/Condo/)
    tap("Add 1 task")
    tap("Continue with email")
    expect(screen.queryByLabelText(/name/i)).toBeNull()
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "sam@example.com" } })
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "longenough1" } })
    tap("Create account")
    expect(await screen.findByRole("alert")).toHaveTextContent("There’s already an account with that email.")
    expect(svc.signUp).toHaveBeenCalledWith("sam@example.com", "longenough1")
    expect(svc.commit).not.toHaveBeenCalled()
  })

  it("once the account appears, the waiting save runs by itself and lands on Home", async () => {
    const r = atArea(SF)
    await toList(/Condo/)
    tap("Add 1 task")
    await screen.findByTestId("keep-list-sheet")
    svc.user = { id: "u2" }
    r.rerender()
    expect(await screen.findByText("HOME")).toBeInTheDocument()
    expect(svc.commit).toHaveBeenCalledTimes(1)
    expect(svc.commit.mock.calls[0][0]).toMatchObject({ userId: "u2", tasks: [{ key: "home.alarm_test" }] })
  })

  it("Not now asks too, worded for what they would keep", async () => {
    atArea(SF)
    await toList(/Condo/)
    tap("Not now")
    const sheet = await screen.findByTestId("keep-list-sheet")
    expect(within(sheet).getByRole("heading", { name: "Keep your area and home type" })).toBeInTheDocument()
    expect(loadDraft()?.pending).toMatchObject({ kind: "keep" })
  })

  it("closing the sheet leaves the list as it was and forgets the save", async () => {
    atArea(SF)
    await toList(/Condo/)
    fireEvent.click(within(rows()[1]).getByRole("radio", { name: "Yes" }))
    tap("Add 2 tasks")
    await screen.findByTestId("keep-list-sheet")
    fireEvent.click(screen.getByRole("button", { name: "Close" }))
    expect(screen.queryByTestId("keep-list-sheet")).toBeNull()
    expect(within(rows()[1]).getByRole("radio", { name: "Yes" })).toHaveAttribute("aria-checked", "true")
    expect(loadDraft()?.pending).toBeNull()
  })
})

describe("after a reload (Apple's redirect)", () => {
  it("comes back to the list with her choices and runs the waiting save", async () => {
    seed({
      step: "list", profile: { ...SF, home_type: "condo" },
      list: { month: 11, answers: { "home.air_filter": "yes" }, checked: {}, removed: {}, corrections: { freeze: null, hazardsOff: [] }, exteriorMine: false },
      pending: { kind: "add", patch: { ...SF, home_type: "condo" }, tasks: [{ key: "home.alarm_test", due: "2026-11-21" }, { key: "home.air_filter", due: "2026-11-22" }] },
    })
    askedThisVisit()
    renderFlow()
    expect(await screen.findByText("HOME")).toBeInTheDocument()
    expect(svc.commit).toHaveBeenCalledTimes(1)
    expect(svc.commit.mock.calls[0][0].tasks.map((t: { key: string }) => t.key)).toEqual(["home.alarm_test", "home.air_filter"])
  })

  it("signed out on return (Apple failed): the list keeps her choices and the sheet asks again", async () => {
    svc.user = null
    seed({
      step: "list", profile: { ...SF, home_type: "condo" },
      list: { month: 11, answers: { "home.air_filter": "yes" }, checked: {}, removed: {}, corrections: { freeze: null, hazardsOff: [] }, exteriorMine: false },
      pending: { kind: "add", patch: { ...SF, home_type: "condo" }, tasks: [{ key: "home.alarm_test", due: "2026-11-21" }] },
    })
    askedThisVisit()
    renderFlow()
    expect(await screen.findByRole("heading", { name: "Keep your list" })).toBeInTheDocument()
    // The open sheet hides the page from assistive tech (modal), hence `hidden`.
    expect(within(rows()[1]).getByRole("radio", { name: "Yes", hidden: true })).toHaveAttribute("aria-checked", "true")
  })

  it("a waiting save from another visit is never run for whoever signs in (shared device)", async () => {
    seed({
      step: "list", profile: { ...SF, home_type: "condo" },
      pending: { kind: "add", patch: { ...SF, home_type: "condo" }, tasks: [{ key: "home.alarm_test", due: "2026-11-21" }] },
      createdHomeId: "someone-elses", addedKeys: ["home.alarm_test"],
    })
    renderFlow() // no askedThisVisit(): the tab that asked is gone
    expect(await screen.findByText("Worth doing this month")).toBeInTheDocument()
    expect(svc.commit).not.toHaveBeenCalled()
    expect(screen.queryByTestId("keep-list-sheet")).toBeNull()
    expect(loadDraft()).toMatchObject({ pending: null, createdHomeId: null, addedKeys: [] })
  })

  it("Apple's failure message, stashed after the screen rendered, shows in the sheet", async () => {
    svc.user = null
    seed({ step: "list", profile: { ...SF, home_type: "condo" }, pending: { kind: "keep", patch: SF } })
    askedThisVisit()
    renderFlow()
    expect(await screen.findByRole("heading", { name: "Keep your area and home type" })).toBeInTheDocument()
    svc.redirectError = "Apple sign-in failed. Try again."
    act(() => { window.dispatchEvent(new Event("homehub:appleRedirectError")) })
    expect(await screen.findByRole("alert")).toHaveTextContent("Apple sign-in failed. Try again.")
  })
})

describe("when the save fails or finds a home", () => {
  it("12: a failed save shows the error in the sheet — never Home — and Try again reuses the half-made home", async () => {
    svc.commit.mockResolvedValueOnce({ kind: "failed", message: "Couldn't save your home. Check your connection and try again.", createdHomeId: "h7", addedKeys: [] })
    atArea(SF)
    await toList(/Condo/)
    tap("Add 1 task")
    expect(await screen.findByRole("heading", { name: "Couldn’t save" })).toBeInTheDocument()
    expect(screen.getByText("Couldn't save your home. Check your connection and try again.")).toBeInTheDocument()
    expect(screen.queryByText("HOME")).toBeNull()
    expect(screen.getByText("Worth doing this month")).toBeInTheDocument()
    tap("Try again")
    expect(await screen.findByText("HOME")).toBeInTheDocument()
    expect(svc.commit).toHaveBeenCalledTimes(2)
    expect(svc.commit.mock.calls[1][0]).toMatchObject({ createdHomeId: "h7" })
  })

  it("an account that already has a home is asked before the tasks go into it", async () => {
    svc.commit.mockResolvedValueOnce({ kind: "existing", homeId: "h9", homeName: "SF Condo" })
    atArea(SF)
    await toList(/Condo/)
    tap("Add 1 task")
    expect(await screen.findByRole("heading", { name: "You already have a home" })).toBeInTheDocument()
    expect(screen.getByText("Add this task to “SF Condo”?")).toBeInTheDocument()
    tap("Add 1 task")
    expect(await screen.findByText("HOME")).toBeInTheDocument()
    expect(svc.addToExisting).toHaveBeenCalledWith("h9", [{ key: "home.alarm_test", due: "2026-11-21" }], [])
  })

  it("Don't add goes Home without touching the existing home", async () => {
    svc.commit.mockResolvedValueOnce({ kind: "existing", homeId: "h9", homeName: "SF Condo" })
    atArea(SF)
    await toList(/Condo/)
    tap("Add 1 task")
    await screen.findByRole("heading", { name: "You already have a home" })
    await act(async () => { tap("Don’t add") })
    expect(await screen.findByText("HOME")).toBeInTheDocument()
    expect(svc.addToExisting).not.toHaveBeenCalled()
  })
})

describe("closing the sheet", () => {
  it("closing 'You already have a home' is Don't add: Home, draft cleared", async () => {
    svc.commit.mockResolvedValueOnce({ kind: "existing", homeId: "h9", homeName: "SF Condo" })
    atArea(SF)
    await toList(/Condo/)
    tap("Add 1 task")
    await screen.findByRole("heading", { name: "You already have a home" })
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Close" })) })
    expect(await screen.findByText("HOME")).toBeInTheDocument()
    expect(svc.addToExisting).not.toHaveBeenCalled()
    expect(window.localStorage.getItem(DRAFT_KEY)).toBeNull()
  })

  it("after a save made the home and failed, closing the error stays on the list — never an empty Home", async () => {
    svc.commit.mockResolvedValueOnce({ kind: "failed", message: "Couldn't save your home. Check your connection and try again.", createdHomeId: "h7", addedKeys: [] })
    atArea(SF)
    await toList(/Condo/)
    tap("Add 1 task")
    await screen.findByRole("heading", { name: "Couldn’t save" })
    svc.home = { home_id: "h7", name: "My home" } // the provider has found the half-made home
    fireEvent.click(screen.getByRole("button", { name: "Close" }))
    expect(screen.getByText("Worth doing this month")).toBeInTheDocument()
    expect(screen.queryByText("HOME")).toBeNull()
    tap("Add 1 task")
    expect(await screen.findByText("HOME")).toBeInTheDocument()
    expect(svc.commit.mock.calls[1][0]).toMatchObject({ createdHomeId: "h7" })
  })
})

describe("the skip path (Version E)", () => {
  it("no zip: straight to the list, no step bar, no area words, an 'Add zip' row", () => {
    seed({ step: "list" })
    renderFlow()
    expect(screen.getByText("What most homes need now. Nothing is added until you tap Add.")).toBeInTheDocument()
    expect(screen.queryByText(/Step \d of 3/)).toBeNull()
    expect(rowTitles()).toEqual(["Test smoke and CO alarms", "Replace the air filter"])
    expect(screen.queryByText(/clock/i)).toBeNull()
    expect(screen.getByRole("button", { name: "Add zip" })).toBeInTheDocument()
  })
})

describe("the house in Minneapolis", () => {
  it("outdoor taps 'if not done yet', and the filter question for a furnace", async () => {
    atArea(MN)
    await toList(/House/)
    expect(rowTitles()).toEqual(["Test smoke and CO alarms", "Shut off and drain the outdoor taps", "Replace the air filter"])
    expect(screen.getByText("Any outdoor taps or hose bibs?")).toBeInTheDocument()
    expect(screen.getByText("Does the furnace take a filter?")).toBeInTheDocument()
    expect(screen.queryByTestId("not-on-your-list")).toBeNull()
  })
})

describe("someone who already has a home", () => {
  it("is sent to Home", () => {
    svc.home = { home_id: "h1", name: "My home" }
    renderFlow()
    expect(screen.getByText("HOME")).toBeInTheDocument()
  })
})
