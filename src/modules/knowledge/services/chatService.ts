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

  try {
  // getIdToken() auto-refreshes if the token is expired.
  const token = await auth.currentUser?.getIdToken().catch(() => undefined)
  if (!token) {
    fail("Authentication required. Please sign in again.")
    return
  }

  const res = await fetch(functionUrl("chatQuery"), {
    method: "POST",
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
  })

  if (!res.ok) {
    const text = await res.text()
    let msg = `Request failed (${res.status})`
    try {
      const j = JSON.parse(text)
      if (typeof j?.error === "string") msg = j.error
    } catch {
      if (text) msg = text.slice(0, 200)
    }
    fail(msg)
    return
  }

  const reader = res.body?.getReader()
  if (!reader) {
    fail("No response body")
    return
  }

  const decoder = new TextDecoder()
  let buffer = ""

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
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
    // A tester sat in front of exactly that.
    fail(err instanceof Error ? err.message : "Lost the connection — please try again.")
  }
}