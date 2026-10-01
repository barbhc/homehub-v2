/**
 * Service providers when a delete or the list read fails (audit H6).
 *
 * `remove` threw out of a `void remove(id)`: an unhandled rejection, the row
 * stuck on its spinner, nothing said. A failed list read rendered "No service
 * providers added yet" for a list it never read.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"

const fs = vi.hoisted(() => ({ getDocs: vi.fn(), commit: vi.fn() }))
vi.mock("@/integrations/firebase", () => ({ db: {} }))
vi.mock("firebase/firestore", () => ({
  collection: vi.fn(), doc: vi.fn(), query: vi.fn(), where: vi.fn(), serverTimestamp: vi.fn(), getDoc: vi.fn(),
  getDocs: (...a: unknown[]) => fs.getDocs(...a),
  writeBatch: () => ({ set() { return this }, commit: () => fs.commit() }),
  Timestamp: class {},
}))

const { ServiceProvidersSection } = await import("./ServiceProvidersSection")

const docs = [{ id: "p1", data: () => ({ name: "Ace Plumbing", category: "plumber", phone: "555-0100", deletedAt: null }) }]

beforeEach(() => {
  vi.clearAllMocks()
  fs.getDocs.mockResolvedValue({ docs })
  fs.commit.mockResolvedValue(undefined)
})

describe("ServiceProvidersSection — failures are said", () => {
  it("a delete the server refuses keeps the provider listed and says so", async () => {
    fs.commit.mockRejectedValue(new Error("permission-denied"))
    render(<ServiceProvidersSection homeId="home-1" />)

    fireEvent.click(await screen.findByRole("button", { name: "Delete Ace Plumbing" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't delete that provider.")
    expect(screen.getByText("Ace Plumbing")).toBeInTheDocument()
    // Not stuck on its spinner: the button is live again.
    await waitFor(() => expect(screen.getByRole("button", { name: "Delete Ace Plumbing" })).toBeEnabled())
  })

  it("a list that could not be read says so — not 'No service providers added yet'", async () => {
    fs.getDocs.mockRejectedValueOnce(new Error("unavailable"))
    render(<ServiceProvidersSection homeId="home-1" />)

    expect(await screen.findByText("Couldn't load your service providers.")).toBeInTheDocument()
    expect(screen.queryByText("No service providers added yet.")).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(await screen.findByText("Ace Plumbing")).toBeInTheDocument()
  })
})
