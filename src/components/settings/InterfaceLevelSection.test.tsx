/**
 * The interface level, when its save fails (audit H6).
 *
 * The local cache flipped at once and the server write's failure was
 * swallowed — then useInterfaceLevelSync restored the server's OLD level on
 * the next launch, so the choice quietly un-made itself. A failed save now
 * puts the choice back and says so.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"

const setInterfaceLevelPref = vi.fn()
vi.mock("@/modules/auth", () => ({ useAuth: () => ({ user: { id: "uid-1" } }) }))
vi.mock("@/lib/userPreferences", () => ({ setInterfaceLevelPref: (...a: unknown[]) => setInterfaceLevelPref(...a) }))

const { InterfaceLevelSection } = await import("./InterfaceLevelSection")
const { getInterfaceOverride, setInterfaceOverride } = await import("@/lib/interfaceLevel")

beforeEach(() => {
  vi.clearAllMocks()
  window.localStorage.clear()
  setInterfaceLevelPref.mockResolvedValue(undefined)
})

const pressed = (label: string) => screen.getByRole("button", { name: new RegExp(`^${label}`) }).getAttribute("aria-pressed")

describe("InterfaceLevelSection", () => {
  it("a failed save puts the previous level back and says so", async () => {
    setInterfaceLevelPref.mockRejectedValue(new Error("unavailable"))
    render(<InterfaceLevelSection />)
    expect(pressed("Standard")).toBe("true")

    fireEvent.click(screen.getByRole("button", { name: /^Advanced/ }))

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't save your choice.")
    expect(pressed("Standard")).toBe("true")
    expect(pressed("Advanced")).toBe("false")
    expect(getInterfaceOverride()).toBe("standard")
  })

  it("a save that lands keeps the new level, with nothing to say (the control case)", async () => {
    render(<InterfaceLevelSection />)
    fireEvent.click(screen.getByRole("button", { name: /^Advanced/ }))
    await waitFor(() => expect(setInterfaceLevelPref).toHaveBeenCalledWith("uid-1", "advanced"))
    expect(pressed("Advanced")).toBe("true")
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("a level the sync applies after mount is what a failed save reverts to — not the mount-time value", async () => {
    render(<InterfaceLevelSection />)
    expect(pressed("Standard")).toBe("true")
    // useInterfaceLevelSync (AppLayout) lands the server's level after this
    // section has mounted.
    act(() => setInterfaceOverride("advanced"))
    expect(pressed("Advanced")).toBe("true")

    setInterfaceLevelPref.mockRejectedValue(new Error("unavailable"))
    fireEvent.click(screen.getByRole("button", { name: /^Simple/ }))

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't save your choice.")
    // Back to what the server holds — the old code went to "standard", which
    // matched neither the server nor the tap.
    expect(pressed("Advanced")).toBe("true")
    expect(getInterfaceOverride()).toBe("advanced")
  })
})
