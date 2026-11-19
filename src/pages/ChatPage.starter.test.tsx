/**
 * A starter question from Home (design/day-one-home.md, release B) opens Ask
 * at /chat?q=… : it is asked once, shown as the person's question, and taken
 * off the URL so Back does not ask it again.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom"

type Stream = { onDelta: (d: string) => void; onDone: (s: unknown[], i?: unknown) => void; homeId: string }
const svc = vi.hoisted(() => ({
  homeId: "home-a",
  listConversations: vi.fn(),
  getConversationMessages: vi.fn(),
  createConversation: vi.fn(),
  appendMessage: vi.fn(),
  streams: [] as Stream[],
}))

vi.mock("@/modules/home", () => ({ useCurrentHome: () => ({ home: { home_id: svc.homeId, name: svc.homeId } }) }))
vi.mock("@/modules/auth", () => ({ useAuth: () => ({ user: { id: "uid-1" } }) }))
vi.mock("@/modules/knowledge/hooks/useChatFilters", () => ({
  useChatFilters: () => ({ rooms: [], items: [], loading: false, error: null, reload: () => {} }),
}))
vi.mock("@/components/chat/FilterBar", () => ({ FilterBar: () => null }))
// The answer streams in only when the test says so.
vi.mock("@/modules/knowledge/services/chatService", () => ({
  streamChatQuery: (p: Stream) => {
    svc.streams.push(p)
    return Promise.resolve()
  },
}))
vi.mock("@/modules/knowledge", async (orig) => ({
  toChatMessages: (await orig<typeof import("@/modules/knowledge")>()).toChatMessages,
  saveFaq: vi.fn(),
  listConversations: (...a: unknown[]) => svc.listConversations(...a),
  getConversationMessages: (...a: unknown[]) => svc.getConversationMessages(...a),
  createConversation: (...a: unknown[]) => svc.createConversation(...a),
  appendMessage: (...a: unknown[]) => svc.appendMessage(...a),
}))
vi.mock("@/modules/items", () => ({ getItemUnits: vi.fn(async () => ({ data: [], error: null })) }))

const { default: ChatPage } = await import("./ChatPage")

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.setPointerCapture ??= () => {}
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.scrollIntoView ??= () => {}
})

function Where() {
  const loc = useLocation()
  return <span data-testid="where">{loc.pathname + loc.search}</span>
}
const page = (url: string) => (
  <MemoryRouter initialEntries={[url]}>
    <Routes><Route path="/chat" element={<><ChatPage /><Where /></>} /></Routes>
  </MemoryRouter>
)

beforeEach(() => {
  vi.clearAllMocks()
  svc.streams.length = 0
  svc.listConversations.mockResolvedValue([])
  svc.createConversation.mockResolvedValue({ id: "c-new" })
  svc.appendMessage.mockResolvedValue({})
})

describe("Ask — a starter question from Home", () => {
  it("asks it once and clears it from the URL", async () => {
    render(page("/chat?q=What%20should%20I%20do%20before%20the%20first%20freeze%3F"))
    await waitFor(() => expect(svc.streams).toHaveLength(1))
    expect(svc.streams[0]).toMatchObject({ question: "What should I do before the first freeze?" })
    expect(screen.getByText("What should I do before the first freeze?")).toBeInTheDocument()
    await waitFor(() => expect(screen.getByTestId("where").textContent).toBe("/chat"))
    await new Promise((r) => setTimeout(r, 30))
    expect(svc.streams).toHaveLength(1)
  })

  it("asks nothing without one", async () => {
    render(page("/chat"))
    await new Promise((r) => setTimeout(r, 30))
    expect(svc.streams).toHaveLength(0)
  })
})
