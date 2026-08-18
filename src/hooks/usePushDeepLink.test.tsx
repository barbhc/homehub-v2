/**
 * Following a notification tap across homes.
 *
 * A user can belong to more than one home, and the daily push now names the
 * home it came from. Tapping a reminder about the second home while the first
 * is selected used to open a task the current home doesn't contain — a dead end
 * that reads as a broken notification. These pin the four cases.
 */
import { describe, expect, it, vi, beforeEach } from "vitest"
import { render } from "@testing-library/react"
import { act } from "react"
import { usePushDeepLink } from "./usePushDeepLink"
import { DEEP_LINK_EVENT } from "@/lib/pushDeepLink"

const navigate = vi.fn()
vi.mock("react-router-dom", () => ({ useNavigate: () => navigate }))

const claimDeepLink = vi.fn()
vi.mock("@/lib/pushDeepLink", () => ({
  claimDeepLink: () => claimDeepLink(),
  DEEP_LINK_EVENT: "homehub:deep-link",
}))

const setCurrentHome = vi.fn()
let homeState = {
  home: { home_id: "h1", name: "My House" },
  homes: [{ home_id: "h1" }, { home_id: "h2" }],
  homesReady: true,
  setCurrentHome,
}
vi.mock("@/modules/home", () => ({ useCurrentHome: () => homeState }))

function Probe() {
  usePushDeepLink()
  return null
}

beforeEach(() => {
  navigate.mockReset()
  setCurrentHome.mockReset()
  claimDeepLink.mockReset().mockReturnValue(null)
  homeState = {
    home: { home_id: "h1", name: "My House" },
    homes: [{ home_id: "h1" }, { home_id: "h2" }],
    homesReady: true,
    setCurrentHome,
  }
})

describe("usePushDeepLink", () => {
  it("follows a legacy link with no home param immediately", () => {
    claimDeepLink.mockReturnValueOnce("/tasks/abc")
    render(<Probe />)
    expect(navigate).toHaveBeenCalledWith("/tasks/abc")
    expect(setCurrentHome).not.toHaveBeenCalled()
  })

  it("follows a link for the home already selected without switching", () => {
    claimDeepLink.mockReturnValueOnce("/tasks/abc?home=h1")
    render(<Probe />)
    expect(navigate).toHaveBeenCalledWith("/tasks/abc?home=h1")
    expect(setCurrentHome).not.toHaveBeenCalled()
  })

  it("switches home first when the push is about the OTHER home", () => {
    claimDeepLink.mockReturnValueOnce("/tasks/xyz?home=h2")
    render(<Probe />)
    expect(setCurrentHome).toHaveBeenCalledWith("h2")
    expect(navigate).toHaveBeenCalledWith("/tasks/xyz?home=h2")
    // The switch must be ordered before the navigation, or the destination
    // mounts against the wrong home and 404s.
    expect(setCurrentHome.mock.invocationCallOrder[0]).toBeLessThan(navigate.mock.invocationCallOrder[0])
  })

  it("waits for the homes list before switching, then follows", () => {
    homeState = { ...homeState, homesReady: false }
    claimDeepLink.mockReturnValueOnce("/tasks/xyz?home=h2")
    const { rerender } = render(<Probe />)
    // Nothing yet: switching against a list we haven't loaded would just miss.
    expect(navigate).not.toHaveBeenCalled()
    expect(setCurrentHome).not.toHaveBeenCalled()

    homeState = { ...homeState, homesReady: true }
    rerender(<Probe />)
    expect(setCurrentHome).toHaveBeenCalledWith("h2")
    expect(navigate).toHaveBeenCalledWith("/tasks/xyz?home=h2")
  })

  it("navigates without switching when the named home isn't one of yours", () => {
    claimDeepLink.mockReturnValueOnce("/tasks/xyz?home=gone")
    render(<Probe />)
    // Removed from that home, or the lookup failed. Swallowing the tap would be
    // worse than today's behaviour; this is exactly today's behaviour.
    expect(setCurrentHome).not.toHaveBeenCalled()
    expect(navigate).toHaveBeenCalledWith("/tasks/xyz?home=gone")
  })

  it("follows a WARM tap that arrives while the app is already open", () => {
    render(<Probe />)
    expect(navigate).not.toHaveBeenCalled()

    claimDeepLink.mockReturnValueOnce("/tasks/warm?home=h2")
    act(() => {
      window.dispatchEvent(new Event(DEEP_LINK_EVENT))
    })
    expect(setCurrentHome).toHaveBeenCalledWith("h2")
    expect(navigate).toHaveBeenCalledWith("/tasks/warm?home=h2")
  })
})
