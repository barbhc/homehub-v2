/**
 * Service providers when a delete or the list read fails (audit H6).
 *
 * `remove` threw out of a `void remove(id)`: an unhandled rejection, the row
 * stuck on its spinner, nothing said. A failed list read rendered "No service
 * providers yet" for a list it never read.
 *
 * Moved here from ServiceProvidersSection's test when Settings' copy of the
 * list became a link to this page (2026-11-21): one list, one failure test.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"

const fs = vi.hoisted(() => ({ getDocs: vi.fn(), commit: vi.fn() }))
vi.mock("@/integrations/firebase", () => ({ db: {} }))
vi.mock("firebase/firestore", () => ({
  collection: vi.fn(), doc: vi.fn(), query: vi.fn(), where: vi.fn(), serverTimestamp: vi.fn(), getDoc: vi.fn(),
  getDocs: (...a: unknown[]) => fs.getDocs(...a),
  writeBatch: () => ({ set() { return this }, commit: () => fs.commit() }),
  Timestamp: class {},
}))
vi.mock("@/modules/home", () => ({ useCurrentHome: () => ({ home: { home_id: "home-1" } }) }))

const { default: ProvidersPage } = await import("./ProvidersPage")

const docs = [{ id: "p1", data: () => ({ name: "Ace Plumbing", category: "plumber", phone: "555-0100", deletedAt: null }) }]
const renderPage = () => render(<MemoryRouter><ProvidersPage /></MemoryRouter>)

beforeEach(() => {
  vi.clearAllMocks()
  fs.getDocs.mockResolvedValue({ docs })
  fs.commit.mockResolvedValue(undefined)
})

describe("ProvidersPage — failures are said", () => {
  it("a delete the server refuses keeps the provider listed and says so", async () => {
    fs.commit.mockRejectedValue(new Error("permission-denied"))
    renderPage()

    fireEvent.click(await screen.findByRole("button", { name: "Delete Ace Plumbing" }))

    expect(await screen.findByText("Couldn't delete that provider. Check your connection and try again.")).toBeInTheDocument()
    expect(screen.getAllByText("Ace Plumbing").length).toBeGreaterThan(0)
    // Not stuck on its spinner: the button is live again.
    await waitFor(() => expect(screen.getByRole("button", { name: "Delete Ace Plumbing" })).toBeEnabled())
  })

  it("a list that could not be read says so — not 'No service providers yet'", async () => {
    fs.getDocs.mockRejectedValueOnce(new Error("unavailable"))
    renderPage()

    expect(await screen.findByText("Couldn't load your providers")).toBeInTheDocument()
    expect(screen.queryByText("No service providers yet")).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect((await screen.findAllByText("Ace Plumbing")).length).toBeGreaterThan(0)
  })
})
