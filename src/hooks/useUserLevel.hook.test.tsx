/**
 * The level is the DERIVED level — for everyone (audit finding 11,
 * design/settings-your-home.md).
 *
 * Settings had a Simple / Standard / Advanced picker that forced the level
 * down or up, stored in localStorage (`homehub:interface-level`) and in the
 * prefs doc (`interface_level`). It is gone, and a choice someone stored
 * before must not still apply: a person who had picked Simple is on the level
 * their home derives, like everyone else.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { SWRConfig } from "swr"

const m = vi.hoisted(() => ({ items: 0, homes: 1, profileDone: false, getDoc: vi.fn() }))

vi.mock("@/modules/home", () => ({ useCurrentHome: () => ({ home: { home_id: "h1" } }) }))
vi.mock("@/modules/auth", () => ({ useAuth: () => ({ user: { id: "u1" } }) }))
vi.mock("@/integrations/firebase", () => ({ db: {} }))
vi.mock("firebase/firestore", () => ({
  collection: (_db: unknown, path: string) => ({ kind: "items", path }),
  collectionGroup: () => ({ kind: "members" }),
  query: (ref: unknown) => ref,
  where: vi.fn(),
  doc: (_db: unknown, path: string) => ({ path }),
  getDocs: async (ref: { kind: string }) => ({ size: ref.kind === "items" ? m.items : m.homes }),
  getDoc: (...a: unknown[]) => m.getDoc(...a),
}))

const { useUserLevel } = await import("./useUserLevel")

const wrapper = ({ children }: { children: ReactNode }) => (
  <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>{children}</SWRConfig>
)

beforeEach(() => {
  localStorage.clear()
  m.getDoc.mockReset()
  m.items = 0
  m.homes = 1
  m.profileDone = false
  // Asked only for the home doc. A read of the prefs doc would be the override coming back.
  m.getDoc.mockImplementation(async (ref: { path: string }) => {
    if (ref.path !== "homes/h1") throw new Error(`unexpected read of ${ref.path}`)
    return { get: (field: string) => (field === "profileCompletedAt" && m.profileDone ? "2026-01-01" : null) }
  })
})

describe("useUserLevel — a stored interface choice no longer applies", () => {
  it("someone who had picked Simple gets the level their home derives (power at 15 items)", async () => {
    localStorage.setItem("homehub:interface-level", "simple")
    m.items = 15
    const { result } = renderHook(() => useUserLevel(), { wrapper })
    await waitFor(() => expect(result.current.derivedLevel).toBe("power"))
    expect(result.current.level).toBe("power")
  })

  it("someone who had picked Advanced gets the level their home derives (essentials with no items)", async () => {
    localStorage.setItem("homehub:interface-level", "advanced")
    const { result } = renderHook(() => useUserLevel(), { wrapper })
    await waitFor(() => expect(result.current.derivedLevel).toBe("essentials"))
    expect(result.current.level).toBe("essentials")
  })

  it("the level follows the home as it grows (engaged at 3 items with a finished profile)", async () => {
    localStorage.setItem("homehub:interface-level", "simple")
    m.items = 3
    m.profileDone = true
    const { result } = renderHook(() => useUserLevel(), { wrapper })
    await waitFor(() => expect(result.current.level).toBe("engaged"))
  })

  it("the only document read is the home's — never the prefs doc the choice was saved in", async () => {
    const { result } = renderHook(() => useUserLevel(), { wrapper })
    await waitFor(() => expect(result.current.derivedLevel).not.toBeNull())
    expect([...new Set(m.getDoc.mock.calls.map(([ref]) => (ref as { path: string }).path))]).toEqual(["homes/h1"])
  })
})
