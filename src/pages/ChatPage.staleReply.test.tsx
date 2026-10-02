/**
 * Ask: a late reply never lands on the wrong home (H4).
 *
 * Three things Ask reads for the selected home could answer after the person
 * had switched to another, and each landed on the new home's screen:
 *  - the Recent list (the read applied whatever came back);
 *  - a past conversation being opened (it opened, under the new home);
 *  - an answer still streaming in (it kept writing into the old thread, which
 *    itself stayed on screen — and the next question would have been saved
 *    into the OLD home's conversation id under the new home).
 * Ask is now one per home: a switch starts it over for the new home.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"

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

const convo = (id: string, title: string) => ({ id, title, created_at: "2026-09-30T00:00:00Z", updated_at: "2026-09-30T00:00:00Z" })
const RECENT: Record<string, ReturnType<typeof convo>[]> = {
  "home-a": [convo("ca", "Furnace filter size?")],
  "home-b": [convo("cb", "Why are the gutters loud?")],
}

function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => { resolve = r })
  return { promise, resolve }
}

const page = () => <MemoryRouter><ChatPage /></MemoryRouter>

beforeEach(() => {
  vi.clearAllMocks()
  svc.homeId = "home-a"
  svc.streams = []
  svc.listConversations.mockImplementation(async (homeId: string) => RECENT[homeId])
  svc.getConversationMessages.mockResolvedValue([])
  svc.createConversation.mockResolvedValue("convo-new")
  svc.appendMessage.mockResolvedValue(true)
})

describe("Ask — a late reply for the last home lands nowhere", () => {
  it("home A's slow Recent list, answering after the switch to B, leaves B's", async () => {
    const slowA = deferred<ReturnType<typeof convo>[]>()
    svc.listConversations.mockImplementation((homeId: string) =>
      homeId === "home-a" ? slowA.promise : Promise.resolve(RECENT[homeId]))
    const { rerender } = render(page())

    svc.homeId = "home-b"
    rerender(page())
    expect((await screen.findAllByText("Why are the gutters loud?")).length).toBeGreaterThan(0)

    await act(async () => { slowA.resolve(RECENT["home-a"]) })
    expect(screen.getAllByText("Why are the gutters loud?").length).toBeGreaterThan(0)
    expect(screen.queryAllByText("Furnace filter size?")).toHaveLength(0)
  })

  it("a past conversation of A, opening after the switch to B, does not open on B", async () => {
    const opening = deferred<{ id: string; role: "user" | "assistant"; content: string; sources: null }[]>()
    svc.getConversationMessages.mockReturnValue(opening.promise)
    const { rerender } = render(page())
    fireEvent.click((await screen.findAllByText("Furnace filter size?"))[0])

    svc.homeId = "home-b"
    rerender(page())
    expect((await screen.findAllByText("Why are the gutters loud?")).length).toBeGreaterThan(0)

    await act(async () => {
      opening.resolve([
        { id: "m1", role: "user", content: "Furnace filter size?", sources: null },
        { id: "m2", role: "assistant", content: "A 20x25x5 media filter.", sources: null },
      ])
    })
    expect(screen.queryByText("A 20x25x5 media filter.")).toBeNull()
  })

  it("an answer still streaming for A does not write into B's Ask", async () => {
    const { rerender } = render(page())
    await screen.findAllByText("Furnace filter size?")
    const box = screen.getAllByRole("textbox", { name: "Message" })[0]
    fireEvent.change(box, { target: { value: "What filter does the furnace take?" } })
    fireEvent.keyDown(box, { key: "Enter" })
    expect(await screen.findByText("What filter does the furnace take?")).toBeInTheDocument()
    expect(svc.streams).toHaveLength(1)

    svc.homeId = "home-b"
    rerender(page())
    expect((await screen.findAllByText("Why are the gutters loud?")).length).toBeGreaterThan(0)
    // The old thread is not B's.
    expect(screen.queryByText("What filter does the furnace take?")).toBeNull()

    await act(async () => {
      svc.streams[0].onDelta("A 20x25x5 media filter.")
      svc.streams[0].onDone([])
    })
    expect(screen.queryByText("A 20x25x5 media filter.")).toBeNull()
    // B's composer is not left locked by A's stream.
    expect(screen.getAllByRole("textbox", { name: "Message" })[0]).toBeEnabled()
  })
})
