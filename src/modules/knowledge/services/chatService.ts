import { auth, functionUrl } from "@/integrations/firebase"

export type ChatFilter = {
  type: "all" | "item" | "room" | "category"
  value?: string     // single value (item)
  values?: string[]  // multi-value (rooms)
  label: string
}

export type ChatSource = {
  title: string
  item_name: string
  source_type: "manual" | "web" | "ai" | "note"
  url?: string
}

/**
 * When the chat-query edge function auto-scopes an answer to a single item
 * (from PR #68), it returns the inferred item so the UI can show a
 * "Scoped to: X" chip on the assistant message.
 */
export type InferredItem = {
  item_unit_id: string
  display_name: string
}

export type ChatMessage = {
  id: string
  role: "user" | "assistant"
  content: string
  sources?: ChatSource[]
  inferredItem?: InferredItem
  isStreaming?: boolean
  isError?: boolean
}

/**
 * What a stream that closed without finishing says.
 *
 * HH-28: the server ends every answer with a `done` event, or an `error` one.
 * A connection that simply closed before either — a proxy timeout, an app sent
 * to the background, a function killed mid-answer — used to resolve NOTHING:
 * the typing cursor blinked on and the composer stayed locked for good. It is
 * an error like any other, so the thread unlocks and offers to try again.
 */
export const INCOMPLETE_ANSWER = "The answer stopped before it finished."

/**
 * What an answer that went quiet says (Codex review F7).
 *
 * Every other ending is something ARRIVING — a done, an error, a close, a
 * rejected read. A request that simply stops (a WebView resumed on a dead
 * socket, a proxy holding the connection open) sends none of them, so nothing
 * ever ended it: the cursor blinked and the composer stayed locked. With no
 * data for STREAM_STALL_MS the request is abandoned and ends in this, which
 * the thread shows with Try again like any other failed answer.
 */
export const ANSWER_STALLED = "The answer took too long."

/** A request that never reached the server (offline, dropped Wi-Fi). The
 *  browser's own words ("Failed to fetch" in Chrome, "Load failed" in Safari)
 *  reached testers verbatim before this. */
export const ANSWER_OFFLINE = "Couldn't reach Homehub. Check your connection, then try again."
/** The server answered with an error that carried no message of its own. */
export const ANSWER_SERVER_ERROR = "Something went wrong on our side. Try again in a minute."

/** The browser's wording for a fetch that never connected, across engines. */
function isConnectionFailure(err: unknown): boolean {
  if (!(err instanceof TypeError)) return false
  return /failed to fetch|load failed|networkerror|network request failed|network connection was lost/i.test(err.message)
}

/**
 * How long the stream may go without a single byte — before the first one, or
 * between any two — before it is called stalled. The server streams text as
 * the model writes it, but sends nothing while it searches the manuals (and
 * the web) first, and its own limit for the whole request is 120 s; a minute
 * of silence is well past a slow answer and into a dead connection.
 */
export const STREAM_STALL_MS = 60_000

type StreamEvent = {
  delta?: string
  done?: boolean
  sources?: ChatSource[]
  inferred_item?: InferredItem
  error?: string
}

/**
 * Streams a chat query from the chatQuery Cloud Function (onRequest + SSE).
 * Calls onDelta for each text chunk, then EXACTLY ONE of onDone or onError —
 * a stream that ends without saying which is an onError (INCOMPLETE_ANSWER).
 */
export async function streamChatQuery(params: {
  question: string
  history: Array<{ role: "user" | "assistant"; content: string }>
  filter: ChatFilter
  homeId: string
  allowWebSearch?: boolean
  onDelta: (text: string) => void
  onDone: (sources: ChatSource[], inferredItem?: InferredItem) => void
  onError: (message: string) => void
}): Promise<void> {
  const { question, history, filter, homeId, allowWebSearch, onDelta, onDone, onError } = params

  // Exactly one ending reaches the caller: the first done or error wins.
  let ended = false
  const finish = (sources: ChatSource[], inferredItem?: InferredItem) => {
    if (ended) return
    ended = true
    onDone(sources, inferredItem)
  }
  const fail = (message: string) => {
    if (ended) return
    ended = true
    onError(message)
  }
  /** One SSE `data:` payload. */
  const handle = (raw: string) => {
    let data: StreamEvent
    try {
      data = JSON.parse(raw) as StreamEvent
    } catch {
      return // not an event the server sends (it sends only JSON) — skip the line
    }
    if (data.delta && !ended) onDelta(data.delta)
    // An answer can cite nothing; `done` is the end whether or not sources came with it.
    if (data.done === true) finish(Array.isArray(data.sources) ? data.sources : [], data.inferred_item)
    if (data.error) fail(data.error)
  }

  // The stall clock (F7). `stalled` rejects when the stream has been silent
  // for STREAM_STALL_MS; every wait below races it, so a request that never
  // answers ends here instead of holding this function — and the thread —
  // open for good. `alive()` restarts the clock each time data arrives.
  const controller = new AbortController()
  let stallTimer: ReturnType<typeof setTimeout> | undefined
  let giveUp: (reason: Error) => void = () => {}
  // Always raced by the time it can reject: the first orStall() below runs in
  // the same tick the clock starts, and the clock is stopped when this
  // function ends — so it never rejects with nobody listening.
  const stalled = new Promise<never>((_, reject) => { giveUp = reject })
  const alive = () => {
    clearTimeout(stallTimer)
    stallTimer = setTimeout(() => giveUp(new Error(ANSWER_STALLED)), STREAM_STALL_MS)
  }
  const orStall = <T,>(p: Promise<T>): Promise<T> => Promise.race([p, stalled])
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined

  try {
  alive()
  // getIdToken() auto-refreshes if the token is expired. A failed refresh is
  // not swallowed: no token falls to the sign-in message just below.
  const token = await orStall(Promise.resolve(auth.currentUser?.getIdToken().catch(() => undefined)))
  if (!token) {
    fail("Authentication required. Please sign in again.")
    return
  }

  const res = await orStall(fetch(functionUrl("chatQuery"), {
    method: "POST",
    signal: controller.signal,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      question,
      history,
      filter: { type: filter.type, value: filter.value, values: filter.values, label: filter.label },
      home_id: homeId,
      allow_web_search: allowWebSearch ?? false,
    }),
  }))
  alive()

  if (!res.ok) {
    const text = await orStall(res.text())
    let msg = ANSWER_SERVER_ERROR
    try {
      const j = JSON.parse(text)
      if (typeof j?.error === "string") msg = j.error
    } catch {
      if (text) msg = text.slice(0, 200)
    }
    fail(msg)
    return
  }

  reader = res.body?.getReader()
  if (!reader) {
    fail("No response body")
    return
  }

  const decoder = new TextDecoder()
  let buffer = ""

  while (true) {
    const { done, value } = await orStall(reader.read())
    if (done) break
    alive()
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split("\n")
    buffer = lines.pop() ?? ""
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue
      const raw = line.slice(6).trim()
      if (raw) handle(raw)
    }
  }
  buffer += decoder.decode()
  if (buffer.startsWith("data: ")) {
    const raw = buffer.slice(6).trim()
    if (raw) handle(raw)
  }
  // The stream closed. If it never said done or error, the answer is
  // unfinished — say so, rather than leave the cursor blinking and the
  // composer locked (HH-28).
  fail(INCOMPLETE_ANSWER)
  } catch (err) {
    // A dropped connection rejects fetch() or reader.read(); before this catch
    // that rejection escaped the function — no onError, no onDone — and the UI
    // showed a typing indicator that never resolved, with the composer locked.
    // A tester sat in front of exactly that. A stall arrives here too, as
    // ANSWER_STALLED.
    if (isConnectionFailure(err)) {
      console.warn("[ask] request never reached the server:", err)
      fail(ANSWER_OFFLINE)
    } else {
      fail(err instanceof Error ? err.message : ANSWER_OFFLINE)
    }
  } finally {
    clearTimeout(stallTimer)
    // Let the connection go if the answer did not finish: after a stall (or
    // any error) nothing is listening, and the server should stop working on
    // it. Harmless after a clean end — the stream is already closed.
    if (reader) {
      reader.cancel().catch((e: unknown) => {
        console.warn("[ask] could not close the answer stream:", e instanceof Error ? e.message : e)
      })
    }
    controller.abort()
  }
}