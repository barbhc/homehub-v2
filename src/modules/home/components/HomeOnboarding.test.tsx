/**
 * Step 1 of the first minute (D8): the zip screen, which also creates the home.
 *
 * The anti-stray-home guard is kept from the name screen it replaced: when the
 * "do I already have a home?" pre-check FAILS, nothing may call createHome
 * (during the launch incident this guard fell through and minted a duplicate
 * home). Then must-be-true 1–4 of design/first-minute-onboarding.md.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { HomeOnboarding } from "./HomeOnboarding"

const getPrimaryHome = vi.fn()
const createHome = vi.fn()
const upsertHomeProfile = vi.fn()
vi.mock("../services/homeService", () => ({
  getPrimaryHome: (...a: unknown[]) => getPrimaryHome(...a),
  createHome: (...a: unknown[]) => createHome(...a),
}))
vi.mock("../services/homeProfileService", () => ({
  upsertHomeProfile: (...a: unknown[]) => upsertHomeProfile(...a),
}))
vi.mock("../services/growthGate", () => ({
  getGateStatus: async () => ({ gateOn: false, admitted: true }),
  redeemInviteCode: vi.fn(),
}))
vi.mock("@/modules/auth", () => ({
  useAuth: () => ({ user: { id: "uid-1", email: "t@t.t", user_metadata: {} }, loading: false }),
}))

const fetchSpy = vi.fn()
beforeEach(() => {
  getPrimaryHome.mockReset()
  createHome.mockReset()
  upsertHomeProfile.mockReset()
  getPrimaryHome.mockResolvedValue({ data: null, error: null })
  createHome.mockResolvedValue({ data: { homeId: "h-new" }, error: null })
  upsertHomeProfile.mockResolvedValue({ data: {}, error: null })
  fetchSpy.mockReset()
  vi.stubGlobal("fetch", fetchSpy)
})
afterEach(() => vi.unstubAllGlobals())

function renderStep(onComplete = vi.fn()) {
  render(<MemoryRouter><HomeOnboarding onComplete={onComplete} /></MemoryRouter>)
  return onComplete
}
const typeZip = (zip: string) => fireEvent.change(screen.getByLabelText("Zip code"), { target: { value: zip } })
const tap = (name: RegExp) => fireEvent.click(screen.getByRole("button", { name }))

describe("the duplicate-home guard", () => {
  it("pre-check ERROR → hard stop: shows error, never calls createHome", async () => {
    getPrimaryHome.mockResolvedValue({ data: null, error: { message: "query failed" } })
    const onComplete = renderStep()
    tap(/skip for now/i)
    await waitFor(() => expect(screen.getByText(/couldn't check your account/i)).toBeInTheDocument())
    expect(createHome).not.toHaveBeenCalled()
    expect(onComplete).not.toHaveBeenCalled()
  })

  it("existing home → completes without creating another, and writes nothing over its answers", async () => {
    getPrimaryHome.mockResolvedValue({
      data: { home_id: "h1", name: "SF Condo", timezone: "", created_at: "", updated_at: "", deleted_at: null },
      error: null,
    })
    const onComplete = renderStep()
    typeZip("94110")
    tap(/^continue$/i)
    await waitFor(() => expect(onComplete).toHaveBeenCalledWith("h1"))
    expect(createHome).not.toHaveBeenCalled()
    expect(upsertHomeProfile).not.toHaveBeenCalled()
  })

  it("genuinely no home → creates ONE, named for her (D1a)", async () => {
    const onComplete = renderStep()
    tap(/skip for now/i)
    await waitFor(() => expect(onComplete).toHaveBeenCalledWith("h-new"))
    expect(createHome).toHaveBeenCalledExactlyOnceWith({ name: "My home", userId: "uid-1" })
  })
})

describe("must-be-true", () => {
  it("1: asks for a zip only — no street address, no location request", () => {
    const geo = vi.fn()
    vi.stubGlobal("navigator", { ...navigator, geolocation: { getCurrentPosition: geo, watchPosition: geo } })
    renderStep()
    expect(screen.getByLabelText("Zip code")).toHaveAttribute("maxLength", "5")
    expect(screen.queryByLabelText(/address|street/i)).toBeNull()
    expect(screen.getByText("Only the zip, never your street. It stays in Homehub.")).toBeInTheDocument()
    expect(geo).not.toHaveBeenCalled()
  })

  it("2: a known zip is looked up on the device — no request carries it — and its area is saved", async () => {
    const onComplete = renderStep()
    typeZip("94110")
    tap(/^continue$/i)
    await waitFor(() => expect(onComplete).toHaveBeenCalledWith("h-new"))
    for (const call of fetchSpy.mock.calls) expect(JSON.stringify(call)).not.toContain("94110")
    expect(upsertHomeProfile).toHaveBeenCalledWith("h-new", expect.objectContaining({
      zip: "94110", climate: "mild", freeze_risk: false, climate_source: "zip",
      area: expect.objectContaining({ hazards: ["earthquake"], county: "San Francisco County", hardinessZone: "10b" }),
    }))
  })

  it("3: Skip still creates the home and moves on, with nothing about the area saved", async () => {
    const onComplete = renderStep()
    tap(/skip for now/i)
    await waitFor(() => expect(onComplete).toHaveBeenCalled())
    expect(upsertHomeProfile).not.toHaveBeenCalled()
  })

  it("4: an unknown zip says so and offers the four climate choices; the choice is hers", async () => {
    const onComplete = renderStep()
    typeZip("00000")
    tap(/^continue$/i)
    expect(await screen.findByText("We don’t have 00000. Pick your climate instead.")).toBeInTheDocument()
    expect(screen.getAllByRole("radio").map((r) => r.textContent?.split(/[A-Z][a-z]+ [a-z]/)[0])).toHaveLength(4)
    expect(createHome).not.toHaveBeenCalled()
    expect(screen.getByRole("button", { name: /^continue$/i })).toBeDisabled()
    fireEvent.click(screen.getByRole("radio", { name: /Cold/ }))
    tap(/^continue$/i)
    await waitFor(() => expect(onComplete).toHaveBeenCalledWith("h-new"))
    expect(upsertHomeProfile).toHaveBeenCalledWith("h-new", { climate: "cold", freeze_risk: true, climate_source: "owner" })
  })

  it("a failed zip write after the home exists keeps the screen, and Try again never makes a second home", async () => {
    upsertHomeProfile.mockResolvedValueOnce({ data: null, error: { message: "unavailable" } })
    const onComplete = renderStep()
    typeZip("94110")
    tap(/^continue$/i)
    expect(await screen.findByText("Couldn't save your zip. Check your connection and try again.")).toBeInTheDocument()
    expect(onComplete).not.toHaveBeenCalled()
    tap(/^continue$/i)
    await waitFor(() => expect(onComplete).toHaveBeenCalledWith("h-new"))
    expect(createHome).toHaveBeenCalledOnce()
  })
})
