import { renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const getDevToolsEnabled = vi.fn<(uid: string) => Promise<boolean>>()
vi.mock("@/lib/userPreferences", () => ({ getDevToolsEnabled: (uid: string) => getDevToolsEnabled(uid) }))
vi.mock("@/modules/auth", () => ({ useAuth: () => ({ user: { id: "u1" } }) }))

import { useAutoFindManualsActive } from "./useAutoFindManuals"

const KEY = "homehub:auto-find-manuals"

describe("useAutoFindManualsActive", () => {
  beforeEach(() => {
    localStorage.clear()
    getDevToolsEnabled.mockReset()
  })

  it("stays off, and reads nothing, when the switch was never turned on", () => {
    const { result } = renderHook(() => useAutoFindManualsActive())
    expect(result.current).toBe(false)
    expect(getDevToolsEnabled).not.toHaveBeenCalled()
  })

  it("ignores a stored 'on' for a person who cannot see the switch", async () => {
    localStorage.setItem(KEY, "true")
    getDevToolsEnabled.mockResolvedValue(false)
    const { result } = renderHook(() => useAutoFindManualsActive())
    await waitFor(() => expect(getDevToolsEnabled).toHaveBeenCalledWith("u1"))
    expect(result.current).toBe(false)
  })

  it("runs for a person who can see the switch and turned it on", async () => {
    localStorage.setItem(KEY, "true")
    getDevToolsEnabled.mockResolvedValue(true)
    const { result } = renderHook(() => useAutoFindManualsActive())
    await waitFor(() => expect(result.current).toBe(true))
  })

  it("stays off when the prefs read fails", async () => {
    localStorage.setItem(KEY, "true")
    getDevToolsEnabled.mockRejectedValue(new Error("offline"))
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const { result } = renderHook(() => useAutoFindManualsActive())
    await waitFor(() => expect(warn).toHaveBeenCalled())
    expect(result.current).toBe(false)
    warn.mockRestore()
  })
})
