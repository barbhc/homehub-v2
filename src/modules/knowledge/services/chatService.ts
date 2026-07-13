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
  source_type: "manual" | "web" | "ai"
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
 * Streams a chat query from the chatQuery Cloud Function (onRequest + SSE).
 * Calls onDelta for each text chunk, onDone when complete.
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
  // getIdToken() auto-refreshes if the token is expired.
  const token = await auth.currentUser?.getIdToken().catch(() => undefined)
  if (!token) {
    onError("Authentication required. Please sign in again.")
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
    onError(msg)
    return
  }

  const reader = res.body?.getReader()
  if (!reader) {
    onError("No response body")
    return
  }

  const decoder = new TextDecoder()
  let buffer = ""
  const sources: ChatSource[] = []

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split("\n")
    buffer = lines.pop() ?? ""
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue
      const raw = line.slice(6).trim()
      if (!raw) continue
      try {
        const data = JSON.parse(raw) as {
          delta?: string
          done?: boolean
          sources?: ChatSource[]
          inferred_item?: InferredItem
          error?: string
        }
        if (data.delta) onDelta(data.delta)
        if (data.done === true && data.sources) {
          sources.push(...data.sources)
          onDone(data.sources, data.inferred_item)
        }
        if (data.error) onError(data.error)
      } catch {
        // skip non-JSON lines
      }
    }
  }
  if (buffer.startsWith("data: ")) {
    try {
      const data = JSON.parse(buffer.slice(6).trim()) as {
        delta?: string
        done?: boolean
        sources?: ChatSource[]
        inferred_item?: InferredItem
        error?: string
      }
      if (data.delta) onDelta(data.delta)
      if (data.done === true && data.sources && sources.length === 0) onDone(data.sources, data.inferred_item)
      if (data.error) onError(data.error)
    } catch {
      // ignore
    }
  }
}
