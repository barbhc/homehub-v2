/**
 * "Add your zip" (seventeen fixes, mock m5). Quoted must-be-true:
 *   "Closing the row is saved with her account, per home, and it does not come back."
 * And the brief: a 44px ✕ labelled "Not now"; the close is saved on the SERVER
 * the way the old banner's was; every failed write is visible.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"

const prefs = vi.hoisted(() => ({ get: vi.fn(), dismiss: vi.fn() }))
vi.mock("@/lib/userPreferences", () => ({
  getDismissedZipRows: (...a: unknown[]) => prefs.get(...a),
  dismissZipRow: (...a: unknown[]) => prefs.dismiss(...a),
}))

const { ZipRow } = await import("./ZipRow")
const renderRow = (homeId = "h1") => render(<MemoryRouter><ZipRow homeId={homeId} userId="u1" tree="phone" /></MemoryRouter>)

beforeEach(() => {
  cleanup()
  vi.clearAllMocks()
  window.localStorage.clear()
  prefs.get.mockResolvedValue([])
  prefs.dismiss.mockResolvedValue(undefined)
})

describe("the zip row", () => {
  it("reads 'Add your zip', opens the zip screens, and has a 44px 'Not now' ✕", async () => {
    renderRow()
    const row = await screen.findByTestId("zip-row")
    expect(row).toHaveTextContent("Add your zip")
    expect(row).toHaveTextContent("Get the tasks that matter for your weather and area.")
    expect(screen.getByRole("link", { name: /Add your zip/ })).toHaveAttribute("href", "/home/zip")
    const x = screen.getByRole("button", { name: "Not now" })
    expect(x.className).toContain("size-11")
  })

  it("✕ saves the close on the server for this home and the row is gone (not rendered)", async () => {
    renderRow()
    fireEvent.click(await screen.findByRole("button", { name: "Not now" }))
    expect(screen.queryByTestId("zip-row")).toBeNull()
    expect(prefs.dismiss).toHaveBeenCalledWith("u1", "h1")
  })

  it("a close made elsewhere (another device, a wiped cache) keeps it away", async () => {
    prefs.get.mockResolvedValue(["h1"])
    renderRow()
    await waitFor(() => expect(prefs.get).toHaveBeenCalled())
    expect(screen.queryByTestId("zip-row")).toBeNull()
  })

  it("closed for one home is not closed for another", async () => {
    prefs.get.mockResolvedValue(["h1"])
    renderRow("h2")
    expect(await screen.findByTestId("zip-row")).toBeInTheDocument()
  })

  it("a close the server refused brings the row back and says so", async () => {
    prefs.dismiss.mockRejectedValue(new Error("offline"))
    renderRow()
    fireEvent.click(await screen.findByRole("button", { name: "Not now" }))
    expect(await screen.findByText("Couldn't save that. Check your connection and try again.")).toBeInTheDocument()
    expect(screen.getByTestId("zip-row")).toBeInTheDocument()
  })

  it("a failed read shows the row rather than hide an answer she can give", async () => {
    prefs.get.mockRejectedValue(new Error("offline"))
    renderRow()
    expect(await screen.findByTestId("zip-row")).toBeInTheDocument()
  })
})
