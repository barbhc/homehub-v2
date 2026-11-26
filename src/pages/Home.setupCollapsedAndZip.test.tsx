/**
 * Seventeen fixes, mocks m3 and m5 (owner-approved 2026-11-25), on Home itself.
 *
 * m3 — Home after "Not now" on the empty-Home card. Quoted must-be-true:
 *   "With the card collapsed, Home shows the greeting, the date and the Ask box with starter questions."
 *   "The row still reads 'Tell us what's in your home' and opens the full card."
 *   "In a pinch is shown."
 *   "Next up, Coming up, 'All quiet' and the profile banner are not rendered."
 *   (The tour waiting is the card's data-tour-halt: WhatsInYourHomeCard.test.tsx.)
 *
 * m5 — the profile banner becomes the zip row. Quoted:
 *   "Nothing is rendered above the greeting on Home."
 *   "The zip row shows only when the home has no zip."
 *   "'Finish your home profile' is not rendered on Home."
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"

const dash = vi.hoisted(() => ({ totalItems: 0, scheduledTaskCount: 0, upcoming: [] as unknown[] }))
const prof = vi.hoisted(() => ({ profile: { completed_at: null, preferred_mode: null, zip: null as string | null, freeze_risk: null, area: null } }))

vi.mock("@/hooks/useServiceProviders", () => ({ useServiceProviders: () => ({ providers: [], loading: false, loadFailed: false }) }))
vi.mock("@/modules/care", () => ({
  getHomeNotes: vi.fn(async () => ({ data: [], error: null })),
  markTaskInstanceDone: vi.fn(), snoozeTaskInstance: vi.fn(), unsnoozeTaskInstance: vi.fn(), previewNextDue: vi.fn(async () => null),
  getTaskDetail: vi.fn(async () => ({ data: null, error: null })),
}))
vi.mock("@/lib/useDashboard", () => ({
  useDashboard: () => ({
    tasks: { overdue: [], dueSoon: [] },
    stats: { totalItems: dash.totalItems, scheduledTaskCount: dash.scheduledTaskCount, nextUp: null, completedThisMonth: 0 },
    upcoming: dash.upcoming, expiringWarranties: [], notices: { recalls: [], missingDetails: [] }, cleaningGuides: [],
    isLoading: false, error: undefined, refresh: async () => {},
  }),
}))
vi.mock("@/modules/auth", () => ({ useAuth: () => ({ user: { id: "uid-1" } }) }))
vi.mock("@/modules/home", () => ({
  useCurrentHome: () => ({ home: { home_id: "home-1", name: "My home", created_by: "uid-1" }, homes: [], setCurrentHome: () => {}, refresh: async () => {} }),
  useHomeProfile: () => ({ profile: prof.profile, error: undefined, refresh: async () => {} }),
}))
vi.mock("@/integrations/firebase", () => ({ auth: { currentUser: null } }))
vi.mock("@/hooks/useUserLevel", () => ({ useUserLevel: () => ({ level: "essentials", derivedLevel: "essentials" }) }))
vi.mock("@/hooks/useFeatureTour", () => ({ useFeatureTour: () => ({ restartTour: () => {} }) }))
vi.mock("@/hooks/useDisplayName", () => ({ useDisplayName: () => ({ firstName: null, fullName: null }) }))
vi.mock("@/components/dashboard/WhatsNewBanner", () => ({ WhatsNewBanner: () => null }))
vi.mock("@/components/dashboard/PushOptInNudge", () => ({ PushOptInNudge: () => <div data-testid="push-nudge" /> }))
vi.mock("@/components/home/HomeSwitcherSheet", () => ({ HomeSwitcherSheet: () => null }))
vi.mock("@/components/home/NextStepCard", () => ({ NextStepCard: () => null }))
vi.mock("@/components/home/MonthlyRefreshCard", () => ({ MonthlyRefreshCard: () => null }))
vi.mock("@/lib/userPreferences", () => ({ getDismissedZipRows: vi.fn(async () => []), dismissZipRow: vi.fn(async () => {}) }))
// The card's own stages are WhatsInYourHomeCard.test.tsx's; here, where Home puts it and how it lays out around it.
vi.mock("@/components/home/WhatsInYourHomeCard", () => ({
  WhatsInYourHomeCard: ({ onCollapsedChange }: { onCollapsedChange?: (c: boolean) => void }) => {
    const collapsed = window.localStorage.getItem("hh.emptyHome.collapsed.home-1") === "1"
    return collapsed ? (
      <section data-testid="empty-home-collapsed">
        <button type="button" onClick={() => { window.localStorage.removeItem("hh.emptyHome.collapsed.home-1"); onCollapsedChange?.(false) }}>
          Tell us what&apos;s in your home
        </button>
      </section>
    ) : (
      <div data-testid="empty-home-card">
        <button type="button" onClick={() => { window.localStorage.setItem("hh.emptyHome.collapsed.home-1", "1"); onCollapsedChange?.(true) }}>Not now</button>
      </div>
    )
  },
}))

const { default: Home } = await import("./Home")
const renderHome = () => render(<MemoryRouter><Home /></MemoryRouter>)

/** One of the two lanes, as a scope. Phone first (the lg:hidden wrapper). */
const phone = () => document.querySelector(".lg\\:hidden") as HTMLElement
const desktop = () => document.querySelector(".hidden.lg\\:block") as HTMLElement

beforeEach(() => {
  cleanup()
  window.localStorage.clear()
  dash.totalItems = 0
  dash.scheduledTaskCount = 0
  dash.upcoming = []
  prof.profile = { completed_at: null, preferred_mode: null, zip: null, freeze_risk: null, area: null }
})

describe("m3: an empty Home after Not now", () => {
  it("before Not now, the full card stands alone (unchanged)", () => {
    renderHome()
    expect(screen.getByTestId("empty-home-card")).toBeInTheDocument()
    expect(screen.queryByPlaceholderText("Ask about your home…")).toBeNull()
  })

  it("after Not now: greeting, date, Ask and its starters, the row in Next up's place, then In a pinch", async () => {
    renderHome()
    fireEvent.click(screen.getByRole("button", { name: "Not now" }))
    for (const lane of [phone(), desktop()]) {
      expect(within(lane).getByText(/^Good (morning|afternoon|evening)/)).toBeInTheDocument()
      expect(within(lane).getByTestId("ask-starters")).toBeInTheDocument()
      expect(within(lane).getByTestId("empty-home-collapsed")).toBeInTheDocument()
    }
    // In a pinch reads once, in the lane on screen (the phone here).
    expect(await within(phone()).findByTestId("in-a-pinch")).toBeInTheDocument()
    // The phone lane's Ask box, and its order: Ask, the row, then In a pinch.
    const p = phone()
    expect(within(p).getByPlaceholderText("Ask about your home…")).toBeInTheDocument()
    const order = [...p.querySelectorAll("[data-testid]")].map((e) => e.getAttribute("data-testid"))
    expect(order.indexOf("ask-starters")).toBeLessThan(order.indexOf("empty-home-collapsed"))
    expect(order.indexOf("empty-home-collapsed")).toBeLessThan(order.indexOf("in-a-pinch"))
    // The full card is gone, not hidden.
    expect(screen.queryByTestId("empty-home-card")).toBeNull()
  })

  it("Next up, Coming up, All quiet and the profile banner are not rendered", () => {
    window.localStorage.setItem("hh.emptyHome.collapsed.home-1", "1")
    renderHome()
    expect(screen.getAllByTestId("empty-home-collapsed")).toHaveLength(2)
    expect(screen.queryByTestId("next-up")).toBeNull()
    expect(screen.queryByText("Next up")).toBeNull()
    expect(screen.queryByText("Coming up")).toBeNull()
    expect(screen.queryByText(/All quiet/)).toBeNull()
    expect(screen.queryByText("Finish your home profile")).toBeNull()
    // Nor the zip row: the setup row is this Home's one ask.
    expect(screen.queryByTestId("zip-row")).toBeNull()
  })

  it("the row opens the full card again", () => {
    window.localStorage.setItem("hh.emptyHome.collapsed.home-1", "1")
    renderHome()
    fireEvent.click(within(phone()).getByRole("button", { name: "Tell us what's in your home" }))
    expect(screen.getByTestId("empty-home-card")).toBeInTheDocument()
    expect(screen.queryByTestId("empty-home-collapsed")).toBeNull()
  })
})

describe("m5: the zip row, below Next up", () => {
  const task = { id: "ti-1", title: "Test the smoke alarms", next_due_date: new Date().toISOString().slice(0, 10), itemName: null, item_id: null, priority: "critical", duePhrase: null, safetyNote: null }

  it("shows once, in the lane on screen, after Next up, when the home has no zip", async () => {
    dash.totalItems = 2
    dash.scheduledTaskCount = 3
    dash.upcoming = [task]
    renderHome()
    const rows = await screen.findAllByTestId("zip-row")
    // One row: the phone lane is the one on screen here (useIsDesktop false).
    expect(rows).toHaveLength(1)
    const p = phone()
    const order = [...p.querySelectorAll("[data-testid]")].map((e) => e.getAttribute("data-testid"))
    expect(order.indexOf("next-up")).toBeGreaterThan(-1)
    expect(order.indexOf("next-up")).toBeLessThan(order.indexOf("zip-row"))
    const row = within(p).getByTestId("zip-row")
    expect(row).toHaveTextContent("Add your zip")
    expect(row).toHaveTextContent("Get the tasks that matter for your weather and area.")
    expect(within(row).getByRole("link")).toHaveAttribute("href", "/home/zip")
    expect(within(row).getByRole("button", { name: "Not now" })).toBeInTheDocument()
    expect(screen.queryByText("Finish your home profile")).toBeNull()
  })

  it("nothing is rendered above the greeting for an incomplete profile", async () => {
    dash.totalItems = 2
    dash.scheduledTaskCount = 3
    dash.upcoming = [task]
    renderHome()
    await screen.findAllByTestId("zip-row")
    const p = phone()
    const greeting = within(p).getByText(/^Good (morning|afternoon|evening)$/)
    expect(desktop()).toBeTruthy()
    // Inside the page wrapper, nothing comes before the phone lane's greeting
    // but the lane itself (no banner, no nudge — the push nudge waits for a completed profile).
    expect(screen.queryByTestId("push-nudge")).toBeNull()
    const wrapper = p.parentElement!
    expect(wrapper.firstElementChild).toBe(p)
    expect(greeting).toBeInTheDocument()
  })

  it("is not rendered when the home has a zip", () => {
    dash.totalItems = 2
    dash.scheduledTaskCount = 3
    dash.upcoming = [task]
    prof.profile = { ...prof.profile, zip: "94110" }
    renderHome()
    expect(screen.queryByTestId("zip-row")).toBeNull()
  })
})
