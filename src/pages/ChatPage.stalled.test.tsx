/**
 * Codex review F7, on the screen: an answer that stalls is said in the thread
 * with Try again, and the composer is unlocked — never an endless cursor.
 * (chatService.test.ts pins that a stalled stream ends in ANSWER_STALLED.)
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen, within } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"

type Stream = { question: string; onDelta: (d: string) => void; onDone: (s: unknown[]) => void; onError: (m: string) => void }
const svc = vi.hoisted(() => ({ streams: [] as Stream[] }))

vi.mock("@/modules/home", () => ({ useCurrentHome: () => ({ home: { home_id: "home-a", name: "Home" } }), useHomeProfile: () => ({ profile: null }) }))
vi.mock("@/modules/auth", () => ({ useAuth: () => ({ user: { id: "uid-1" } }) }))
vi.mock("@/modules/knowledge/hooks/useChatFilters", () => ({
  useChatFilters: () => ({ rooms: [], items: [], loading: false, error: null, reload: () => {} }),
}))
vi.mock("@/components/chat/FilterBar", () => ({ FilterBar: () => null }))
// A stream the test ends by hand.
vi.mock("@/modules/knowledge/services/chatService", () => ({
  streamChatQuery: (p: Stream) => {
    svc.streams.push(p)
    return Promise.resolve()
  },
}))
vi.mock("@/modules/knowledge", async (orig) => ({
  toChatMessages: (await orig<typeof import("@/modules/knowledge")>()).toChatMessages,
  saveFaq: vi.fn(),
  listConversations: vi.fn(async () => []),
  getConversationMessages: vi.fn(async () => []),
  createConversation: vi.fn(async () => "convo-1"),
  appendMessage: vi.fn(async () => true),
}))
vi.mock("@/modules/items", () => ({ getItemUnits: vi.fn(async () => ({ data: [], error: null })) }))

const { default: ChatPage } = await import("./ChatPage")
/** chatService's ANSWER_STALLED, word for word (chatService.test.ts pins the constant to the stall). */
const ANSWER_STALLED = "The answer took too long."

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.setPointerCapture ??= () => {}
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.scrollIntoView ??= () => {}
})
beforeEach(() => {
  vi.clearAllMocks()
  svc.streams = []
})

const QUESTION = "How do I descale the dishwasher?"
async function ask() {
  render(<MemoryRouter><ChatPage /></MemoryRouter>)
  const box = (await screen.findAllByRole("textbox", { name: "Message" }))[0]
  fireEvent.change(box, { target: { value: QUESTION } })
  fireEvent.keyDown(box, { key: "Enter" })
  await screen.findByText(QUESTION)
  expect(svc.streams).toHaveLength(1)
}

describe("Ask — an answer that stalls", () => {
  it("says so in the thread with Try again, and unlocks the composer", async () => {
    await ask()
    await act(async () => { svc.streams[0].onError(ANSWER_STALLED) })

    expect(screen.getByText("The answer took too long.")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument()
    expect(screen.getAllByRole("textbox", { name: "Message" })[0]).toBeEnabled()
  })

  it("keeps what had arrived, and Try again asks the same question again", async () => {
    await ask()
    await act(async () => {
      svc.streams[0].onDelta("Run the descale ")
      svc.streams[0].onError(ANSWER_STALLED)
    })
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))

    expect(svc.streams).toHaveLength(2)
    expect(svc.streams[1].question).toBe(QUESTION)
    await act(async () => {
      svc.streams[1].onDelta("Run the descale cycle monthly.")
      svc.streams[1].onDone([])
    })
    expect(screen.getByText("Run the descale cycle monthly.")).toBeInTheDocument()
    expect(screen.queryByText("The answer took too long.")).toBeNull()
    expect(within(document.body).queryByRole("button", { name: "Try again" })).toBeNull()
  })
})
