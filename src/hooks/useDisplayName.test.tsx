/**
 * useDisplayName — the greeting's name, or null when we don't know it.
 *
 * Signing out used to clear the name with setState inside the effect; H5 (the
 * whole-app lint) clears it in the render that signs out. Pinned: a stored name
 * is read and split to a first name; signing out drops it at once; with no
 * stored name the provider's name is seeded once.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"

const auth = vi.hoisted(() => ({ user: null as null | { id: string; user_metadata?: Record<string, unknown> } }))
const fs = vi.hoisted(() => ({ stored: null as string | null, setDoc: vi.fn() }))
vi.mock("@/modules/auth", () => ({ useAuth: () => ({ user: auth.user }) }))
vi.mock("@/integrations/firebase", () => ({ db: {}, auth: { currentUser: { displayName: "Barb Chang" } } }))
vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, path: string) => path,
  getDoc: async () => ({ exists: () => fs.stored !== null, get: () => fs.stored }),
  setDoc: (...a: unknown[]) => fs.setDoc(...a),
  serverTimestamp: () => "ts",
}))

const { useDisplayName } = await import("./useDisplayName")

describe("useDisplayName", () => {
  beforeEach(() => {
    fs.stored = null
    fs.setDoc.mockReset().mockResolvedValue(undefined)
  })

  it("reads the stored name, and signing out drops it at once", async () => {
    auth.user = { id: "u1" }
    fs.stored = "Sonia Lopez"
    const { result, rerender } = renderHook(() => useDisplayName())
    await waitFor(() => expect(result.current).toEqual({ firstName: "Sonia", fullName: "Sonia Lopez" }))

    auth.user = null
    rerender()
    expect(result.current).toEqual({ firstName: null, fullName: null })
  })

  it("with nothing stored, seeds the provider's name once", async () => {
    auth.user = { id: "u2" }
    const { result } = renderHook(() => useDisplayName())
    await waitFor(() => expect(result.current.fullName).toBe("Barb Chang"))
    expect(fs.setDoc).toHaveBeenCalledTimes(1)
    expect(fs.setDoc.mock.calls[0][0]).toBe("users/u2")
  })
})
