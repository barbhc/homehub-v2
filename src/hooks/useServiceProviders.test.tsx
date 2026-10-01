/**
 * useServiceProviders — reading the list.
 *
 * Its load() set the spinner synchronously inside the effect that called it
 * (H5, react-hooks/set-state-in-effect). Now one read lands through one
 * function; the spinner starts in the render that switches homes; Try again is
 * its own path. ServiceProvidersSection.failure.test.tsx pins the failure and
 * Try again; this pins the switch: loading at once, then THAT home's list, and
 * a late answer for the home just left never lands.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { act, renderHook, waitFor } from "@testing-library/react"

const fs = vi.hoisted(() => ({ reads: new Map<string, (docs: unknown[]) => void>() }))
vi.mock("@/integrations/firebase", () => ({ db: {} }))
vi.mock("firebase/firestore", () => ({
  collection: (_db: unknown, path: string) => path,
  query: (path: string) => path,
  where: vi.fn(), doc: vi.fn(), getDoc: vi.fn(), serverTimestamp: vi.fn(), writeBatch: vi.fn(),
  getDocs: (path: string) => new Promise((resolve) => fs.reads.set(path, (docs) => resolve({ docs }))),
  Timestamp: class {},
}))

const { useServiceProviders } = await import("./useServiceProviders")

const provider = (id: string, name: string) => ({ id, data: () => ({ name, category: "plumber", deletedAt: null }) })
const answer = (homeId: string, docs: unknown[]) => act(() => fs.reads.get(`homes/${homeId}/serviceProviders`)!(docs))

describe("useServiceProviders · switching homes", () => {
  beforeEach(() => fs.reads.clear())

  it("shows loading at once, then that home's list; the old home's late answer lands nowhere", async () => {
    const { result, rerender } = renderHook(({ homeId }: { homeId: string }) => useServiceProviders(homeId), {
      initialProps: { homeId: "home-1" },
    })
    expect(result.current.loading).toBe(true)
    await answer("home-1", [provider("p1", "Ace Plumbing")])
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.providers.map((p) => p.name)).toEqual(["Ace Plumbing"])

    rerender({ homeId: "home-2" })
    expect(result.current.loading).toBe(true)
    await answer("home-2", [provider("p2", "Bay Drains")])
    await waitFor(() => expect(result.current.providers.map((p) => p.name)).toEqual(["Bay Drains"]))
    expect(result.current.loading).toBe(false)
  })

  it("a read for a home already left does not land", async () => {
    const { result, rerender } = renderHook(({ homeId }: { homeId: string }) => useServiceProviders(homeId), {
      initialProps: { homeId: "home-1" },
    })
    rerender({ homeId: "home-2" })
    await answer("home-2", [provider("p2", "Bay Drains")])
    await waitFor(() => expect(result.current.providers.map((p) => p.name)).toEqual(["Bay Drains"]))
    await answer("home-1", [provider("p1", "Ace Plumbing")])
    expect(result.current.providers.map((p) => p.name)).toEqual(["Bay Drains"])
  })
})
