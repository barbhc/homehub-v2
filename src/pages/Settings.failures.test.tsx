/**
 * Settings' pages when a write or a read fails (audit H6).
 *
 * Every case here used to fail in silence, and most of them showed a SUCCESS:
 *  - a notification switch flipped "off" while the save had failed, so the
 *    server kept sending;
 *  - a failed read of the prefs showed the DEFAULTS as if they were the
 *    person's own — and the next tap saved those defaults over the real prefs;
 *  - "Disable" notifications swallowed its own failure and showed "Enable";
 *  - an export with a section it could not read downloaded as if complete.
 * Each test forces the failure and asserts the person SEES it, and that no
 * success state is left standing.
 *
 * Settings is a menu with a page per row now (design/settings-your-home.md),
 * so each case opens the page its section moved to. Rooms and custom tasks
 * left Settings: their cases are in components/items/RoomsManager.*.test.tsx
 * and components/tasks/OwnTasksManager.*.test.tsx. The menu and the routing
 * are in Settings.test.tsx.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom"
import { normalizeNotificationPrefs } from "@/lib/notificationPreferences"

const m = vi.hoisted(() => ({
  getNotificationPrefs: vi.fn(),
  setNotificationPrefs: vi.fn(),
  getDevToolsEnabled: vi.fn(),
  unsubscribeFromPush: vi.fn(),
  getManualsByHome: vi.fn(),
  getItemUnits: vi.fn(),
  unregisterNativePush: vi.fn(),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  /** Render as the iOS shell (native push) rather than a browser. */
  native: false,
}))

vi.mock("@/modules/auth", () => ({ useAuth: () => ({ user: { id: "uid-1", email: "e2e@homehub.test" }, signOut: vi.fn() }) }))
vi.mock("@/modules/home", () => ({
  // D4: the Task level page reads the home profile; these tests are about other pages.
  useHomeProfile: () => ({ profile: null, isLoading: false, error: undefined, refresh: vi.fn() }),
  useCurrentHome: () => ({ home: { home_id: "home-1", name: "Test Home" }, homes: [{ home_id: "home-1", name: "Test Home" }], setCurrentHome: () => {}, refresh: async () => {} }),
  getHomeMembers: vi.fn(async () => ({ data: [{ user_id: "uid-1" }], error: null })),
}))
vi.mock("@/lib/userPreferences", () => ({
  getNotificationPrefs: (...a: unknown[]) => m.getNotificationPrefs(...a),
  setNotificationPrefs: (...a: unknown[]) => m.setNotificationPrefs(...a),
  getDevToolsEnabled: (...a: unknown[]) => m.getDevToolsEnabled(...a),
}))
vi.mock("@/lib/pushNotifications", () => ({
  isPushSupported: () => true,
  isSubscribed: async () => true,
  subscribeToPush: vi.fn(),
  unsubscribeFromPush: (...a: unknown[]) => m.unsubscribeFromPush(...a),
}))
vi.mock("@/lib/nativePush", () => ({
  isNativePlatform: () => m.native,
  // On the phone, reminders start ON (permission granted, not turned off here).
  isNativePushRegistered: async () => m.native,
  registerNativePush: vi.fn(),
  unregisterNativePush: (...a: unknown[]) => m.unregisterNativePush(...a),
  PushOffError: class PushOffError extends Error {
    constructor() {
      super("Couldn't turn off reminders on this phone. Try again, or turn off notifications for Homehub in iOS Settings.")
    }
  },
}))
vi.mock("@/modules/knowledge", () => ({
  getManualsByHome: (...a: unknown[]) => m.getManualsByHome(...a),
  getKnowledgeChunksByHome: vi.fn(async () => ({ data: [], error: null })),
  getFaqsByHome: vi.fn(async () => ({ data: [], error: null })),
  deleteManualDocument: vi.fn(),
  ingestReference: vi.fn(async () => ({ data: { sections_count: 0 }, error: null })),
}))
vi.mock("@/modules/items", () => ({ getItemUnits: (...a: unknown[]) => m.getItemUnits(...a) }))
vi.mock("@/modules/care", () => ({ getTaskTemplates: vi.fn(async () => ({ data: [], error: null })) }))
// The network-touching half is stubbed; `rescanTargets` / `isReferenceDoc` are
// the REAL rule, because a mock that let every manual through would hide what
// the page is now relying on them for.
vi.mock("@/lib/manualRescan", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/manualRescan")>()),
  openPendingReview: vi.fn(),
  rescanForReviewAndWait: vi.fn(),
  startRescanForReview: vi.fn(),
}))
vi.mock("@/hooks/useAutoFindManuals", () => ({ useAutoFindManuals: () => [false, vi.fn()] }))
vi.mock("@/hooks/useDisplayName", () => ({ useDisplayName: () => ({ firstName: null, fullName: null }) }))
vi.mock("@/hooks/useServiceProviders", () => ({ useServiceProviders: () => ({ providers: [], loading: false, loadFailed: false }) }))
vi.mock("@/integrations/firebase", () => ({ db: {}, callable: () => vi.fn() }))
vi.mock("firebase/firestore", () => ({
  collection: vi.fn(), doc: vi.fn(), query: vi.fn(), where: vi.fn(), serverTimestamp: vi.fn(),
  setDoc: (...a: unknown[]) => m.setDoc(...a),
  getDoc: (...a: unknown[]) => m.getDoc(...a),
  getDocs: vi.fn(async () => ({ docs: [] })),
}))
// Sections with their own reads and their own tests.
for (const path of [
  "@/components/settings/HomeMembersSection",
  "@/components/settings/AdminToolsSection",
  "@/components/settings/NotificationsRefusedNote",
  "@/components/settings/BootDiagnostics",
  "@/components/FeedbackButton",
]) {
  const name = path.split("/").pop()!
  // The internal tools render a marker, so their absence can be asserted.
  const marker = name === "BootDiagnostics" || name === "AdminToolsSection" ? `[${name}]` : null
  vi.doMock(path, () => ({ [name]: () => (marker ? <span>{marker}</span> : null) }))
}

const { default: Settings } = await import("./Settings")

/** The person's REAL prefs differ from the defaults, so a defaults-overwrite shows. */
const REAL_PREFS = (() => {
  const p = normalizeNotificationPrefs(undefined)
  return { ...p, events: { ...p.events, task_reminders: { push: false } } }
})()

beforeEach(() => {
  vi.clearAllMocks()
  m.getNotificationPrefs.mockResolvedValue(REAL_PREFS)
  m.setNotificationPrefs.mockResolvedValue(undefined)
  m.getDevToolsEnabled.mockResolvedValue(false)
  m.unsubscribeFromPush.mockResolvedValue(undefined)
  m.getManualsByHome.mockResolvedValue({ data: [], error: null })
  m.getItemUnits.mockResolvedValue({ data: [], error: null })
  m.unregisterNativePush.mockResolvedValue(undefined)
  m.getDoc.mockResolvedValue({ exists: () => true, get: () => "Pat" })
  m.setDoc.mockResolvedValue(undefined)
  m.native = false
})

function Where() {
  const loc = useLocation()
  return <span data-testid="where">{loc.pathname}</span>
}
/** One of Settings' pages, by its address. Anywhere else shows the address it went to. */
const renderPane = (pane: string) =>
  render(
    <MemoryRouter initialEntries={[`/settings/${pane}`]}>
      <Routes>
        <Route path="/settings/:pane" element={<Settings />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  )
const renderSettings = () => renderPane("notifications")

describe("Settings — internal tools", () => {
  it("are not rendered for a person without dev_tools: the page sends them back to the menu", async () => {
    renderPane("internal")
    await waitFor(() => expect(m.getDevToolsEnabled).toHaveBeenCalledWith("uid-1"))
    expect(await screen.findByTestId("where")).toHaveTextContent("/settings")
    expect(screen.queryByText("[BootDiagnostics]")).toBeNull()
    expect(screen.queryByText("[AdminToolsSection]")).toBeNull()
  })

  it("render for a person whose prefs say dev_tools: true", async () => {
    m.getDevToolsEnabled.mockResolvedValue(true)
    renderPane("internal")
    expect(await screen.findByText("[BootDiagnostics]")).toBeInTheDocument()
    expect(screen.getByText("[AdminToolsSection]")).toBeInTheDocument()
    expect(screen.getByRole("heading", { level: 1, name: "Internal tools" })).toBeInTheDocument()
    expect(screen.getByRole("switch", { name: "Find manuals automatically" })).toBeInTheDocument()
  })

  it("stay hidden when the prefs read fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    m.getDevToolsEnabled.mockRejectedValue(new Error("unavailable"))
    renderPane("internal")
    await waitFor(() => expect(warn).toHaveBeenCalledWith(expect.stringContaining("dev_tools"), "unavailable"))
    expect(await screen.findByTestId("where")).toHaveTextContent("/settings")
    expect(screen.queryByText("[BootDiagnostics]")).toBeNull()
    expect(screen.queryByText("[AdminToolsSection]")).toBeNull()
    warn.mockRestore()
  })

  it("manuals that could not be read say so — not '0 manuals uploaded'", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    m.getDevToolsEnabled.mockResolvedValue(true)
    m.getManualsByHome.mockResolvedValue({ data: null, error: { message: "unavailable" } })
    renderPane("internal")
    expect(await screen.findByText("Couldn't load your manuals.")).toBeInTheDocument()
    expect(screen.queryByText(/0 manuals uploaded/)).toBeNull()
  })
})

describe("Settings — every page has a way back and its own heading", () => {
  it.each([
    ["account", "Account"],
    ["members", "Members"],
    ["task-level", "Task level"],
    ["homes", "Homes"],
    ["notifications", "Notifications"],
    ["appearance", "Appearance"],
    ["export", "Export your data"],
    ["privacy", "Data & privacy"],
    ["help", "Report a problem"],
  ])("/settings/%s is headed “%s” once, with a link back to Settings", async (pane, title) => {
    renderPane(pane)
    expect(await screen.findByRole("heading", { level: 1, name: title })).toBeInTheDocument()
    // The section's own heading would repeat the page's.
    expect(screen.getAllByRole("heading", { name: title })).toHaveLength(1)
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/settings")
  })
})

describe("Settings — notification preferences", () => {
  it("a failed save puts the switch back and says so", async () => {
    m.setNotificationPrefs.mockRejectedValue(new Error("unavailable"))
    renderSettings()

    fireEvent.click(await screen.findByRole("button", { name: "Task reminders push off" }))

    expect(await screen.findByText("Couldn't save that change. Check your connection and try again.")).toBeInTheDocument()
    // Back to what the server holds — never left showing the unsaved "on".
    expect(screen.getByRole("button", { name: "Task reminders push off" })).toHaveAttribute("aria-pressed", "false")
    expect(screen.queryByRole("button", { name: "Task reminders push on" })).toBeNull()
  })

  it("a successful save keeps the switch where it was put (the control case)", async () => {
    renderSettings()
    fireEvent.click(await screen.findByRole("button", { name: "Task reminders push off" }))
    await waitFor(() => expect(m.setNotificationPrefs).toHaveBeenCalledTimes(1))
    expect(m.setNotificationPrefs.mock.calls[0][1].events.task_reminders.push).toBe(true)
    expect(screen.getByRole("button", { name: "Task reminders push on" })).toBeInTheDocument()
    expect(screen.queryByText(/Couldn't save that change/)).toBeNull()
  })

  it("a failed read says so — the defaults are never shown as the person's own, or saved over them", async () => {
    m.getNotificationPrefs.mockRejectedValueOnce(new Error("unavailable"))
    renderSettings()

    const alert = (await screen.findByText("Couldn't load your notification settings.")).closest("[role=alert]") as HTMLElement
    expect(alert).not.toBeNull()
    // No switches to press over prefs we never read (defaults would show "on").
    expect(screen.queryByRole("button", { name: /Task reminders push/ })).toBeNull()
    expect(m.setNotificationPrefs).not.toHaveBeenCalled()

    fireEvent.click(within(alert).getByRole("button", { name: "Try again" }))
    expect(await screen.findByRole("button", { name: "Task reminders push off" })).toBeInTheDocument()
  })

  it("with notifications off, the Enable line names everything the switch turns on", async () => {
    renderSettings()
    // On: says what is on by default — not just "due and overdue tasks".
    expect(
      await screen.findByText("On by default: reminders for Essential tasks, deadlines and any task you turn on, a Sunday summary, and buy-ahead heads-ups."),
    ).toBeInTheDocument()
    expect(screen.queryByText(/due and overdue tasks/)).toBeNull()
    fireEvent.click(await screen.findByRole("button", { name: "Disable" }))

    expect(await screen.findByRole("button", { name: "Enable" })).toBeInTheDocument()
    expect(
      screen.getByText("Get reminders for Essential tasks, deadlines and any task you turn on, a Sunday summary of your week, and a heads-up when a part should be bought ahead."),
    ).toBeInTheDocument()
  })

  it("turning notifications OFF that fails says so and stays on", async () => {
    m.unsubscribeFromPush.mockRejectedValue(new Error("permission-denied"))
    renderSettings()

    fireEvent.click(await screen.findByRole("button", { name: "Disable" }))

    expect(await screen.findByText("Couldn't turn off notifications. Check your connection and try again.")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Disable" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Enable" })).toBeNull()
  })

  it("on the phone, a Disable that can't reach this phone's token says so and stays on", async () => {
    m.native = true
    const { PushOffError } = await import("@/lib/nativePush")
    m.unregisterNativePush.mockRejectedValue(new PushOffError())
    renderSettings()

    fireEvent.click(await screen.findByRole("button", { name: "Disable" }))

    expect(await screen.findByText(/Couldn't turn off reminders on this phone/)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Disable" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Enable" })).toBeNull()
  })
})

// Audit 2026-10-28, Package 0: Settings promised what nothing delivers. No push
// lane sends warranty or recall alerts (push/lanes.ts: task reminders and
// buy-ahead only) and nothing schedules the recall check; the export is a JSON
// file of some records, not "all data".
describe("Settings — only promises what ships", () => {
  it("warranty and recall alerts say they're not available, with no switch to press", async () => {
    renderSettings()
    await screen.findByRole("button", { name: "Task reminders push off" })

    expect(screen.getByText("30 days before coverage ends")).toBeInTheDocument()
    expect(screen.getByText("Homehub doesn't check for recalls yet")).toBeInTheDocument()
    expect(screen.getAllByText("Not yet")).toHaveLength(2)
    // Not rendered at all — there is nothing to turn on or off.
    expect(screen.queryByRole("button", { name: /Warranty expiring/ })).toBeNull()
    expect(screen.queryByRole("button", { name: /Safety & recalls/ })).toBeNull()
    expect(screen.queryByText(/always delivered/)).toBeNull()
    // The real switches are untouched.
    expect(screen.getByRole("button", { name: /Buy-ahead reminders push/ })).toBeInTheDocument()
  })

  it("the export says what the file holds and what it leaves out", async () => {
    renderPane("export")
    expect(await screen.findByRole("button", { name: "Export data (JSON)" })).toBeInTheDocument()
    expect(screen.getByText(/Not included yet: photos, receipts, manual files/)).toBeInTheDocument()
    expect(screen.queryByText("Export All Data")).toBeNull()
  })
})

describe("Settings — export", () => {
  it("a section that could not be read refuses the export and says so — nothing is downloaded", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const download = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {})
    m.getItemUnits.mockResolvedValue({ data: null, error: { message: "unavailable" } })
    renderPane("export")

    fireEvent.click(await screen.findByRole("button", { name: "Export data (JSON)" }))

    expect(await screen.findByText("Couldn't export your data. Part of it couldn't be read. Check your connection and try again.")).toBeInTheDocument()
    expect(download).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("could not read items"))
    // Ready to try again, not stuck on "Exporting…".
    expect(screen.getByRole("button", { name: "Export data (JSON)" })).toBeEnabled()
  })

  it("the manual list is one of the sections: unread, it refuses the export too", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const download = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {})
    m.getManualsByHome.mockResolvedValue({ data: null, error: { message: "unavailable" } })
    renderPane("export")

    fireEvent.click(await screen.findByRole("button", { name: "Export data (JSON)" }))

    expect(await screen.findByText(/Couldn't export your data\. Part of it couldn't be read/)).toBeInTheDocument()
    expect(download).not.toHaveBeenCalled()
  })

  it("with every section read, the file is downloaded and nothing is said (the control case)", async () => {
    const download = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {})
    URL.createObjectURL = vi.fn(() => "blob:export")
    URL.revokeObjectURL = vi.fn()
    renderPane("export")

    fireEvent.click(await screen.findByRole("button", { name: "Export data (JSON)" }))

    await waitFor(() => expect(download).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole("alert")).toBeNull()
  })
})

describe("Settings — Account", () => {
  it("shows the stored name and who is signed in", async () => {
    renderPane("account")
    expect(await screen.findByDisplayValue("Pat")).toBeInTheDocument()
    expect(screen.getByText("e2e@homehub.test")).toBeInTheDocument()
  })

  it("a name that fails to save says so and stays unsaved", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    m.setDoc.mockRejectedValue(new Error("permission-denied"))
    renderPane("account")

    fireEvent.change(await screen.findByDisplayValue("Pat"), { target: { value: "Patricia" } })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("permission-denied")
    expect(screen.queryByText("Saved.")).toBeNull()
    // What was typed is still there, and Save is offered again.
    expect(screen.getByDisplayValue("Patricia")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled()
  })

  it("a name that could not be read says so", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    m.getDoc.mockRejectedValue(new Error("unavailable"))
    renderPane("account")
    expect(await screen.findByRole("alert")).toHaveTextContent("unavailable")
  })
})

describe("Settings — Homes", () => {
  // The name under Home's greeting shows only with a choice to make (owner,
  // 2026-11-19), so Settings is where a one-home person adds a second.
  it("offers Add a home, and no switch while there is only one", async () => {
    renderPane("homes")
    const page = within(await screen.findByTestId("settings-pane-homes"))
    expect(page.getByRole("button", { name: /Add a home/ })).toBeInTheDocument()
    expect(page.queryByRole("button", { name: "Switch home" })).toBeNull()
  })

  it("Add a home opens straight on the form", async () => {
    renderPane("homes")
    fireEvent.click(await screen.findByRole("button", { name: /Add a home/ }))
    expect(await screen.findByLabelText("Home name")).toBeInTheDocument()
  })
})
