/**
 * Settings › House rules — the ledger of what task feedback taught the app.
 *
 * Its read moved from a component-level load() called by an effect into the
 * effect's own callback (H5, react-hooks/set-state-in-effect). Pinned: it
 * loads, lists each rule with its reason, says when there are none, shows a
 * failed read, and re-reads for a different home.
 */
import { describe, expect, it, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"

const listHouseRules = vi.hoisted(() => vi.fn())
vi.mock("@/modules/care", () => ({
  listHouseRules: (...a: unknown[]) => listHouseRules(...a),
  deleteHouseRule: vi.fn(),
}))

const { HouseRulesSection } = await import("./HouseRulesSection")

const rule = (id: string, reason: string) => ({ id, reason, createdAt: null })

describe("HouseRulesSection", () => {
  beforeEach(() => listHouseRules.mockReset())

  it("loads and lists each rule by its reason", async () => {
    listHouseRules.mockResolvedValue({ data: [rule("r1", "Hide winterizing — the home doesn't freeze")], error: null })
    render(<HouseRulesSection homeId="home-1" />)
    expect(screen.getByText("Loading…")).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText("Hide winterizing — the home doesn't freeze")).toBeInTheDocument())
    expect(listHouseRules).toHaveBeenCalledWith("home-1")
  })

  it("says when there are none", async () => {
    listHouseRules.mockResolvedValue({ data: [], error: null })
    render(<HouseRulesSection homeId="home-1" />)
    await waitFor(() => expect(screen.getByText(/No adjustments yet/)).toBeInTheDocument())
  })

  it("shows a failed read instead of an empty ledger with nothing said", async () => {
    listHouseRules.mockResolvedValue({ data: null, error: { message: "Couldn't load your house rules." } })
    render(<HouseRulesSection homeId="home-1" />)
    await waitFor(() => expect(screen.getByText("Couldn't load your house rules.")).toBeInTheDocument())
  })

  it("re-reads for a different home", async () => {
    listHouseRules.mockImplementation(async (homeId: string) => ({
      data: [rule("r", homeId === "home-2" ? "Second home rule" : "First home rule")], error: null,
    }))
    const { rerender } = render(<HouseRulesSection homeId="home-1" />)
    await waitFor(() => expect(screen.getByText("First home rule")).toBeInTheDocument())
    rerender(<HouseRulesSection homeId="home-2" />)
    await waitFor(() => expect(screen.getByText("Second home rule")).toBeInTheDocument())
  })
})
