/**
 * HH-28 — every Ask request ends, exactly once, in done or error.
 *
 * The server closes each answer with a `done` event (or an `error` one). A
 * stream that simply CLOSED before either used to resolve nothing: no onDone,
 * no onError, so the typing cursor blinked on and the composer stayed locked
 * until the page was reloaded.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

vi.mock("@/integrations/firebase", () => ({
  auth: { currentUser: { getIdToken: async () => "token" } },
  functionUrl: (name: string) => `https://functions.test/${name}`,
}))

const { streamChatQuery, INCOMPLETE_ANSWER } = await import("./chatService")

/** A fetch response whose body yields these SSE chunks, then closes (or throws). */
function sse(chunks: string[], opts: { dropAfter?: boolean } = {}) {
  const encoder = new TextEncoder()
  let i = 0
  const reader = {
    read: vi.fn(async () => {
      if (i < chunks.length) return { done: false, value: encoder.encode(chunks[i++]) }
      if (opts.dropAfter) throw new Error("network connection was lost")
      return { done: true, value: undefined }
    }),
  }
  return { ok: true, status: 200, body: { getReader: () => reader } }
}

const ask = () => {
  const onDelta = vi.fn()
  const onDone = vi.fn()
  const onError = vi.fn()
  const run = streamChatQuery({
    question: "How do I descale it?",
    history: [],
    filter: { type: "all", label: "All home" },
    homeId: "h1",
    onDelta,
    onDone,
    onError,
  })
  return { run, onDelta, onDone, onError }
}

const fetchMock = vi.fn()
beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal("fetch", fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

describe("streamChatQuery — one ending, always", () => {
  it("a stream that closes WITHOUT done or error is an error, so the thread unlocks", async () => {
    fetchMock.mockResolvedValue(sse(['data: {"delta":"Run the descale "}\n\n', 'data: {"delta":"cycle"}\n\n']))
    const { run, onDelta, onDone, onError } = ask()
    await run
    expect(onDelta).toHaveBeenCalledTimes(2)
    expect(onDone).not.toHaveBeenCalled()
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith(INCOMPLETE_ANSWER)
  })

  it("a finished answer ends in done, and only done", async () => {
    fetchMock.mockResolvedValue(
      sse(['data: {"delta":"Monthly."}\n\n', 'data: {"done":true,"sources":[{"title":"Care","item_name":"Dishwasher","source_type":"manual"}]}\n\n']),
    )
    const { run, onDone, onError } = ask()
    await run
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(onDone.mock.calls[0][0]).toHaveLength(1)
    expect(onError).not.toHaveBeenCalled()
  })

  it("done with no sources is still the end — an answer can cite nothing", async () => {
    fetchMock.mockResolvedValue(sse(['data: {"done":true}\n\n']))
    const { run, onDone, onError } = ask()
    await run
    expect(onDone).toHaveBeenCalledWith([], undefined)
    expect(onError).not.toHaveBeenCalled()
  })

  it("an event split across chunks, and one left without its newline, still count", async () => {
    fetchMock.mockResolvedValue(sse(['data: {"delta":"Mon', 'thly."}\n\ndata: {"done":true,"sources":[]}']))
    const { run, onDelta, onDone, onError } = ask()
    await run
    expect(onDelta).toHaveBeenCalledWith("Monthly.")
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(onError).not.toHaveBeenCalled()
  })

  it("the server's error ends it — and nothing after can end it again", async () => {
    fetchMock.mockResolvedValue(sse(['data: {"error":"The assistant is temporarily overloaded."}\n\n', 'data: {"done":true,"sources":[]}\n\n']))
    const { run, onDone, onError } = ask()
    await run
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith("The assistant is temporarily overloaded.")
    expect(onDone).not.toHaveBeenCalled()
  })

  it("a connection dropped mid-answer is an error, once", async () => {
    fetchMock.mockResolvedValue(sse(['data: {"delta":"Run the"}\n\n'], { dropAfter: true }))
    const { run, onDone, onError } = ask()
    await run
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith("network connection was lost")
    expect(onDone).not.toHaveBeenCalled()
  })
})
