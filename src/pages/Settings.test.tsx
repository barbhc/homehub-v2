/**
 * Settings is one short menu (design/settings-your-home.md; the approved phone
 * mock is the list of what must be true):
 *  - every row is there, in the mock's order, opening the page it names;
 *  - a row's value is only ever something that was READ. A count or a level
 *    that is still loading, or failed to load, is left off the row;
 *  - the Internal row is not rendered without `dev_tools`;
 *  - the old one-page Settings' anchors (/settings#notifications…) land where
 *    each section lives now, and an unknown page goes back to the menu;
 *  - Sign out is on the menu, and a sign-out that fails says so.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { MemoryRouter, Route, Routes, useLocation, useNavigationType } from "react-router-dom"
import { OLD_SETTINGS_ANCHORS } from "@/lib/settingsPaths"

type Result<T> = { data: T; error: null } | { data: null; error: { message: string } }

const m = vi.hoisted(() => ({
  signOut: vi.fn(),
  getHomeMembers: vi.fn(),
  getDevToolsEnabled: vi.fn(),
  isSubscribed: vi.fn(),
  pushSupported: true,
  fullName: "E2E Tester" as string | null,
  level: { profile: { task_level: "recommended" } as { task_level: string | null } | null, isLoading: false, error: undefined as Error | undefined },
  providers: { providers: [{}, {}, {}, {}] as object[], loading: false, loadFailed: false },
}))

vi.mock("@/modules/auth", () => ({ useAuth: () => ({ user: { id: "uid-1", email: "e2e@homehub.test" }, signOut: m.signOut }) }))
vi.mock("@/modules/home", () => ({
  useHomeProfile: () => ({ ...m.level, refresh: vi.fn() }),
  useCurrentHome: () => ({ home: { home_id: "home-1", name: "E2E Test Home" }, homes: [{ home_id: "home-1", name: "E2E Test Home" }], setCurrentHome: () => {}, refresh: async () => {} }),
  getHomeMembers: (...a: unknown[]) => m.getHomeMembers(...a),
}))
vi.mock("@/lib/userPreferences", () => ({
  getNotificationPrefs: vi.fn(async () => ({})),
  setNotificationPrefs: vi.fn(),
  getDevToolsEnabled: (...a: unknown[]) => m.getDevToolsEnabled(...a),
}))
vi.mock("@/lib/pushNotifications", () => ({
  isPushSupported: () => m.pushSupported,
  isSubscribed: () => m.isSubscribed(),
  subscribeToPush: vi.fn(),
  unsubscribeFromPush: vi.fn(),
}))
vi.mock("@/lib/nativePush", () => ({
  isNativePlatform: () => false,
  isNativePushRegistered: async () => false,
  registerNativePush: vi.fn(),
  unregisterNativePush: vi.fn(),
  PushOffError: class PushOffError extends Error {},
}))
vi.mock("@/hooks/useDisplayName", () => ({ useDisplayName: () => ({ firstName: null, fullName: m.fullName }) }))
vi.mock("@/hooks/useServiceProviders", () => ({ useServiceProviders: () => m.providers }))
vi.mock("@/hooks/useAutoFindManuals", () => ({ useAutoFindManuals: () => [false, vi.fn()] }))
vi.mock("@/modules/knowledge", () => ({
  getManualsByHome: vi.fn(async () => ({ data: [], error: null })),
  getKnowledgeChunksByHome: vi.fn(), getFaqsByHome: vi.fn(), deleteManualDocument: vi.fn(), ingestReference: vi.fn(),
}))
vi.mock("@/modules/items", () => ({ getItemUnits: vi.fn() }))
vi.mock("@/modules/care", () => ({ getTaskTemplates: vi.fn() }))
vi.mock("@/lib/manualRescan", () => ({
  isReferenceDoc: () => false, openPendingReview: vi.fn(), rescanForReviewAndWait: vi.fn(), rescanTargets: () => [], startRescanForReview: vi.fn(),
}))
vi.mock("@/integrations/firebase", () => ({ db: {}, callable: () => vi.fn() }))
vi.mock("firebase/firestore", () => ({
  collection: vi.fn(), doc: vi.fn(), query: vi.fn(), where: vi.fn(), serverTimestamp: vi.fn(), setDoc: vi.fn(),
  getDoc: vi.fn(async () => ({ exists: () => false, get: () => undefined })),
  getDocs: vi.fn(async () => ({ docs: [] })),
}))
// Pages with their own reads and their own tests: a marker is enough here.
for (const path of [
  "@/components/settings/HomeMembersSection",
  "@/components/settings/TaskLevelSection",
  "@/components/settings/AdminToolsSection",
  "@/components/settings/NotificationsRefusedNote",
  "@/components/settings/BootDiagnostics",
  "@/components/FeedbackButton",
]) {
  const name = path.split("/").pop()!
  vi.doMock(path, () => ({ [name]: () => <span>[{name}]</span> }))
}

const { default: Settings } = await import("./Settings")

const members = (n: number): Result<{ user_id: string }[]> => ({ data: Array.from({ length: n }, (_, i) => ({ user_id: `u${i}` })), error: null })

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  m.signOut.mockResolvedValue(undefined)
  m.getHomeMembers.mockResolvedValue(members(1))
  m.getDevToolsEnabled.mockResolvedValue(false)
  m.isSubscribed.mockResolvedValue(true)
  m.pushSupported = true
  m.fullName = "E2E Tester"
  m.level = { profile: { task_level: "recommended" }, isLoading: false, error: undefined }
  m.providers = { providers: [{}, {}, {}, {}], loading: false, loadFailed: false }
})

/** Always on screen, beside whichever route matched: where the router is, and how it got there. */
function Where() {
  const loc = useLocation()
  return <span data-testid="where" data-nav={useNavigationType()}>{loc.pathname + loc.search + loc.hash}</span>
}
const renderAt = (at: string) =>
  render(
    <MemoryRouter initialEntries={[at]}>
      <Where />
      <Routes>
        <Route path="/settings" element={<Settings />} />
        <Route path="/settings/:pane" element={<Settings />} />
        <Route path="*" element={<span data-testid="elsewhere" />} />
      </Routes>
    </MemoryRouter>,
  )
const row = (key: string) => screen.getByTestId(`settings-row-${key}`)

describe("Settings — the menu", () => {
  it("lists every row in the mock's order, each opening its own page", async () => {
    renderAt("/settings")
    expect(await screen.findByText("Just you")).toBeInTheDocument()
    expect(screen.getByRole("heading", { level: 1, name: "Settings" })).toBeInTheDocument()
    const links = within(screen.getByTestId("settings-menu")).getAllByRole("link")
    expect(links.map((l) => [l.getAttribute("data-testid")?.replace("settings-row-", ""), l.getAttribute("href")])).toEqual([
      ["account", "/settings/account"],
      ["your-home", "/your-home"],
      ["providers", "/providers"],
      ["members", "/settings/members"],
      ["task-level", "/settings/task-level"],
      ["homes", "/settings/homes"],
      ["notifications", "/settings/notifications"],
      ["appearance", "/settings/appearance"],
      ["export", "/settings/export"],
      ["privacy", "/settings/privacy"],
      ["help", "/settings/help"],
    ])
    // The three groups, by the labels on the mock.
    for (const label of ["This home", "App", "Your data"]) {
      expect(screen.getByRole("region", { name: label })).toBeInTheDocument()
    }
  })

  it("each row says what was read: the name and email, counts, the level, the home, On, the theme", async () => {
    renderAt("/settings")
    await screen.findByText("Just you")
    expect(row("account")).toHaveTextContent("E2E Tester")
    expect(row("account")).toHaveTextContent("e2e@homehub.test")
    expect(row("your-home")).toHaveTextContent("Zip, home type, shutoffs and notes")
    expect(row("providers")).toHaveTextContent("4 saved")
    expect(row("members")).toHaveTextContent("Just you")
    expect(row("task-level")).toHaveTextContent("Recommended too")
    expect(row("homes")).toHaveTextContent("E2E Test Home")
    await waitFor(() => expect(row("notifications")).toHaveTextContent("On"))
    expect(row("appearance")).toHaveTextContent("System")
    // The three under "Your data" are a name and an arrow, nothing else.
    expect(row("export").textContent).toBe("Export your data")
    expect(row("privacy").textContent).toBe("Data & privacy")
    expect(row("help").textContent).toBe("Report a problem")
  })

  it.each([
    ["essential", "Essential only"],
    ["recommended", "Recommended too"],
    ["everything", "Everything"],
    // A home that never chose behaves as Everything (taskLevelOf), and says so.
    [null, "Everything"],
  ])("task level %s reads “%s”", async (stored, label) => {
    m.level = { profile: { task_level: stored }, isLoading: false, error: undefined }
    renderAt("/settings")
    await screen.findByText("Just you")
    expect(row("task-level")).toHaveTextContent(`Task level${label}`)
  })

  it("counts more than one member as people, and no saved providers as the plain line", async () => {
    m.getHomeMembers.mockResolvedValue(members(3))
    m.providers = { providers: [], loading: false, loadFailed: false }
    renderAt("/settings")
    expect(await screen.findByText("3 people")).toBeInTheDocument()
    expect(row("providers")).toHaveTextContent("Your trusted pros")
    expect(row("providers")).not.toHaveTextContent("saved")
  })

  it("notifications that are off read Off; another theme reads its name", async () => {
    m.isSubscribed.mockResolvedValue(false)
    localStorage.setItem("hh-appearance", "dark")
    renderAt("/settings")
    await waitFor(() => expect(row("notifications")).toHaveTextContent("NotificationsOff"))
    expect(row("appearance")).toHaveTextContent("AppearanceDark")
  })

  it("has no Notifications row where this device can't get pushes (as before)", async () => {
    m.pushSupported = false
    renderAt("/settings")
    await screen.findByText("Just you")
    expect(screen.queryByTestId("settings-row-notifications")).toBeNull()
    expect(row("appearance")).toBeInTheDocument()
  })

  it("a person with no stored name is “Your account”", async () => {
    m.fullName = null
    renderAt("/settings")
    await screen.findByText("Just you")
    expect(row("account")).toHaveTextContent("Your account")
  })
})

describe("Settings — a row never states what was not read", () => {
  it("while the reads are in flight, the rows carry no value", () => {
    m.getHomeMembers.mockReturnValue(new Promise(() => {}))
    m.isSubscribed.mockReturnValue(new Promise(() => {}))
    m.level = { profile: null, isLoading: true, error: undefined }
    m.providers = { providers: [], loading: true, loadFailed: false }
    renderAt("/settings")
    expect(row("members").textContent).toBe("Members")
    expect(row("task-level").textContent).toBe("Task level")
    expect(row("notifications").textContent).toBe("Notifications")
    expect(row("providers")).toHaveTextContent("Your trusted pros")
    expect(screen.queryByText(/saved/)).toBeNull()
  })

  it("a members read that fails leaves the row bare — never “Just you” — and is logged", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    m.getHomeMembers.mockResolvedValue({ data: null, error: { message: "permission-denied" } })
    renderAt("/settings")
    await waitFor(() => expect(warn).toHaveBeenCalledWith(expect.stringContaining("members of home home-1"), "permission-denied"))
    expect(row("members").textContent).toBe("Members")
    expect(screen.queryByText("Just you")).toBeNull()
    expect(screen.queryByText(/people/)).toBeNull()
  })

  it("a task level that fails to load leaves the row bare — never “Everything” — and is logged", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    m.level = { profile: null, isLoading: false, error: new Error("unavailable") }
    renderAt("/settings")
    await waitFor(() => expect(warn).toHaveBeenCalledWith(expect.stringContaining("task level of home home-1"), "unavailable"))
    expect(row("task-level").textContent).toBe("Task level")
    expect(screen.queryByText("Everything")).toBeNull()
  })

  it("providers that could not be read are not “0 saved”", async () => {
    m.providers = { providers: [], loading: false, loadFailed: true }
    renderAt("/settings")
    await screen.findByText("Just you")
    expect(row("providers")).toHaveTextContent("Your trusted pros")
    expect(screen.queryByText(/saved/)).toBeNull()
  })

  it("a notifications read that fails leaves the row bare and is logged", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    m.isSubscribed.mockRejectedValue(new Error("no permission api"))
    renderAt("/settings")
    await waitFor(() => expect(warn).toHaveBeenCalledWith(expect.stringContaining("notifications are on"), "no permission api"))
    expect(row("notifications").textContent).toBe("Notifications")
  })
})

describe("Settings — internal tools", () => {
  it("the Internal row is not rendered without dev_tools", async () => {
    renderAt("/settings")
    await waitFor(() => expect(m.getDevToolsEnabled).toHaveBeenCalledWith("uid-1"))
    await screen.findByText("Just you")
    // Not in the DOM at all (not merely hidden).
    expect(screen.queryAllByTestId("settings-row-internal")).toHaveLength(0)
    expect(screen.queryByRole("region", { name: "Internal" })).toBeNull()
  })

  it("is the last group for a person whose prefs say dev_tools: true", async () => {
    m.getDevToolsEnabled.mockResolvedValue(true)
    renderAt("/settings")
    const internal = await screen.findByTestId("settings-row-internal")
    expect(internal).toHaveAttribute("href", "/settings/internal")
    expect(internal).toHaveTextContent("Internal tools")
  })

  it("/settings/internal sends a person without the flag back to the menu", async () => {
    renderAt("/settings/internal")
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent(/^\/settings$/))
    expect(screen.getByTestId("where")).toHaveAttribute("data-nav", "REPLACE")
    expect(screen.queryByText("[BootDiagnostics]")).toBeNull()
  })

  it("/settings/internal opens for a person with the flag", async () => {
    m.getDevToolsEnabled.mockResolvedValue(true)
    renderAt("/settings/internal")
    expect(await screen.findByText("[BootDiagnostics]")).toBeInTheDocument()
    expect(screen.getByTestId("where")).toHaveTextContent("/settings/internal")
  })
})

describe("Settings — addresses", () => {
  it("an unknown page goes back to the menu, replacing the address", async () => {
    renderAt("/settings/nope")
    expect(await screen.findByRole("heading", { level: 1, name: "Settings" })).toBeInTheDocument()
    expect(screen.getByTestId("where")).toHaveTextContent(/^\/settings$/)
    expect(screen.getByTestId("where")).toHaveAttribute("data-nav", "REPLACE")
  })

  it.each(Object.entries(OLD_SETTINGS_ANCHORS))("the old /settings#%s lands on %s, replacing the address", (anchor, to) => {
    renderAt(`/settings#${anchor}`)
    const where = screen.getByTestId("where")
    expect(where.textContent).toBe(to)
    expect(where).toHaveAttribute("data-nav", "REPLACE")
  })

  it("covers every section the one-page Settings had an anchor for", () => {
    expect(Object.keys(OLD_SETTINGS_ANCHORS).sort()).toEqual([
      "account", "appearance", "beta", "data", "home-profile", "home-setup", "homes", "house-rules", "level",
      "manuals", "members", "notifications", "privacy", "providers", "reminders", "rooms", "task-level", "tasks",
    ])
  })

  it("a hash that was never an anchor leaves the menu as it is", async () => {
    renderAt("/settings#something-else")
    expect(await screen.findByRole("heading", { level: 1, name: "Settings" })).toBeInTheDocument()
    expect(screen.getByTestId("where")).toHaveTextContent("/settings#something-else")
  })
})

describe("Settings — Sign out", () => {
  it("signs out and leaves for the front page", async () => {
    renderAt("/settings")
    fireEvent.click(await screen.findByRole("button", { name: "Sign out" }))
    await waitFor(() => expect(m.signOut).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.getByTestId("where").textContent).toBe("/"))
    expect(screen.getByTestId("where")).toHaveAttribute("data-nav", "REPLACE")
  })

  it("a sign-out that fails says so, stays on Settings, and can be tried again", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    m.signOut.mockRejectedValueOnce(new Error("network-request-failed"))
    renderAt("/settings")

    fireEvent.click(await screen.findByRole("button", { name: "Sign out" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't sign out. Check your connection and try again.")
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("could not sign out"), "network-request-failed")
    expect(screen.getByTestId("where").textContent).toBe("/settings")
    const again = screen.getByRole("button", { name: "Sign out" })
    expect(again).toBeEnabled()

    fireEvent.click(again)
    await waitFor(() => expect(screen.getByTestId("where").textContent).toBe("/"))
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("is drawn in clay, the full width of its card", async () => {
    renderAt("/settings")
    const button = await screen.findByRole("button", { name: "Sign out" })
    expect(button.style.color).toBe("var(--hh-clay)")
    expect(button.className).toContain("w-full")
  })
})

describe("Settings — what left the menu is not on it", () => {
  it("has no interface picker, feature tour, reminders card, rooms or custom tasks", async () => {
    renderAt("/settings")
    await screen.findByText("Just you")
    for (const gone of [/Simple/, /Advanced/, /Feature tour/i, /Restart tour/i, /Your reminders/i, /Rooms/, /Custom tasks/i, /On this page/i, /House rules/i, /Home profile/i]) {
      expect(screen.queryByText(gone)).toBeNull()
    }
  })
})
