/**
 * Your home (/your-home): every write goes to the home it was started for,
 * and its answer lands only while that home is on screen (switch safety).
 *
 * Home A's answers, saved as the person switched to home B, landed in B's
 * state: B showed A's answers, and B's next Save — its draft seeded from
 * them — wrote A's answers into B's profile. A dismissal, a library Add and
 * her own task's Add answered on B the same way.
 *
 * The two homes' profiles are modelled as documents: a save is applied to the
 * document of the home it was sent for, when the test lets it land.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"

type Facts = Record<string, boolean>
type Doc = { care_facts: Facts; dismissed_care: string[] }
type Result = { data: unknown; error: { message: string } | null }

const svc = vi.hoisted(() => ({
  homeId: "home-a",
  /** Each home's profile document. */
  docs: {} as Record<string, { care_facts: Record<string, boolean>; dismissed_care: string[] }>,
  getHomeProfile: vi.fn(),
  upsertHomeProfile: vi.fn(),
  getTaskTemplates: vi.fn(),
  addLibraryTask: vi.fn(),
  dismissLibrarySuggestion: vi.fn(),
}))
vi.mock("@/modules/home", () => ({
  useCurrentHome: () => ({ home: { home_id: svc.homeId } }),
  getHomeProfile: (...a: unknown[]) => svc.getHomeProfile(...a),
  upsertHomeProfile: (...a: unknown[]) => svc.upsertHomeProfile(...a),
  getRooms: async () => ({ data: [], error: null }),
}))
vi.mock("@/modules/care", () => ({
  getTaskTemplates: (...a: unknown[]) => svc.getTaskTemplates(...a),
  addLibraryTask: (...a: unknown[]) => svc.addLibraryTask(...a),
  getHomeNotes: async () => ({ data: [], error: null }),
  listHouseRules: async () => ({ data: [], error: null }),
  dismissLibrarySuggestion: (...a: unknown[]) => svc.dismissLibrarySuggestion(...a),
}))
vi.mock("@/components/layout", () => ({ PageContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))

const { default: YourHome } = await import("./YourHome")

const page = () => <MemoryRouter><YourHome /></MemoryRouter>
const switchTo = (homeId: string, rerender: (ui: React.ReactElement) => void) => {
  svc.homeId = homeId
  rerender(page())
}
const OK: Result = { data: {}, error: null }
const REFUSED: Result = { data: null, error: { message: "unavailable" } }

/** Hold the next call of `fn` until the test lets it land; `apply` is what landing does to the documents. */
function holdNext(fn: ReturnType<typeof vi.fn>, apply: (...args: never[]) => void = () => {}) {
  let land!: (result?: Result) => void
  fn.mockImplementationOnce((...args: never[]) => new Promise<Result>((resolve) => {
    land = (result = OK) => {
      if (!result.error) apply(...args)
      resolve(result)
    }
  }))
  return (result?: Result) => land(result)
}
/** A Save of answers, as Firestore's merge applies it: into that home's document. */
const applyFacts = (homeId: string, patch: { care_facts: Facts }) => { Object.assign(svc.docs[homeId].care_facts, patch.care_facts) }
const safetyRow = () => screen.getByRole("button", { name: /^Safety/ })
/** The switch has landed and B's page has read its home (the spinner is gone). */
async function homeBRead() {
  expect(svc.getHomeProfile).toHaveBeenCalledWith("home-b")
  await waitFor(() => expect(screen.queryByText(/Loading your answers/)).toBeNull())
}
/** Template reads for one home, past the first. */
const rereadsOf = (homeId: string) => svc.getTaskTemplates.mock.calls.filter(([h]) => h === homeId).length - 1

function setDocs(a: Doc, b: Doc) {
  svc.docs = { "home-a": a, "home-b": b }
}

beforeEach(() => {
  vi.clearAllMocks()
  svc.homeId = "home-a"
  // B already says "no smoke alarms" — one of Safety's three questions answered.
  setDocs({ care_facts: {}, dismissed_care: [] }, { care_facts: { has_smoke_alarms: false }, dismissed_care: [] })
  svc.getHomeProfile.mockImplementation(async (homeId: string) => ({ data: structuredClone(svc.docs[homeId]), error: null }))
  svc.getTaskTemplates.mockResolvedValue({ data: [], error: null })
  svc.upsertHomeProfile.mockImplementation(async (homeId: string, patch: { care_facts: Facts }) => {
    applyFacts(homeId, patch)
    return OK
  })
})

describe("Your home — a write lands on the home it was started for", () => {
  /** On A: both Safety answers "Yes", Save — and the switch to B lands while that save is in flight. */
  async function saveAnswersOnASwitchingToB() {
    const landA = holdNext(svc.upsertHomeProfile, applyFacts)
    const { rerender } = render(page())
    fireEvent.click(await screen.findByText("Safety"))
    const yes = screen.getAllByRole("radio", { name: "Yes" })
    // Safety's questions: smoke [0], carbon monoxide (CO) [1] (before-friends B1), extinguisher [2].
    fireEvent.click(yes[0])
    fireEvent.click(yes[2])
    fireEvent.click(screen.getByRole("button", { name: /Save answers/ }))
    switchTo("home-b", rerender)
    await homeBRead()
    return landA
  }

  it("A's answers, saved as the page switches to B, go to A's document — B's document and B's screen are untouched", async () => {
    const landA = await saveAnswersOnASwitchingToB()
    await act(async () => { landA() })

    expect(svc.upsertHomeProfile.mock.calls.map(([homeId]) => homeId)).toEqual(["home-a"])
    expect(svc.docs["home-a"].care_facts).toEqual({ has_smoke_alarms: true, has_extinguisher: true })
    expect(svc.docs["home-b"].care_facts).toEqual({ has_smoke_alarms: false })
    // B's screen is still B's: Safety half answered, and none of the care A's answers unlock.
    expect(safetyRow()).toHaveTextContent("1 of 3 answered")
    expect(screen.queryByText("Replace alarm batteries")).toBeNull()
  })

  it("…and B's own next Save starts from B's answers: A's never reach B's document", async () => {
    const landA = await saveAnswersOnASwitchingToB()
    await act(async () => { landA() })

    // On B: Safety, the extinguisher question "Yes", Save.
    fireEvent.click(await screen.findByRole("button", { name: /^Safety/ }))
    fireEvent.click(screen.getAllByRole("radio", { name: "Yes" })[2])
    fireEvent.click(screen.getByRole("button", { name: /Save answers/ }))
    await waitFor(() => expect(svc.upsertHomeProfile).toHaveBeenCalledTimes(2))

    expect(svc.upsertHomeProfile.mock.calls.map(([homeId]) => homeId)).toEqual(["home-a", "home-b"])
    // B keeps its own "no alarms"; A's "yes" never lands in B's document.
    expect(svc.docs["home-b"].care_facts).toEqual({ has_smoke_alarms: false, has_extinguisher: true })
    expect(svc.docs["home-a"].care_facts).toEqual({ has_smoke_alarms: true, has_extinguisher: true })
  })

  it("A's answers failing to save after the switch say nothing on B — the failure is logged", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const landA = holdNext(svc.upsertHomeProfile, applyFacts)
    const { rerender } = render(page())
    fireEvent.click(await screen.findByText("Safety"))
    fireEvent.click(screen.getAllByRole("radio", { name: "Yes" })[0])
    fireEvent.click(screen.getByRole("button", { name: /Save answers/ }))

    switchTo("home-b", rerender)
    await homeBRead()
    await act(async () => { landA(REFUSED) })

    expect(screen.queryByRole("alert")).toBeNull()
    expect(safetyRow()).toHaveTextContent("1 of 3 answered")
    expect(svc.docs["home-b"].care_facts).toEqual({ has_smoke_alarms: false })
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("home home-a"), "unavailable")
  })

  it("a suggestion dismissed on A, answered after the switch, is still offered on B", async () => {
    setDocs({ care_facts: { has_smoke_alarms: true }, dismissed_care: [] }, { care_facts: { has_smoke_alarms: true }, dismissed_care: [] })
    const landA = holdNext(svc.dismissLibrarySuggestion)
    const { rerender } = render(page())
    fireEvent.click(await screen.findByRole("button", { name: "Don't add Test the smoke alarms" }))

    switchTo("home-b", rerender)
    expect(await screen.findByRole("button", { name: "Don't add Test the smoke alarms" })).toBeInTheDocument()
    await act(async () => { landA() })

    expect(svc.dismissLibrarySuggestion).toHaveBeenCalledWith("home-a", null, "home.alarm_test")
    expect(screen.getByText("Test the smoke alarms")).toBeInTheDocument()
  })

  it("a library Add on A, answered after the switch, does not reload B", async () => {
    setDocs({ care_facts: { has_smoke_alarms: true }, dismissed_care: [] }, { care_facts: { has_smoke_alarms: true }, dismissed_care: [] })
    const landA = holdNext(svc.addLibraryTask)
    const { rerender } = render(page())
    fireEvent.click(await screen.findByRole("button", { name: "Add Test the smoke alarms" }))

    switchTo("home-b", rerender)
    expect(await screen.findByRole("button", { name: "Add Test the smoke alarms" })).toBeInTheDocument()
    await act(async () => { landA() })

    expect(svc.addLibraryTask).toHaveBeenCalledWith("home-a", null, expect.objectContaining({ key: "home.alarm_test" }))
    expect(screen.queryByText(/Loading your answers/)).toBeNull()
    expect(rereadsOf("home-b")).toBe(0)
    expect(screen.getByText("Test the smoke alarms")).toBeInTheDocument()
  })
})
