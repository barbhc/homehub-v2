/**
 * Ask → Save to knowledge base, through the real page (audit H6).
 *
 * Each answer bubble carried its OWN save dialog and handed its `onSaved` to
 * the page — which opened the page's dialog with the same answer and a live
 * Save. One save showed two dialogs, and a second tap wrote the answer twice.
 * Now the bubble asks the page, and the page owns the only dialog.
 *
 * And Ask's history writes no longer fail in silence: a Recent list that could
 * not be read, a conversation that could not be opened, and a thread that
 * could not be saved each say so where the person would lose something.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"

const svc = vi.hoisted(() => ({
  saveFaq: vi.fn(),
  listConversations: vi.fn(),
  getConversationMessages: vi.fn(),
  createConversation: vi.fn(),
  appendMessage: vi.fn(),
  getItemUnits: vi.fn(),
}))

vi.mock("@/modules/home", () => ({ useCurrentHome: () => ({ home: { home_id: "home-1", name: "Test Home" } }) }))
vi.mock("@/modules/auth", () => ({ useAuth: () => ({ user: { id: "uid-1" } }) }))
vi.mock("@/modules/knowledge/hooks/useChatFilters", () => ({
  useChatFilters: () => ({ rooms: [], items: [], loading: false, error: null, reload: () => {} }),
}))
// The FilterBar is its own tested surface; here it would only add noise.
vi.mock("@/components/chat/FilterBar", () => ({ FilterBar: () => null }))
// The answer arrives whole, scoped to the furnace — no model is ever called.
vi.mock("@/modules/knowledge/services/chatService", () => ({
  streamChatQuery: (p: { onDelta: (d: string) => void; onDone: (s: unknown[], i?: unknown) => void }) => {
    p.onDelta("A 20x25x5 media filter.")
    p.onDone([], { item_unit_id: "item-a", display_name: "Carrier Infinity Furnace" })
    return Promise.resolve()
  },
}))
vi.mock("@/modules/knowledge", async (orig) => ({
  toChatMessages: (await orig<typeof import("@/modules/knowledge")>()).toChatMessages,
  saveFaq: (...a: unknown[]) => svc.saveFaq(...a),
  listConversations: (...a: unknown[]) => svc.listConversations(...a),
  getConversationMessages: (...a: unknown[]) => svc.getConversationMessages(...a),
  createConversation: (...a: unknown[]) => svc.createConversation(...a),
  appendMessage: (...a: unknown[]) => svc.appendMessage(...a),
}))
vi.mock("@/modules/items", () => ({ getItemUnits: (...a: unknown[]) => svc.getItemUnits(...a) }))

const { default: ChatPage } = await import("./ChatPage")

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.setPointerCapture ??= () => {}
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.scrollIntoView ??= () => {}
})

beforeEach(() => {
  vi.clearAllMocks()
  svc.saveFaq.mockResolvedValue({ data: { faq_id: "faq-1" }, error: null })
  svc.listConversations.mockResolvedValue([])
  svc.getConversationMessages.mockResolvedValue([])
  svc.createConversation.mockResolvedValue("convo-1")
  svc.appendMessage.mockResolvedValue(true)
  svc.getItemUnits.mockResolvedValue({
    data: [{ item_unit_id: "item-a", display_name: "Carrier Infinity Furnace", brand: null, model: null }],
    error: null,
  })
})

function renderPage() {
  render(<MemoryRouter><ChatPage /></MemoryRouter>)
}

async function ask(question: string) {
  const box = screen.getAllByRole("textbox", { name: "Message" })[0]
  fireEvent.change(box, { target: { value: question } })
  fireEvent.keyDown(box, { key: "Enter" })
  await screen.findByText("A 20x25x5 media filter.")
}

describe("Ask — Save to knowledge base is one dialog and one write", () => {
  it("one save opens ONE dialog, writes ONE answer, and leaves no dialog behind", async () => {
    renderPage()
    await ask("What filter size do I need?")

    fireEvent.click(screen.getByRole("button", { name: /Save to knowledge base/ }))
    const dialogs = await screen.findAllByRole("dialog")
    expect(dialogs).toHaveLength(1)
    // Scoped to the item the answer was about.
    const save = within(dialogs[0]).getByRole("button", { name: "Save" })
    await waitFor(() => expect(save).toBeEnabled())

    fireEvent.click(save)
    await waitFor(() => expect(svc.saveFaq).toHaveBeenCalledTimes(1))
    expect(svc.saveFaq).toHaveBeenCalledWith({
      home_id: "home-1",
      item_unit_id: "item-a",
      question: "What filter size do I need?",
      answer: "A 20x25x5 media filter.",
    })
    // The page's notice, then the dialog closes — and no second dialog opens
    // with the same answer and a live Save.
    expect(await screen.findByText("Saved to knowledge base")).toBeInTheDocument()
    await waitFor(() => expect(screen.queryAllByRole("dialog")).toHaveLength(0), { timeout: 2000 })
    expect(svc.saveFaq).toHaveBeenCalledTimes(1)
  })

  it("a failed save stays in the one dialog, says so, and claims nothing", async () => {
    svc.saveFaq.mockResolvedValueOnce({ data: null, error: { message: "unavailable" } })
    renderPage()
    await ask("What filter size do I need?")

    fireEvent.click(screen.getByRole("button", { name: /Save to knowledge base/ }))
    const dialog = await screen.findByRole("dialog")
    const save = within(dialog).getByRole("button", { name: "Save" })
    await waitFor(() => expect(save).toBeEnabled())
    fireEvent.click(save)

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Couldn't save your answer.")
    expect(screen.queryByText("Saved to knowledge base")).toBeNull()
    expect(screen.getAllByRole("dialog")).toHaveLength(1)
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeEnabled()
  })
})

describe("Ask — history failures are said, not swallowed", () => {
  it("a Recent list that could not be read says so with a retry, not 'appears once saved'", async () => {
    svc.listConversations.mockResolvedValueOnce(null)
    renderPage()

    const errors = await screen.findAllByText("Couldn't load your past questions.")
    expect(errors.length).toBeGreaterThan(0)
    expect(screen.queryByText(/will appear here once saved/)).toBeNull()

    svc.listConversations.mockResolvedValueOnce([{ id: "c1", title: "Descale the dishwasher", created_at: "", updated_at: "" }])
    fireEvent.click(within(errors[0].closest("[role=alert]") as HTMLElement).getByRole("button", { name: "Try again" }))
    expect((await screen.findAllByText("Descale the dishwasher")).length).toBeGreaterThan(0)
    expect(screen.queryByText("Couldn't load your past questions.")).toBeNull()
  })

  it("a past conversation that could not be opened says so — the tap used to do nothing", async () => {
    svc.listConversations.mockResolvedValue([{ id: "c1", title: "Descale the dishwasher", created_at: "", updated_at: "" }])
    svc.getConversationMessages.mockResolvedValueOnce(null)
    renderPage()

    fireEvent.click((await screen.findAllByText("Descale the dishwasher"))[0])
    expect((await screen.findAllByText("Couldn't open that conversation.")).length).toBeGreaterThan(0)
  })

  it("a thread that could not be saved to history says so above the composer", async () => {
    svc.createConversation.mockResolvedValueOnce(null)
    renderPage()
    await ask("What filter size do I need?")

    expect(await screen.findByText(/Couldn't save this conversation to Recent/)).toBeInTheDocument()
    // The answer itself is untouched — persistence never blocks the stream.
    expect(screen.getByText("A 20x25x5 media filter.")).toBeInTheDocument()
  })

  it("an answer that didn't append to a saved thread says PART of it is missing — not the whole", async () => {
    // The conversation and the question save; the answer does not.
    svc.appendMessage.mockImplementation(async (_h: string, _c: string, msg: { role: string }) => msg.role === "user")
    renderPage()
    await ask("What filter size do I need?")

    expect(await screen.findByText(/Part of this conversation didn't save to Recent/)).toBeInTheDocument()
    expect(screen.queryByText(/Couldn't save this conversation to Recent/)).toBeNull()
  })
})
