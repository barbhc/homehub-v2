/**
 * Settings › Home profile · the zip for a home from before the first minute
 * (D8 edge case "Existing homes keep their climate answer"; mock
 * https://claude.ai/artifact/CvrAvWEQr7wGao9wbAAtUm, approved 2026-11-19).
 * Each `it` is one of the mock's must-be-true lines. The lookup runs against
 * the real bundled table, so 94110 is what ships.
 */
import { describe, expect, it, vi, beforeAll, beforeEach, afterEach } from "vitest"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

const getHomeProfile = vi.hoisted(() => vi.fn())
const upsertHomeProfile = vi.hoisted(() => vi.fn())
const getWinterizingTasks = vi.hoisted(() => vi.fn())
const lookupOverride = vi.hoisted(() => ({ fn: null as null | ((zip: string) => Promise<unknown>) }))
vi.mock("@/modules/home", () => ({
  getHomeProfile: (...a: unknown[]) => getHomeProfile(...a),
  upsertHomeProfile: (...a: unknown[]) => upsertHomeProfile(...a),
  markWinterizingOfferAnswered: vi.fn(),
}))
vi.mock("@/modules/auth", () => ({ useAuth: () => ({ user: { id: "u1" } }) }))
vi.mock("@/modules/care", () => ({
  getWinterizingTasks: (...a: unknown[]) => getWinterizingTasks(...a),
  turnOffWinterizingTasks: vi.fn(),
  undoTurnOffWinterizing: vi.fn(),
}))
vi.mock("@/modules/home/services/zipAreaService", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/modules/home/services/zipAreaService")>()
  return { ...real, lookupZipArea: (zip: string) => (lookupOverride.fn ?? real.lookupZipArea)(zip) }
})

const { HomeProfileSection } = await import("./HomeProfileSection")

type P = Record<string, unknown>
const profile = (over: P = {}): P => ({
  home_type: "condo", ownership: "own", ownership_duration: "5_plus", climate: null, freeze_risk: null,
  climate_source: null, zip: null, area: null, top_concerns: [], preferred_mode: "unset",
  completed_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z", winterizing_offer_answered_at: null, ...over,
})

/** The upsert echoes the stored doc: what was there, merged with the patch. */
function storeFrom(initial: P) {
  let doc = { ...initial }
  upsertHomeProfile.mockImplementation(async (_h: string, patch: P) => {
    doc = { ...doc, ...patch }
    return { data: doc, error: null }
  })
}

async function open(initial: P) {
  getHomeProfile.mockResolvedValue({ data: initial, error: null })
  storeFrom(initial)
  render(<HomeProfileSection homeId="home-1" />)
  return screen.findByLabelText("Zip code")
}

async function typeZip(zip: string) {
  const field = await screen.findByLabelText("Zip code")
  fireEvent.change(field, { target: { value: zip } })
}

const save = () => fireEvent.click(screen.getByRole("button", { name: "Save" }))
const lastPatch = () => upsertHomeProfile.mock.calls.at(-1)![1] as P

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.setPointerCapture ??= () => {}
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.scrollIntoView ??= () => {}
})

let fetchSpy: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  getHomeProfile.mockReset()
  upsertHomeProfile.mockReset()
  getWinterizingTasks.mockReset()
  getWinterizingTasks.mockResolvedValue({ data: [], error: null })
  lookupOverride.fn = null
  fetchSpy = vi.spyOn(globalThis, "fetch")
})
afterEach(() => {
  fetchSpy.mockRestore()
})

describe("nothing changes until a zip is entered", () => {
  it("an empty field saves no zip and no climate fields", async () => {
    await open(profile({ climate: "moderate", freeze_risk: true }))
    save()
    await screen.findByText("Saved")
    const patch = lastPatch()
    expect("zip" in patch).toBe(false)
    expect("area" in patch).toBe(false)
    expect("climate" in patch).toBe(false)
    expect("freeze_risk" in patch).toBe(false)
  })

  it("typing a zip writes nothing until Save", async () => {
    await open(profile())
    await typeZip("94110")
    await screen.findByTestId("zip-facts")
    expect(upsertHomeProfile).not.toHaveBeenCalled()
  })
})

describe("looked up on the device", () => {
  it("shows the area facts, each with Not true here, and no request carries the zip", async () => {
    await open(profile())
    await typeZip("94110")
    const facts = await screen.findByTestId("zip-facts")
    expect(within(facts).getByText("94110 · San Francisco County")).toBeInTheDocument()
    expect(within(facts).getByText("Pipes rarely freeze here")).toBeInTheDocument()
    expect(within(facts).getByText("A typical winter's coldest night is 35 to 40°F.")).toBeInTheDocument()
    expect(within(facts).getByText("Earthquake risk is high")).toBeInTheDocument()
    expect(within(facts).getAllByRole("button", { name: "Not true here" })).toHaveLength(2)
    for (const [arg] of fetchSpy.mock.calls) expect(String(arg)).not.toContain("94110")
  })
})

describe("a home with no climate answer", () => {
  it("shows the zip's climate as 'From your zip' and saves zip, area and climate together", async () => {
    await open(profile())
    await typeZip("94110")
    await screen.findByTestId("climate-from-zip")
    expect(screen.getByRole("combobox", { name: "Local climate" })).toHaveTextContent("Mild — rarely freezes")
    save()
    await screen.findByText("Saved")
    expect(lastPatch()).toMatchObject({
      zip: "94110", climate: "mild", freeze_risk: false, climate_source: "zip",
      area: { hazards: ["earthquake"], hazardsCorrected: [], county: "San Francisco County", hardinessZone: "10b" },
    })
    expect(screen.getByText("San Francisco County. It stays in Homehub.")).toBeInTheDocument()
  })

  it("Not true here on the freeze fact saves the owner's correction, with Undo", async () => {
    await open(profile())
    await typeZip("94110")
    const facts = await screen.findByTestId("zip-facts")
    fireEvent.click(within(facts).getAllByRole("button", { name: "Not true here" })[0])
    expect(within(facts).getByText("Pipes can freeze here")).toBeInTheDocument()
    expect(within(facts).getByText("You changed this. Winterizing stays on.")).toBeInTheDocument()
    expect(within(facts).getByRole("button", { name: "Undo" })).toBeInTheDocument()
    save()
    await screen.findByText("Saved")
    expect(lastPatch()).toMatchObject({ climate: "mild", freeze_risk: true, climate_source: "owner" })
  })

  it("Not true here on a hazard drops it and remembers the correction", async () => {
    await open(profile())
    await typeZip("94110")
    const facts = await screen.findByTestId("zip-facts")
    fireEvent.click(within(facts).getAllByRole("button", { name: "Not true here" })[1])
    expect(within(facts).getByText("Earthquake risk: not here")).toBeInTheDocument()
    save()
    await screen.findByText("Saved")
    expect(lastPatch()).toMatchObject({ area: { hazards: [], hazardsCorrected: ["earthquake"] } })
  })
})

describe("an owner's own climate answer is never overwritten", () => {
  it("keeps her answer in the field and offers the zip's", async () => {
    await open(profile({ climate: "moderate", freeze_risk: true }))
    await typeZip("94110")
    const offer = await screen.findByTestId("zip-climate-offer")
    expect(within(offer).getByText("Your zip suggests Mild — rarely freezes")).toBeInTheDocument()
    expect(within(offer).getByText("You chose Moderate — some frost. Nothing changes unless you pick.")).toBeInTheDocument()
    expect(screen.getByRole("combobox", { name: "Local climate" })).toHaveTextContent("Moderate — some frost")
  })

  it("Save without tapping Use writes the zip but not her climate or freeze risk", async () => {
    await open(profile({ climate: "moderate", freeze_risk: true }))
    await typeZip("94110")
    await screen.findByTestId("zip-climate-offer")
    save()
    await screen.findByText("Saved")
    const patch = lastPatch()
    expect(patch).toMatchObject({ zip: "94110", climate_source: "owner" })
    expect("climate" in patch).toBe(false)
    expect("freeze_risk" in patch).toBe(false)
  })

  it("Keep mine closes the offer and still writes nothing over her answer", async () => {
    await open(profile({ climate: "moderate", freeze_risk: true, climate_source: "owner" }))
    await typeZip("94110")
    fireEvent.click(within(await screen.findByTestId("zip-climate-offer")).getByRole("button", { name: "Keep mine" }))
    expect(screen.queryByTestId("zip-climate-offer")).toBeNull()
    save()
    await screen.findByText("Saved")
    expect("climate" in lastPatch()).toBe(false)
    expect("freeze_risk" in lastPatch()).toBe(false)
  })

  it("Use the zip's writes the zip's values on Save, and Undo puts hers back", async () => {
    await open(profile({ climate: "moderate", freeze_risk: true }))
    await typeZip("94110")
    fireEvent.click(within(await screen.findByTestId("zip-climate-offer")).getByRole("button", { name: "Use the zip’s" }))
    expect(screen.getByRole("combobox", { name: "Local climate" })).toHaveTextContent("Mild — rarely freezes")
    fireEvent.click(screen.getByRole("button", { name: "Undo, keep mine" }))
    expect(screen.getByRole("combobox", { name: "Local climate" })).toHaveTextContent("Moderate — some frost")
    fireEvent.click(within(screen.getByTestId("zip-climate-offer")).getByRole("button", { name: "Use the zip’s" }))
    save()
    await screen.findByText("Saved")
    expect(lastPatch()).toMatchObject({ zip: "94110", climate: "mild", freeze_risk: false, climate_source: "zip" })
  })

  it("no offer when the zip agrees", async () => {
    await open(profile({ climate: "mild", freeze_risk: false }))
    await typeZip("94110")
    await screen.findByTestId("zip-facts")
    expect(screen.queryByTestId("zip-climate-offer")).toBeNull()
  })
})

describe("re-saving other answers", () => {
  it("does not rewrite a zip's freeze risk from the climate list", async () => {
    // Hot by IECC zone but zone 9b, so pipes CAN freeze (Houston). The list's
    // Hot would say they can't; a re-save must not flip it.
    await open(profile({ climate: "hot", freeze_risk: true, climate_source: "zip", zip: "77002" }))
    const user = userEvent.setup()
    await user.click(screen.getByRole("combobox", { name: "Own or rent" }))
    await user.click(await screen.findByRole("option", { name: "I rent it" }))
    save()
    await screen.findByText("Saved")
    const patch = lastPatch()
    expect(patch).toMatchObject({ ownership: "rent" })
    expect("climate" in patch).toBe(false)
    expect("freeze_risk" in patch).toBe(false)
  })
})

describe("failure paths", () => {
  it("a failed Save says so, never 'Saved', and keeps the zip she typed", async () => {
    await open(profile())
    await typeZip("94110")
    await screen.findByTestId("zip-facts")
    upsertHomeProfile.mockResolvedValueOnce({ data: null, error: { message: "Missing or insufficient permissions." } })
    save()
    expect(await screen.findByText("Missing or insufficient permissions.")).toBeInTheDocument()
    expect(screen.queryByText("Saved")).toBeNull()
    expect(screen.getByLabelText("Zip code")).toHaveValue("94110")
    expect(screen.getByTestId("zip-facts")).toBeInTheDocument()
  })

  it("a save the home doc did not keep is not 'Saved'", async () => {
    await open(profile())
    await typeZip("94110")
    await screen.findByTestId("zip-facts")
    upsertHomeProfile.mockResolvedValueOnce({ data: profile({ climate: "mild", freeze_risk: false, zip: null }), error: null })
    save()
    expect(await screen.findByText("Your zip didn't save. Try again.")).toBeInTheDocument()
    expect(screen.queryByText("Saved")).toBeNull()
  })

  it("a table that won't load says so, blocks Save, and Try again really retries", async () => {
    let calls = 0
    lookupOverride.fn = async (zip) => {
      calls += 1
      if (calls === 1) throw new Error("Failed to fetch dynamically imported module")
      const real = await vi.importActual<typeof import("@/modules/home/services/zipAreaService")>("@/modules/home/services/zipAreaService")
      return real.lookupZipArea(zip)
    }
    await open(profile({ climate: "mild", freeze_risk: false }))
    await typeZip("94110")
    expect(await screen.findByText("Couldn’t load area data.")).toBeInTheDocument()
    save()
    expect(await screen.findByText("Couldn’t load area data. Try again, or clear the zip to save the rest.")).toBeInTheDocument()
    expect(upsertHomeProfile).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    await screen.findByTestId("zip-facts")
    await waitFor(() => expect(calls).toBe(2))
  })

  it("an unknown zip says so and is not saved", async () => {
    await open(profile({ climate: "mild", freeze_risk: false }))
    await typeZip("00000")
    expect(await screen.findByText("We don’t have 00000, so it won’t be saved. Your climate below still counts.")).toBeInTheDocument()
    save()
    await screen.findByText("Saved")
    expect("zip" in lastPatch()).toBe(false)
  })

  it("a partial zip blocks Save with a plain message", async () => {
    await open(profile())
    await typeZip("941")
    save()
    expect(await screen.findByText("Enter the five digits of your zip code.")).toBeInTheDocument()
    expect(upsertHomeProfile).not.toHaveBeenCalled()
  })
})

describe("a saved zip", () => {
  it("clearing it removes the zip and its area and leaves the climate", async () => {
    await open(profile({
      climate: "mild", freeze_risk: false, climate_source: "zip", zip: "94110",
      area: { hazards: ["earthquake"], hazardsCorrected: [], hardinessZone: "10b", county: "San Francisco County", observesDst: true, tableVersion: "2026-11-19" },
    }))
    expect(screen.getByText("San Francisco County. It stays in Homehub.")).toBeInTheDocument()
    await typeZip("")
    save()
    await screen.findByText("Saved")
    const patch = lastPatch()
    expect(patch).toMatchObject({ zip: null, area: null })
    expect("climate" in patch).toBe(false)
  })
})
