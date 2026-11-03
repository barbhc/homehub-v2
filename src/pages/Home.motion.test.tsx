/**
 * Home · the small motions (Apple polish phase 2):
 *  · skeleton → content fades in, a warm render does not;
 *  · pull to refresh runs Home's own reload ONCE past the threshold, not at
 *    all short of it, and a FAILED pull lands in Home's existing "couldn't
 *    reach the server" note — never a silent no-op (the critical-flow
 *    failure-path test the error-handling standard asks for).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { useSyncExternalStore } from "react"

const dash = vi.hoisted(() => ({
  isLoading: false,
  hasStats: true,
  error: undefined as Error | undefined,
  failRefresh: false,
  refreshes: 0,
  listeners: new Set<() => void>(),
  version: 0,
}))
const notify = () => {
  dash.version++
  dash.listeners.forEach((l) => l())
}

vi.mock("@/lib/useDashboard", () => ({
  useDashboard: () => {
    useSyncExternalStore(
      (l) => { dash.listeners.add(l); return () => dash.listeners.delete(l) },
      () => dash.version,
    )
    return {
      tasks: dash.hasStats ? { overdue: [], dueSoon: [] } : undefined,
      stats: dash.hasStats ? { totalItems: 3, scheduledTaskCount: 5, nextUp: null, completedThisMonth: 0 } : undefined,
      upcoming: [],
      expiringWarranties: [],
      notices: { recalls: [], missingDetails: [] },
      cleaningGuides: [],
      isLoading: dash.isLoading,
      error: dash.error,
      // Like useDashboard's refresh: SWR records a failed revalidation as the
      // hook's `error` (it does not reject), and Home re-renders with it.
      refresh: async () => {
        dash.refreshes++
        await Promise.resolve()
        dash.error = dash.failRefresh ? new Error("Loading your home timed out.") : undefined
        notify()
      },
    }
  },
}))
vi.mock("@/modules/care", () => ({
  markTaskInstanceDone: vi.fn(), snoozeTaskInstance: vi.fn(), unsnoozeTaskInstance: vi.fn(),
}))
vi.mock("@/modules/auth", () => ({ useAuth: () => ({ user: { id: "uid-1" } }) }))
vi.mock("@/modules/home", () => ({
  useCurrentHome: () => ({ home: { home_id: "home-1", name: "Test Home" }, homes: [], setCurrentHome: () => {}, refresh: async () => {} }),
  useHomeProfile: () => ({ profile: { completed_at: "2026-01-01", preferred_mode: null }, error: undefined }),
}))
vi.mock("@/hooks/useUserLevel", () => ({ useUserLevel: () => ({ level: "engaged", derivedLevel: "engaged" }) }))
vi.mock("@/hooks/useFeatureTour", () => ({ useFeatureTour: () => ({ restartTour: () => {} }) }))
vi.mock("@/hooks/useDisplayName", () => ({ useDisplayName: () => ({ firstName: null, fullName: null }) }))
vi.mock("@/components/dashboard/WhatsNewBanner", () => ({ WhatsNewBanner: () => null }))
vi.mock("@/components/dashboard/LevelUnlockBanner", () => ({ LevelUnlockBanner: () => null }))
vi.mock("@/components/dashboard/PushOptInNudge", () => ({ PushOptInNudge: () => null }))
vi.mock("@/components/home/HomeSwitcherSheet", () => ({ HomeSwitcherSheet: () => null }))
vi.mock("@/components/home/RefinedHome", () => ({ RefinedHome: () => <p>Home content</p> }))
vi.mock("@/components/home/DesktopHome", () => ({ DesktopHome: () => null }))

const { default: Home } = await import("./Home")

const page = () => (
  <MemoryRouter>
    <Home />
  </MemoryRouter>
)
/** Home's root: the element holding the content (and the pull's listeners). */
const root = () => screen.getByText("Home content").closest(".flex.flex-col.pb-8") as HTMLElement

function touch(type: string, target: Element, y?: number) {
  const e = new Event(type, { bubbles: true, cancelable: true })
  const touches = y === undefined ? [] : [{ clientX: 100, clientY: y }]
  Object.defineProperty(e, "touches", { value: touches })
  target.dispatchEvent(e)
  return e
}
async function pull(px: number) {
  const target = screen.getByText("Home content")
  await act(async () => {
    touch("touchstart", target, 100)
    for (let i = 1; i <= 4; i++) touch("touchmove", target, 100 + (px * i) / 4)
    touch("touchend", target)
    // Let the reload settle (its promise chain and the re-render it causes).
    for (let i = 0; i < 5; i++) await Promise.resolve()
  })
}

beforeEach(() => {
  dash.isLoading = false
  dash.hasStats = true
  dash.error = undefined
  dash.failRefresh = false
  dash.refreshes = 0
})
afterEach(() => vi.restoreAllMocks())

describe("Home · skeleton → content", () => {
  it("a warm render (content on the first frame) does not fade", () => {
    render(page())
    expect(root().className).not.toContain("hh-fade-in")
  })

  it("content that replaces the skeleton fades in", () => {
    dash.isLoading = true
    dash.hasStats = false
    const { rerender } = render(page())
    expect(screen.getByTestId("home-skeleton")).toBeInTheDocument()
    dash.isLoading = false
    dash.hasStats = true
    rerender(page())
    expect(root().className).toContain("hh-fade-in")
  })
})

describe("Home · pull to refresh", () => {
  it("80px refreshes exactly once; 30px does not refresh", async () => {
    render(page())
    await pull(30)
    expect(dash.refreshes).toBe(0)
    await pull(80)
    expect(dash.refreshes).toBe(1)
  })

  it("the pull keeps iOS from scrolling ONLY while it owns the gesture", async () => {
    render(page())
    const target = screen.getByText("Home content")
    let down: Event | undefined
    let up: Event | undefined
    await act(async () => {
      touch("touchstart", target, 100)
      down = touch("touchmove", target, 104)
      touch("touchend", target)
      touch("touchstart", target, 300)
      up = touch("touchmove", target, 290)
      touch("touchend", target)
      for (let i = 0; i < 5; i++) await Promise.resolve()
    })
    expect(down?.defaultPrevented).toBe(true)
    expect(up?.defaultPrevented).toBe(false)
  })

  it("a failed refresh shows Home's error note, never a silent no-op", async () => {
    dash.failRefresh = true
    render(page())
    expect(screen.queryByText(/couldn.t reach the server/)).not.toBeInTheDocument()
    await pull(90)
    expect(dash.refreshes).toBe(1)
    expect(screen.getByText(/couldn.t reach the server/)).toBeInTheDocument()
    // And the pull is free again afterwards: a retry by pulling works.
    dash.failRefresh = false
    await pull(90)
    expect(dash.refreshes).toBe(2)
    expect(screen.queryByText(/couldn.t reach the server/)).not.toBeInTheDocument()
  })
})
