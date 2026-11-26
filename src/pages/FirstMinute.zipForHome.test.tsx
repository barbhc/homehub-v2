/**
 * Home's "Add your zip" (seventeen fixes, mock m5; owner-approved 2026-11-25):
 * the first minute's screens for a signed-in person's EXISTING home.
 *
 * Quoted requirements (the brief's "Where the row goes"):
 *   1. "Where's home?" (the zip).
 *   2. "What your area means" with "Not true here". Skip the home-type
 *      question if home_type is already set.
 *   3. "Worth doing this month", showing ONLY tasks the zip adds that the home
 *      doesn't already have (existing templates and dismissed_care excluded).
 *      Nothing is added until Add.
 *   4. Back to Home.
 *   "If the zip adds nothing new, step 3 says so in one line and returns to Home."
 *   "It must update that home's profile … and NOT create a home or go through
 *    the account sheet." "Every failed write is visible."
 *
 * The clock is pinned to Wed 18 Nov 2026 (Pacific), like FirstMinute.test.tsx.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import type { HomeProfile } from "@/modules/home/services/homeProfileService"

const svc = vi.hoisted(() => ({
  read: vi.fn(),
  save: vi.fn(),
  commit: vi.fn(),
  addToExisting: vi.fn(),
  track: vi.fn(),
}))
vi.mock("@/modules/auth", () => ({
  useAuth: () => ({ user: { id: "u1" }, loading: false }),
  takeAppleRedirectError: () => null,
  APPLE_REDIRECT_ERROR_EVENT: "homehub:appleRedirectError",
  authErrorMessage: (e: Error) => e.message,
  AppleButton: () => null,
}))
vi.mock("@/modules/home", () => ({
  useCurrentHome: () => ({ home: { home_id: "h1", name: "SF Condo" }, loading: false, refresh: async () => {} }),
}))
vi.mock("@/modules/home/services/homeProfileService", () => ({ toArea: (v: unknown) => v ?? null }))
vi.mock("@/modules/home/services/firstMinuteCommit", () => ({
  readHomeForZip: (...a: unknown[]) => svc.read(...a),
  saveZipToHome: (...a: unknown[]) => svc.save(...a),
  commitFirstMinute: (...a: unknown[]) => svc.commit(...a),
  addToExistingHome: (...a: unknown[]) => svc.addToExisting(...a),
}))
vi.mock("@/lib/analytics", () => ({ track: (...a: unknown[]) => svc.track(...a) }))

const { ZipForHome } = await import("./FirstMinute")

const profile = (over: Partial<HomeProfile> = {}): HomeProfile => ({
  home_id: "h1", task_level: null, task_level_hidden: 0, home_type: "house", ownership: null, ownership_duration: null,
  top_concerns: [], preferred_mode: "unset", climate: null, freeze_risk: null, zip: null, area: null, climate_source: null,
  care_facts: {}, dismissed_care: [], winterizing_offer_answered_at: null, refresh_answered_month: null,
  completed_at: null, created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-01T00:00:00Z", ...over,
})

const tree = () => (
  <MemoryRouter initialEntries={["/home/zip"]}>
    <Routes>
      <Route path="/home/zip" element={<ZipForHome />} />
      <Route path="/home" element={<p>HOME</p>} />
    </Routes>
  </MemoryRouter>
)
const tap = (name: string | RegExp) => fireEvent.click(screen.getByRole("button", { name }))
const titles = () => screen.queryAllByTestId("first-list-row").map((r) => r.querySelector("p")!.textContent)
async function enterZip(zip: string) {
  fireEvent.change(await screen.findByLabelText("Zip code"), { target: { value: zip } })
  tap("Continue")
}

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true })
  vi.setSystemTime(new Date("2026-11-18T20:00:00-08:00"))
})
afterAll(() => vi.useRealTimers())

beforeEach(() => {
  vi.clearAllMocks()
  svc.read.mockResolvedValue({ data: { profile: profile(), existing: [] }, error: null })
  svc.save.mockImplementation(async (_h: string, _p: unknown, _patch: unknown, tasks: { key: string }[]) => ({ kind: "saved", homeId: "h1", addedKeys: tasks.map((t) => t.key) }))
})

describe("an existing home adds its zip", () => {
  it("1–2: Where's home?, then the area facts with Not true here — and no home-type question when the home has one", async () => {
    render(tree())
    expect(await screen.findByRole("heading", { name: "Where's home?" })).toBeInTheDocument()
    await enterZip("94110")
    expect(await screen.findByText("What your area means for upkeep")).toBeInTheDocument()
    expect(screen.getByText("Earthquake risk is high")).toBeInTheDocument()
    expect(screen.getAllByRole("button", { name: "Not true here" }).length).toBeGreaterThan(0)
    // Not rendered (the home is already a house).
    expect(screen.queryByRole("radiogroup", { name: "Home type" })).toBeNull()
    expect(screen.queryByText(/What kind of home/)).toBeNull()
    expect(screen.getByRole("button", { name: "See this month" })).toBeEnabled()
  })

  it("2: a home with no type is asked it", async () => {
    svc.read.mockResolvedValue({ data: { profile: profile({ home_type: null }), existing: [] }, error: null })
    render(tree())
    await enterZip("94110")
    expect(await screen.findByRole("radiogroup", { name: "Home type" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "See this month" })).toBeDisabled()
  })

  it("3: only what the zip brings — nothing it would get without one, nothing it has, nothing it turned down", async () => {
    render(tree())
    await enterZip("94110")
    fireEvent.click(await screen.findByRole("button", { name: "See this month" }))
    await screen.findByText("Worth doing this month")
    const offered = titles()
    // The SF house's zip brings its earthquake work…
    expect(offered.some((t) => /quake/i.test(t ?? ""))).toBe(true)
    // …and none of the year-round list every home gets without a zip.
    expect(offered).not.toContain("Test the smoke alarms")
    expect(offered).not.toContain("Replace the air filter")
    // Nothing is added until Add.
    expect(svc.save).not.toHaveBeenCalled()
  })

  it("3: a task the home already has is not offered again, nor one it dismissed", async () => {
    svc.read.mockResolvedValue({ data: { profile: profile(), existing: [{ title: "Check the water heater's quake straps", scheduleType: "annual" }] }, error: null })
    render(tree())
    await enterZip("94110")
    fireEvent.click(await screen.findByRole("button", { name: "See this month" }))
    await screen.findByText("Worth doing this month")
    expect(titles().some((t) => /quake straps/i.test(t ?? ""))).toBe(false)
  })

  it("Add saves to THIS home — the zip on its profile and the picked tasks — then Home; no account, no new home", async () => {
    render(tree())
    await enterZip("94110")
    fireEvent.click(await screen.findByRole("button", { name: "See this month" }))
    await screen.findByText("Worth doing this month")
    // The quake-strap row asks first; answering Yes picks it.
    fireEvent.click(screen.getByRole("radio", { name: "Yes" }))
    fireEvent.click(await screen.findByRole("button", { name: /^Add \d task/ }))
    expect(await screen.findByText("HOME")).toBeInTheDocument()
    expect(svc.save).toHaveBeenCalledTimes(1)
    const [homeId, current, patch, tasks] = svc.save.mock.calls[0]
    expect(homeId).toBe("h1")
    expect(current).toMatchObject({ home_id: "h1", home_type: "house" })
    expect(patch).toMatchObject({ zip: "94110", climate_source: "zip", area: expect.objectContaining({ county: "San Francisco County" }) })
    expect((tasks as { key: string }[]).length).toBeGreaterThan(0)
    expect(svc.commit).not.toHaveBeenCalled()
    expect(svc.addToExisting).not.toHaveBeenCalled()
    expect(screen.queryByText("Keep your list")).toBeNull()
  })

  it("nothing new: step 3 says so in one line, and Go to Home still keeps the zip", async () => {
    // Everything the zip could bring is already turned down.
    svc.read.mockResolvedValue({ data: { profile: profile({ dismissed_care: ["home.quake_straps"] }), existing: [] }, error: null })
    render(tree())
    await enterZip("94110")
    fireEvent.click(await screen.findByRole("button", { name: "See this month" }))
    await screen.findByText("Worth doing this month")
    expect(titles()).toEqual([])
    expect(screen.getByTestId("first-list-empty")).toHaveTextContent("Your zip doesn’t add anything new this month.")
    tap("Go to Home")
    expect(await screen.findByText("HOME")).toBeInTheDocument()
    expect(svc.save.mock.calls[0][2]).toMatchObject({ zip: "94110" })
    expect(svc.save.mock.calls[0][3]).toEqual([])
  })

  it("Not now on step 1 goes back to Home and writes nothing", async () => {
    render(tree())
    await screen.findByRole("heading", { name: "Where's home?" })
    tap("Not now")
    expect(await screen.findByText("HOME")).toBeInTheDocument()
    expect(svc.save).not.toHaveBeenCalled()
  })

  it("a failed save is said, and nothing claims success", async () => {
    svc.save.mockResolvedValue({ kind: "failed", message: "Couldn't save your zip. Check your connection and try again.", createdHomeId: null, addedKeys: [] })
    render(tree())
    await enterZip("94110")
    fireEvent.click(await screen.findByRole("button", { name: "See this month" }))
    await screen.findByText("Worth doing this month")
    fireEvent.click(screen.getByRole("radio", { name: "Yes" }))
    fireEvent.click(await screen.findByRole("button", { name: /^Add \d task/ }))
    expect(await screen.findByText("Couldn't save your zip. Check your connection and try again.")).toBeInTheDocument()
    expect(screen.queryByText("HOME")).toBeNull()
    // Try again runs the same save.
    svc.save.mockImplementation(async (_h: string, _p: unknown, _patch: unknown, tasks: { key: string }[]) => ({ kind: "saved", homeId: "h1", addedKeys: tasks.map((t) => t.key) }))
    tap(/try again/i)
    expect(await screen.findByText("HOME")).toBeInTheDocument()
    await waitFor(() => expect(svc.save).toHaveBeenCalledTimes(2))
  })

  it("a failed read of the home is said, with Try again — never a list built on nothing", async () => {
    svc.read.mockResolvedValueOnce({ data: null, error: "Couldn't reach the server to load your tasks." })
    render(tree())
    expect(await screen.findByText("Couldn't load your home")).toBeInTheDocument()
    expect(screen.queryByLabelText("Zip code")).toBeNull()
    tap("Try again")
    expect(await screen.findByRole("heading", { name: "Where's home?" })).toBeInTheDocument()
  })
})
