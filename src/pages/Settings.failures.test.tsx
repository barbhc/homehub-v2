/**
 * Settings when a write or a read fails (audit H6).
 *
 * Every case here used to fail in silence, and most of them showed a SUCCESS:
 *  - a notification switch flipped "off" while the save had failed, so the
 *    server kept sending;
 *  - a failed read of the prefs showed the DEFAULTS as if they were the
 *    person's own — and the next tap saved those defaults over the real prefs;
 *  - "Disable" notifications swallowed its own failure and showed "Enable";
 *  - a room delete the server refused closed its dialog with the room still
 *    listed and nothing said.
 * Each test forces the failure and asserts the person SEES it, and that no
 * success state is left standing.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { normalizeNotificationPrefs } from "@/lib/notificationPreferences"

const m = vi.hoisted(() => ({
  getNotificationPrefs: vi.fn(),
  setNotificationPrefs: vi.fn(),
  unsubscribeFromPush: vi.fn(),
  getRooms: vi.fn(),
  deleteRoom: vi.fn(),
  renameRoom: vi.fn(),
  createRoom: vi.fn(),
  getRoutineTemplates: vi.fn(),
  saveRoutineTask: vi.fn(),
  deleteRoutineTask: vi.fn(),
  getManualsByHome: vi.fn(),
  unregisterNativePush: vi.fn(),
  /** Render as the iOS shell (native push) rather than a browser. */
  native: false,
}))

vi.mock("@/modules/auth", () => ({ useAuth: () => ({ user: { id: "uid-1", email: "e2e@homehub.test" }, signOut: vi.fn() }) }))
vi.mock("@/modules/home", () => ({
  useCurrentHome: () => ({ home: { home_id: "home-1", name: "Test Home" } }),
  getRooms: (...a: unknown[]) => m.getRooms(...a),
  createRoom: (...a: unknown[]) => m.createRoom(...a),
  renameRoom: (...a: unknown[]) => m.renameRoom(...a),
  deleteRoom: (...a: unknown[]) => m.deleteRoom(...a),
}))
vi.mock("@/lib/userPreferences", () => ({
  getNotificationPrefs: (...a: unknown[]) => m.getNotificationPrefs(...a),
  setNotificationPrefs: (...a: unknown[]) => m.setNotificationPrefs(...a),
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
vi.mock("@/lib/cleanSession", () => ({
  getRoutineTemplates: (...a: unknown[]) => m.getRoutineTemplates(...a),
  saveRoutineTask: (...a: unknown[]) => m.saveRoutineTask(...a),
  deleteRoutineTask: (...a: unknown[]) => m.deleteRoutineTask(...a),
}))
vi.mock("@/modules/knowledge", () => ({
  getManualsByHome: (...a: unknown[]) => m.getManualsByHome(...a),
  getKnowledgeChunksByHome: vi.fn(async () => ({ data: [], error: null })),
  getFaqsByHome: vi.fn(async () => ({ data: [], error: null })),
  deleteManualDocument: vi.fn(),
}))
vi.mock("@/modules/items", () => ({ getItemUnits: vi.fn(async () => ({ data: [], error: null })) }))
vi.mock("@/modules/care", () => ({ getTaskTemplates: vi.fn(async () => ({ data: [], error: null })) }))
vi.mock("@/lib/manualRescan", () => ({ openPendingReview: vi.fn(), rescanForReviewAndWait: vi.fn(), startRescanForReview: vi.fn() }))
vi.mock("@/hooks/useUserLevel", () => ({ useUserLevel: () => ({ level: "engaged", derivedLevel: "engaged" }) }))
vi.mock("@/hooks/useFeatureTour", () => ({ useFeatureTour: () => ({ restartTour: vi.fn() }) }))
vi.mock("@/hooks/useAutoFindManuals", () => ({ useAutoFindManuals: () => [false, vi.fn()] }))
vi.mock("@/integrations/firebase", () => ({ db: {}, callable: () => vi.fn() }))
vi.mock("firebase/firestore", () => ({
  collection: vi.fn(), doc: vi.fn(), query: vi.fn(), where: vi.fn(), serverTimestamp: vi.fn(), setDoc: vi.fn(),
  getDoc: vi.fn(async () => ({ exists: () => false, get: () => undefined })),
  getDocs: vi.fn(async () => ({ docs: [] })),
}))
// Sections with their own reads and their own tests.
for (const path of [
  "@/components/settings/HomeMembersSection",
  "@/components/settings/HomeProfileSection",
  "@/components/settings/InterfaceLevelSection",
  "@/components/settings/ServiceProvidersSection",
  "@/components/settings/AdminToolsSection",
  "@/components/settings/HouseRulesSection",
  "@/components/settings/NotificationsRefusedNote",
  "@/components/settings/BootDiagnostics",
  "@/components/FeedbackButton",
]) {
  const name = path.split("/").pop()!
  vi.doMock(path, () => ({ [name]: () => null }))
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
  m.unsubscribeFromPush.mockResolvedValue(undefined)
  m.getRooms.mockResolvedValue({ data: [{ room_id: "r1", name: "Kitchen" }], error: null })
  m.deleteRoom.mockResolvedValue({ data: true, error: null })
  m.getRoutineTemplates.mockResolvedValue([])
  m.getManualsByHome.mockResolvedValue({ data: [], error: null })
  m.unregisterNativePush.mockResolvedValue(undefined)
  m.native = false
})

const renderSettings = () => render(<MemoryRouter><Settings /></MemoryRouter>)

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

describe("Settings — rooms and custom tasks", () => {
  it("a room delete the server refuses keeps the room and says so", async () => {
    m.deleteRoom.mockResolvedValue({ data: null, error: { message: "permission-denied" } })
    renderSettings()

    fireEvent.click(await screen.findByRole("button", { name: "Delete Kitchen" }))
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Delete" }))

    expect(await screen.findByText("Couldn't delete Kitchen. Check your connection and try again.")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Kitchen" })).toBeInTheDocument()
  })

  it("a rename the server refuses keeps the editor open with what was typed, and says so", async () => {
    m.renameRoom.mockResolvedValue({ data: null, error: { message: "permission-denied" } })
    renderSettings()

    fireEvent.click(await screen.findByRole("button", { name: "Rename Kitchen" }))
    const input = screen.getByDisplayValue("Kitchen")
    fireEvent.change(input, { target: { value: "Pantry" } })
    fireEvent.keyDown(input, { key: "Enter" })

    expect(await screen.findByText("Couldn't rename that room. Check your connection and try again.")).toBeInTheDocument()
    expect(m.renameRoom).toHaveBeenCalledTimes(1)
    // Still editing, with the typed name — like Add room's form, ready for Enter again.
    expect(screen.getByDisplayValue("Pantry")).toBeInTheDocument()
  })

  /** Past the tick a refocus would be scheduled on. */
  const nextTick = () => act(() => new Promise<void>((r) => setTimeout(r, 20)))

  it("a rename that fails because the person LEFT the field does not pull them back, or re-send it as they leave again", async () => {
    // The trap: blur saves, the save fails, the field took focus back — so the
    // next tap elsewhere saved, failed and refocused again, with Escape the
    // only way out (and nothing saying so).
    m.renameRoom.mockResolvedValue({ data: null, error: { message: "unavailable" } })
    renderSettings()

    fireEvent.click(await screen.findByRole("button", { name: "Rename Kitchen" }))
    const input = screen.getByDisplayValue("Kitchen")
    await waitFor(() => expect(document.activeElement).toBe(input))
    fireEvent.change(input, { target: { value: "Pantry" } })
    // They tap elsewhere: focus moves on, and leaving the field saves.
    const elsewhere = screen.getByRole("button", { name: "Delete Kitchen" })
    act(() => elsewhere.focus())

    expect(await screen.findByText("Couldn't rename that room. Check your connection and try again.")).toBeInTheDocument()
    expect(screen.getByDisplayValue("Pantry")).toBeInTheDocument()
    await nextTick()
    expect(document.activeElement).toBe(elsewhere)

    // Back into the field and out again, same name: nothing is re-sent.
    act(() => screen.getByDisplayValue("Pantry").focus())
    act(() => elsewhere.focus())
    await nextTick()
    expect(m.renameRoom).toHaveBeenCalledTimes(1)
    expect(document.activeElement).toBe(elsewhere)

    // A changed name is a new rename, and leaving the field sends it.
    act(() => screen.getByDisplayValue("Pantry").focus())
    fireEvent.change(screen.getByDisplayValue("Pantry"), { target: { value: "Larder" } })
    act(() => elsewhere.focus())
    await waitFor(() => expect(m.renameRoom).toHaveBeenCalledTimes(2))
    expect(m.renameRoom.mock.calls[1]).toEqual(["home-1", "r1", "Larder"])
  })

  it("a rename that fails on Enter puts the person back in the field, ready to try again", async () => {
    let answer!: (v: unknown) => void
    m.renameRoom.mockReturnValueOnce(new Promise((r) => { answer = r }))
    renderSettings()

    fireEvent.click(await screen.findByRole("button", { name: "Rename Kitchen" }))
    const input = screen.getByDisplayValue("Kitchen")
    await waitFor(() => expect(document.activeElement).toBe(input))
    fireEvent.change(input, { target: { value: "Pantry" } })
    fireEvent.keyDown(input, { key: "Enter" })
    // In a browser the field can lose focus as it disables itself mid-save;
    // here focus is moved off it while the save is in flight.
    act(() => screen.getByRole("button", { name: "Delete Kitchen" }).focus())
    await act(async () => answer({ data: null, error: { message: "unavailable" } }))

    expect(await screen.findByText("Couldn't rename that room. Check your connection and try again.")).toBeInTheDocument()
    await waitFor(() => expect(document.activeElement).toBe(screen.getByDisplayValue("Pantry")))
    // The blur mid-save did not start a second write.
    expect(m.renameRoom).toHaveBeenCalledTimes(1)
  })

  it("rooms that could not be read say so instead of an empty list", async () => {
    m.getRooms.mockResolvedValue({ data: null, error: { message: "unavailable" } })
    renderSettings()
    expect(await screen.findByText("Couldn't load your rooms.")).toBeInTheDocument()
  })

  it("custom tasks that could not be read say so instead of an empty list", async () => {
    m.getRoutineTemplates.mockRejectedValue(new Error("Failed to load routine templates: unavailable"))
    renderSettings()
    expect(await screen.findByText("Couldn't load your custom tasks.")).toBeInTheDocument()
  })

  // H5 moved both reads into one reader + one apply each (readRooms/applyRooms,
  // readRoutines/applyRoutines). Try again is the imperative path through them.
  it("Try again on rooms reads them again and lists them", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    m.getRooms.mockResolvedValueOnce({ data: null, error: { message: "unavailable" } })
    renderSettings()
    const failed = (await screen.findByText("Couldn't load your rooms.")).closest("[role=alert]") as HTMLElement
    fireEvent.click(within(failed).getByRole("button", { name: "Try again" }))
    expect(await screen.findByText("Kitchen")).toBeInTheDocument()
    expect(screen.queryByText("Couldn't load your rooms.")).toBeNull()
    expect(m.getRooms).toHaveBeenCalledTimes(2)
  })

  it("Try again on custom tasks reads them again and lists them", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    m.getRoutineTemplates
      .mockRejectedValueOnce(new Error("Failed to load routine templates: unavailable"))
      .mockResolvedValueOnce([{ task_template_id: "rt1", title: "Water the ferns", schedule_type: "weekly", estimated_minutes: 5 }])
    renderSettings()
    const failed = (await screen.findByText("Couldn't load your custom tasks.")).closest("[role=alert]") as HTMLElement
    fireEvent.click(within(failed).getByRole("button", { name: "Try again" }))
    expect(await screen.findByText("Water the ferns")).toBeInTheDocument()
    expect(screen.queryByText("Couldn't load your custom tasks.")).toBeNull()
  })

  it("manuals that could not be read say so — not '0 manuals uploaded'", async () => {
    m.getManualsByHome.mockResolvedValue({ data: null, error: { message: "unavailable" } })
    renderSettings()
    expect(await screen.findByText("Couldn't load your manuals.")).toBeInTheDocument()
    expect(screen.queryByText(/0 manuals uploaded/)).toBeNull()
  })
})
