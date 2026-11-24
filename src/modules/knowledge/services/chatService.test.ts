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

const { streamChatQuery, INCOMPLETE_ANSWER, ANSWER_STALLED, ANSWER_OFFLINE, ANSWER_SERVER_ERROR, STREAM_STALL_MS } = await import("./chatService")

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
    // Every real reader has it; the service lets the stream go when it is done with it.
    cancel: vi.fn(async () => {}),
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
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

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

/**
 * Codex review F7 — an answer that hangs is an error too.
 *
 * Every ending above is something ARRIVING: a done, an error, a close, a
 * rejection. A request that simply stops — a WebView resumed on a dead socket,
 * a proxy holding the connection open — sends none of them, so the cursor
 * blinked and the composer stayed locked for good. With no data for
 * STREAM_STALL_MS the request is abandoned and ends in ANSWER_STALLED, which
 * the thread shows with Try again like any other failed answer.
 */
describe("streamChatQuery — a stalled answer ends", () => {
  /** A body that yields these chunks and then never answers again. */
  function hangingAfter(chunks: string[]) {
    const encoder = new TextEncoder()
    let i = 0
    const reader = {
      read: vi.fn(() =>
        i < chunks.length
          ? Promise.resolve({ done: false, value: encoder.encode(chunks[i++]) })
          : new Promise<never>(() => {})),
      cancel: vi.fn(async () => {}),
    }
    return { reader, response: { ok: true, status: 200, body: { getReader: () => reader } } }
  }

  it("a request that never answers fails after the stall time, once, and is aborted", async () => {
    vi.useFakeTimers()
    fetchMock.mockReturnValue(new Promise<never>(() => {}))
    const { run, onDone, onError } = ask()

    await vi.advanceTimersByTimeAsync(STREAM_STALL_MS - 1)
    expect(onError).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    await run

    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith(ANSWER_STALLED)
    expect(onDone).not.toHaveBeenCalled()
    const signal = (fetchMock.mock.calls[0][1] as { signal: AbortSignal }).signal
    expect(signal.aborted).toBe(true)
  })

  it("an answer that starts and then goes quiet fails after the stall time — the text so far stays", async () => {
    vi.useFakeTimers()
    const { reader, response } = hangingAfter(['data: {"delta":"Run the descale "}\n\n'])
    fetchMock.mockResolvedValue(response)
    const { run, onDelta, onDone, onError } = ask()

    await vi.advanceTimersByTimeAsync(STREAM_STALL_MS)
    await run

    expect(onDelta).toHaveBeenCalledWith("Run the descale ")
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith(ANSWER_STALLED)
    expect(onDone).not.toHaveBeenCalled()
    // The connection is let go, not left open behind the error.
    expect(reader.cancel).toHaveBeenCalled()
  })

  it("a slow answer that keeps arriving is NOT cut off: the clock restarts with every chunk", async () => {
    vi.useFakeTimers()
    const encoder = new TextEncoder()
    const gap = STREAM_STALL_MS - 5_000
    const chunks = ['data: {"delta":"One. "}\n\n', 'data: {"delta":"Two. "}\n\n', 'data: {"delta":"Three."}\n\n', 'data: {"done":true,"sources":[]}\n\n']
    let i = 0
    const reader = {
      read: vi.fn(() => new Promise((resolve) => {
        setTimeout(() => resolve(i < chunks.length ? { done: false, value: encoder.encode(chunks[i++]) } : { done: true, value: undefined }), gap)
      })),
      cancel: vi.fn(async () => {}),
    }
    fetchMock.mockResolvedValue({ ok: true, status: 200, body: { getReader: () => reader } })
    const { run, onDelta, onDone, onError } = ask()

    // Four chunks, each just inside the stall time: well past it in total.
    await vi.advanceTimersByTimeAsync(gap * 5)
    await run

    expect(onDelta).toHaveBeenCalledTimes(3)
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(onError).not.toHaveBeenCalled()
  })

  it("a finished answer leaves no timer behind", async () => {
    vi.useFakeTimers()
    fetchMock.mockResolvedValue(sse(['data: {"done":true,"sources":[]}\n\n']))
    const { run, onDone, onError } = ask()
    await run
    await vi.advanceTimersByTimeAsync(STREAM_STALL_MS * 2)
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(onError).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })
})

// The browser's own words for a request that never connected reached testers
// verbatim: "Failed to fetch" (Chrome) or "Load failed" (Safari) under the
// answer (flow walk, 2026-11-24).
describe("streamChatQuery — failures in plain words", () => {
  it.each([["Failed to fetch"], ["Load failed"], ["NetworkError when attempting to fetch resource."]])(
    "a request that never connects (%s) says to check the connection",
    async (raw) => {
      fetchMock.mockRejectedValue(new TypeError(raw))
      const { run, onError, onDone } = ask()
      await run
      expect(onDone).not.toHaveBeenCalled()
      expect(onError).toHaveBeenCalledTimes(1)
      expect(onError).toHaveBeenCalledWith(ANSWER_OFFLINE)
    },
  )

  it("a server error with no message of its own does not show a status code", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 502, text: async () => "" })
    const { run, onError } = ask()
    await run
    expect(onError).toHaveBeenCalledWith(ANSWER_SERVER_ERROR)
  })
})
