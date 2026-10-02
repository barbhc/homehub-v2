/**
 * Settings › Custom tasks and Rooms: a late reply never lands on the wrong
 * home (H4).
 *
 * Each list is read by one function and lands through one apply — on arrival,
 * on a home switch, on Try again, and in the re-read after an add. None of
 * those checked, when the answer came back, that it was still for the home on
 * screen: home A's slow read, landing after a switch to home B, replaced B's
 * list with A's. And the re-read after an add — held by the render that
 * started the add — could start after the switch, putting B's list behind a
 * spinner and then filling it with A's.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, waitFor, within } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { normalizeNotificationPrefs } from "@/lib/notificationPreferences"

const m = vi.hoisted(() => ({
  homeId: "home-a",
  getRooms: vi.fn(),
  getRoutineTemplates: vi.fn(),
  saveRoutineTask: vi.fn(),
}))

vi.mock("@/modules/auth", () => ({ useAuth: () => ({ user: { id: "uid-1", email: "e2e@homehub.test" }, signOut: vi.fn() }) }))
vi.mock("@/modules/home", () => ({
  useCurrentHome: () => ({ home: { home_id: m.homeId, name: m.homeId } }),
  getRooms: (...a: unknown[]) => m.getRooms(...a),
  createRoom: vi.fn(),
  renameRoom: vi.fn(),
  deleteRoom: vi.fn(),
}))
vi.mock("@/lib/userPreferences", () => ({
  getNotificationPrefs: vi.fn(async () => normalizeNotificationPrefs(undefined)),
  setNotificationPrefs: vi.fn(async () => undefined),
}))
vi.mock("@/lib/pushNotifications", () => ({
  isPushSupported: () => false,
  isSubscribed: async () => false,
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
vi.mock("@/lib/cleanSession", () => ({
  getRoutineTemplates: (...a: unknown[]) => m.getRoutineTemplates(...a),
  saveRoutineTask: (...a: unknown[]) => m.saveRoutineTask(...a),
  deleteRoutineTask: vi.fn(),
}))
vi.mock("@/modules/knowledge", () => ({
  getManualsByHome: vi.fn(async () => ({ data: [], error: null })),
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

function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => { resolve = r })
  return { promise, resolve }
}
const routine = (id: string, title: string) => ({ task_template_id: id, title, schedule_type: "weekly", estimated_minutes: null })
const ROUTINES: Record<string, ReturnType<typeof routine>[]> = {
  "home-a": [routine("ra", "Water the ferns")],
  "home-b": [routine("rb", "Clear the gutters")],
}
const ROOMS: Record<string, { room_id: string; name: string }[]> = {
  "home-a": [{ room_id: "ka", name: "Kitchen" }],
  "home-b": [{ room_id: "gb", name: "Garage" }],
}

const page = () => <MemoryRouter><Settings /></MemoryRouter>
const tasksCard = () => within(document.getElementById("tasks")!)
const roomsCard = () => within(document.getElementById("rooms")!)

beforeEach(() => {
  vi.clearAllMocks()
  m.homeId = "home-a"
  m.getRoutineTemplates.mockImplementation(async (homeId: string) => ROUTINES[homeId])
  m.getRooms.mockImplementation(async (homeId: string) => ({ data: ROOMS[homeId], error: null }))
})

describe("Settings › Custom tasks — a late reply for the last home lands nowhere", () => {
  it("home A's slow first read, answering after the switch to B, leaves B's list", async () => {
    const slowA = deferred<ReturnType<typeof routine>[]>()
    m.getRoutineTemplates.mockImplementation((homeId: string) =>
      homeId === "home-a" ? slowA.promise : Promise.resolve(ROUTINES[homeId]))
    const { rerender } = render(page())

    m.homeId = "home-b"
    rerender(page())
    expect(await tasksCard().findByText("Clear the gutters")).toBeInTheDocument()

    await act(async () => { slowA.resolve(ROUTINES["home-a"]) })
    expect(tasksCard().getByText("Clear the gutters")).toBeInTheDocument()
    expect(tasksCard().queryByText("Water the ferns")).toBeNull()
  })

  it("Try again on A, answering after the switch to B, leaves B's list", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const retryA = deferred<ReturnType<typeof routine>[]>()
    m.getRoutineTemplates
      .mockRejectedValueOnce(new Error("unavailable"))
      .mockImplementation((homeId: string) => (homeId === "home-a" ? retryA.promise : Promise.resolve(ROUTINES[homeId])))
    const { rerender } = render(page())
    fireEvent.click(await tasksCard().findByRole("button", { name: "Try again" }))

    m.homeId = "home-b"
    rerender(page())
    expect(await tasksCard().findByText("Clear the gutters")).toBeInTheDocument()

    await act(async () => { retryA.resolve(ROUTINES["home-a"]) })
    expect(tasksCard().getByText("Clear the gutters")).toBeInTheDocument()
    expect(tasksCard().queryByText("Water the ferns")).toBeNull()
  })

  it("the re-read after an add on A, finishing after the switch, neither spins nor lands on B", async () => {
    const save = deferred<{ task_template_id: string }>()
    m.saveRoutineTask.mockReturnValue(save.promise)
    const { rerender } = render(page())
    expect(await tasksCard().findByText("Water the ferns")).toBeInTheDocument()

    fireEvent.change(tasksCard().getByPlaceholderText("Task name"), { target: { value: "Sweep the deck" } })
    fireEvent.click(tasksCard().getByRole("button", { name: "Add" }))

    m.homeId = "home-b"
    rerender(page())
    expect(await tasksCard().findByText("Clear the gutters")).toBeInTheDocument()

    // A's add lands; its re-read belongs to A.
    await act(async () => { save.resolve({ task_template_id: "new-a" }) })
    await act(async () => {})
    expect(tasksCard().queryByText("Loading…")).toBeNull()
    expect(tasksCard().getByText("Clear the gutters")).toBeInTheDocument()
    expect(tasksCard().queryByText("Water the ferns")).toBeNull()
  })
})

describe("Settings › Rooms — a late reply for the last home lands nowhere", () => {
  it("home A's slow first read, answering after the switch to B, leaves B's rooms", async () => {
    const slowA = deferred<{ data: { room_id: string; name: string }[]; error: null }>()
    m.getRooms.mockImplementation((homeId: string) =>
      homeId === "home-a" ? slowA.promise : Promise.resolve({ data: ROOMS[homeId], error: null }))
    const { rerender } = render(page())

    m.homeId = "home-b"
    rerender(page())
    expect(await roomsCard().findByText("Garage")).toBeInTheDocument()

    await act(async () => { slowA.resolve({ data: ROOMS["home-a"], error: null }) })
    expect(roomsCard().getByText("Garage")).toBeInTheDocument()
    expect(roomsCard().queryByText("Kitchen")).toBeNull()
  })

  it("Try again on A, answering after the switch to B, leaves B's rooms", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const retryA = deferred<{ data: { room_id: string; name: string }[]; error: null }>()
    m.getRooms
      .mockResolvedValueOnce({ data: null, error: { message: "unavailable" } })
      .mockImplementation((homeId: string) =>
        homeId === "home-a" ? retryA.promise : Promise.resolve({ data: ROOMS[homeId], error: null }))
    const { rerender } = render(page())
    fireEvent.click(await roomsCard().findByRole("button", { name: "Try again" }))

    m.homeId = "home-b"
    rerender(page())
    await waitFor(() => expect(roomsCard().getByText("Garage")).toBeInTheDocument())

    await act(async () => { retryA.resolve({ data: ROOMS["home-a"], error: null }) })
    expect(roomsCard().getByText("Garage")).toBeInTheDocument()
    expect(roomsCard().queryByText("Kitchen")).toBeNull()
  })
})
