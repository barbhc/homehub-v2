import { useState, useCallback, useMemo, useEffect, useRef } from "react"
import { useSearchParams } from "react-router-dom"
import { SparklesIcon, WrenchIcon, BookOpenIcon, PlusIcon, ClockIcon } from "lucide-react"
import { FilterBar } from "@/components/chat/FilterBar"
import { ChatThread } from "@/components/chat/ChatThread"
import { ChatInput } from "@/components/chat/ChatInput"
import { SaveFaqDialog } from "@/components/chat/SaveFaqDialog"
import { getSuggestions } from "@/components/chat/chatSuggestions"
import { useCurrentHome } from "@/modules/home"
import { useAuth } from "@/modules/auth"
import { useChatFilters } from "@/modules/knowledge/hooks/useChatFilters"
import { streamChatQuery } from "@/modules/knowledge/services/chatService"
import type { ChatFilter, ChatMessage } from "@/modules/knowledge/services/chatService"
import {
  listConversations,
  getConversationMessages,
  createConversation,
  appendMessage,
  toChatMessages,
  type ConversationSummary,
} from "@/modules/knowledge"

const LAUNCHERS = [
  { icon: WrenchIcon, label: "Troubleshoot", sub: "Something's not working", q: "Something in my home isn't working — help me troubleshoot it." },
  { icon: BookOpenIcon, label: "Ask a manual", sub: "Search your docs", q: "What do my appliance manuals say about routine maintenance?" },
] as const

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ""
  const diff = Date.now() - then
  const mins = Math.round(diff / 60000)
  if (mins < 1) return "Just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.round(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

export default function ChatPage() {
  const { home } = useCurrentHome()
  const { user } = useAuth()
  const homeId = home?.home_id ?? ""
  const { rooms, items, loading: filtersLoading } = useChatFilters(homeId)

  // Pre-scope to an item when arriving from "Fix a problem" (/chat?item=ID).
  // This is how troubleshooting now enters Ask — scoped to the appliance, with
  // its problem-oriented suggestions ready and chat answering anything.
  const [searchParams] = useSearchParams()
  const [selectedRoomIds, setSelectedRoomIds] = useState<string[]>([])
  const [selectedItemId, setSelectedItemId] = useState<string | null>(() => searchParams.get("item"))
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)

  // ── Conversation history (gracefully degrades when the table is missing) ──
  // `conversations === null` means persistence is unavailable; the page then
  // runs exactly as before — a single in-memory thread.
  const [conversations, setConversations] = useState<ConversationSummary[] | null>(null)
  const [activeConvoId, setActiveConvoId] = useState<string | null>(null)
  // The id of the conversation we're currently persisting into. Held in a ref
  // so the async streaming callbacks always see the latest value.
  const convoIdRef = useRef<string | null>(null)

  const refreshConversations = useCallback(async () => {
    if (!homeId) return
    const list = await listConversations(homeId)
    setConversations(list)
  }, [homeId])

  useEffect(() => {
    void refreshConversations()
  }, [refreshConversations])

  // ── Save to {item} dialog state ──
  const [saveDialog, setSaveDialog] = useState<{
    open: boolean
    question: string
    answer: string
    itemUnitId: string | null
  }>({ open: false, question: "", answer: "", itemUnitId: null })
  const [savedNotice, setSavedNotice] = useState(false)

  const handleSaveFaq = useCallback(
    (question: string, answer: string, itemUnitId: string | null) => {
      setSaveDialog({
        open: true,
        question,
        answer,
        // Prefer the item the answer was scoped/inferred to; fall back to the
        // current scope filter.
        itemUnitId: itemUnitId ?? selectedItemId,
      })
    },
    [selectedItemId]
  )

  const activeFilter: ChatFilter = useMemo(() =>
    selectedItemId
      ? { type: "item", value: selectedItemId, label: "" }
      : selectedRoomIds.length > 0
        ? { type: "room", values: selectedRoomIds, label: "" }
        : { type: "all", label: "All home" }
  , [selectedItemId, selectedRoomIds])

  // Start a fresh thread — clears messages and detaches from any saved convo.
  const startNewQuestion = useCallback(() => {
    setMessages([])
    setActiveConvoId(null)
    convoIdRef.current = null
  }, [])

  const handleRoomToggle = useCallback((roomId: string) => {
    setSelectedRoomIds((prev) =>
      prev.includes(roomId) ? prev.filter((id) => id !== roomId) : [...prev, roomId]
    )
    setSelectedItemId(null)
    startNewQuestion()
  }, [startNewQuestion])

  const handleItemSelect = useCallback((id: string | null) => {
    setSelectedItemId(id)
    setSelectedRoomIds([])
    startNewQuestion()
  }, [startNewQuestion])

  // Load a past conversation into the thread. Silently no-ops if persistence
  // became unavailable between listing and selecting.
  const handleSelectConversation = useCallback(async (id: string) => {
    if (isStreaming) return
    const rows = await getConversationMessages(homeId, id)
    if (!rows) return
    setMessages(toChatMessages(rows))
    setActiveConvoId(id)
    convoIdRef.current = id
  }, [isStreaming])

  const handleSend = useCallback(
    (text: string) => {
      if (!homeId || isStreaming) return

      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: text,
      }
      const assistantId = crypto.randomUUID()
      const assistantPlaceholder: ChatMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
        isStreaming: true,
      }
      const isFirstTurn = messages.length === 0
      setMessages((prev) => [...prev, userMsg, assistantPlaceholder])
      setIsStreaming(true)

      const history = [...messages, userMsg].map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }))

      // Best-effort persistence. If `createConversation` returns null the table
      // is missing and we just stay in-memory — the stream below is unaffected.
      const persistUser = async (): Promise<string | null> => {
        let convoId = convoIdRef.current
        if (!convoId && isFirstTurn) {
          convoId = await createConversation(homeId, user?.id ?? null, text.slice(0, 80))
          if (convoId) {
            convoIdRef.current = convoId
            setActiveConvoId(convoId)
          }
        }
        if (convoId) {
          await appendMessage(homeId, convoId, { role: "user", content: text })
        }
        return convoId
      }
      const persistPromise = persistUser()

      streamChatQuery({
        question: text,
        history,
        filter: activeFilter,
        homeId,
        onDelta: (delta) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: m.content + delta, isStreaming: true }
                : m
            )
          )
        },
        onDone: (sources, inferredItem) => {
          let finalContent = ""
          setMessages((prev) => {
            const next = prev.map((m) =>
              m.id === assistantId
                ? { ...m, isStreaming: false, sources, inferredItem }
                : m
            )
            finalContent = next.find((m) => m.id === assistantId)?.content ?? ""
            return next
          })
          setIsStreaming(false)
          void persistPromise.then(async (convoId) => {
            if (!convoId) return
            await appendMessage(homeId, convoId, { role: "assistant", content: finalContent, sources })
            void refreshConversations()
          })
        },
        onError: (errMsg) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: errMsg, isStreaming: false, isError: true }
                : m
            )
          )
          setIsStreaming(false)
        },
      })
    },
    [homeId, isStreaming, messages, activeFilter, user?.id, refreshConversations]
  )

  const handleWebSearch = useCallback(
    (messageId: string) => {
      if (!homeId || isStreaming) return

      const idx = messages.findIndex((m) => m.id === messageId)
      if (idx < 1 || messages[idx].role !== "assistant" || messages[idx - 1].role !== "user") return

      const userQuestion = messages[idx - 1].content
      // Prior conversation + the first assistant reply so Claude knows what gap it's filling.
      // Exclude the user question (idx-1) — it's sent separately as `question`.
      const history = [
        ...messages.slice(0, idx - 1),
        messages[idx],
      ].map((m) => ({ role: m.role as "user" | "assistant", content: m.content }))

      const assistantId = crypto.randomUUID()
      setMessages((prev) => [
        ...prev.slice(0, idx + 1),
        { id: assistantId, role: "assistant" as const, content: "", isStreaming: true },
      ])
      setIsStreaming(true)

      streamChatQuery({
        question: userQuestion,
        history,
        filter: activeFilter,
        homeId,
        allowWebSearch: true,
        onDelta: (delta) => {
          setMessages((p) =>
            p.map((m) =>
              m.id === assistantId
                ? { ...m, content: m.content + delta, isStreaming: true }
                : m
            )
          )
        },
        onDone: (sources, inferredItem) => {
          setMessages((p) =>
            p.map((m) =>
              m.id === assistantId ? { ...m, isStreaming: false, sources, inferredItem } : m
            )
          )
          setIsStreaming(false)
        },
        onError: (errMsg) => {
          setMessages((p) =>
            p.map((m) =>
              m.id === assistantId
                ? { ...m, content: errMsg, isStreaming: false, isError: true }
                : m
            )
          )
          setIsStreaming(false)
        },
      })
    },
    [homeId, isStreaming, messages, activeFilter]
  )

  const suggestions = getSuggestions(selectedRoomIds, selectedItemId, rooms, items)
  const hasMessages = messages.length > 0
  const hasHistory = conversations !== null && conversations.length > 0

  // Human label for the current scope — shown as the "Topic" chip above an
  // active thread (per the desktop Ask spec).
  const scopeLabel = useMemo(() => {
    if (selectedItemId) {
      const it = items.find((i) => i.item_unit_id === selectedItemId)
      return it?.display_name ?? "Item"
    }
    if (selectedRoomIds.length === 1) {
      return rooms.find((r) => r.room_id === selectedRoomIds[0])?.name ?? "Room"
    }
    if (selectedRoomIds.length > 1) return `${selectedRoomIds.length} rooms`
    return "All home"
  }, [selectedItemId, selectedRoomIds, items, rooms])

  return (
    <div className="flex flex-col h-[calc(100vh-48px)] overflow-hidden bg-[var(--hh-bg)] lg:grid lg:grid-cols-[260px_minmax(0,1fr)] lg:items-start lg:gap-5">
      {/* ── Desktop conversation rail (lg+): New question + Recent only ── */}
      <aside className="hidden border-r border-[var(--hh-line)] bg-[var(--hh-surface)] p-6 lg:flex lg:h-[calc(100vh-48px)] lg:min-h-0 lg:flex-col lg:gap-4 lg:overflow-y-auto">
        {/* New question */}
        <button
          type="button"
          onClick={startNewQuestion}
          disabled={isStreaming}
          className="flex items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-2.5 text-[14px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          <PlusIcon className="size-[18px]" />
          New question
        </button>

        {/* Conversation history rail. When there's no saved history yet (the
            common case until the chat-conversations migration lands), show a
            calm hint instead of a tall blank panel. */}
        {!hasHistory && (
          <div>
            <div className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.5px]" style={{ color: "var(--hh-sub)" }}>Recent</div>
            <p
              className="rounded-2xl border border-dashed border-[var(--hh-line)] px-3.5 py-3 text-[12.5px] leading-relaxed"
              style={{ color: "var(--hh-faint)" }}
            >
              Your past questions will appear here once saved.
            </p>
          </div>
        )}
        {hasHistory && (
          <div>
            <div className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.5px]" style={{ color: "var(--hh-sub)" }}>Recent</div>
            <div className="overflow-hidden rounded-2xl border border-[var(--hh-line)] bg-[var(--hh-surface)]">
              {conversations!.map((c, i) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => void handleSelectConversation(c.id)}
                  disabled={isStreaming}
                  className="flex w-full items-center gap-2.5 px-3.5 py-3 text-left transition-colors hover:bg-[var(--hh-surface2)] disabled:opacity-60"
                  style={{
                    borderTop: i ? "1px solid var(--hh-line)" : "none",
                    background: c.id === activeConvoId ? "var(--hh-teal-wash)" : undefined,
                  }}
                >
                  <ClockIcon className="size-[15px] shrink-0" style={{ color: "var(--hh-faint)" }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold" style={{ color: "var(--hh-ink)" }}>{c.title}</span>
                    <span className="block text-[11.5px]" style={{ color: "var(--hh-faint)" }}>{relativeTime(c.updated_at)}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </aside>

      {/* ── Main conversation column ── */}
      <div className="flex min-h-0 flex-1 flex-col lg:h-[calc(100vh-48px)] lg:flex-1">
      {hasMessages ? (
        /* ── CONVERSATION LAYOUT ── */
        <>
          {/* Compact filter strip (mobile — desktop uses the topic header below) */}
          {!filtersLoading && (
            <div className="lg:hidden">
              <FilterBar
                variant="compact"
                rooms={rooms}
                items={items}
                selectedRoomIds={selectedRoomIds}
                selectedItemId={selectedItemId}
                onRoomToggle={handleRoomToggle}
                onItemSelect={handleItemSelect}
              />
            </div>
          )}
          {/* Desktop topic/scope header (per spec: "Topic · {item/room}") */}
          <div className="hidden shrink-0 items-center gap-2.5 border-b border-[var(--hh-line)] bg-[var(--hh-surface)] px-[18px] py-3.5 lg:flex">
            <span className="text-[12.5px] font-semibold" style={{ color: "var(--hh-sub)" }}>Topic</span>
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-[5px] text-[12.5px] font-bold"
              style={{ background: "var(--hh-teal-wash)", color: "var(--hh-teal)" }}
            >
              {scopeLabel}
            </span>
            {(selectedItemId || selectedRoomIds.length > 0) && (
              <button
                type="button"
                onClick={() => handleItemSelect(null)}
                disabled={isStreaming}
                className="text-[12.5px] font-semibold transition-colors hover:opacity-80 disabled:opacity-50"
                style={{ color: "var(--hh-faint)" }}
              >
                Clear
              </button>
            )}
          </div>
          {/* Messages */}
          <ChatThread
            messages={messages}
            onSaveFaq={handleSaveFaq}
            onWebSearch={handleWebSearch}
            activeFilter={activeFilter}
            homeId={homeId}
          />
          {/* Suggestion chips above input (mobile — desktop uses the rail) */}
          <div className="flex gap-2 px-4 pt-2 overflow-x-auto shrink-0 [&::-webkit-scrollbar]:hidden scrollbar-none lg:hidden">
            {suggestions.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => handleSend(q)}
                className="shrink-0 text-xs text-primary bg-primary/8 border border-primary/20 rounded-full px-3 py-1.5 hover:bg-primary/14 transition-colors whitespace-nowrap"
              >
                {q}
              </button>
            ))}
          </div>
          {/* Input */}
          <ChatInput onSend={handleSend} disabled={isStreaming} />
        </>
      ) : (
        /* ── EMPTY LAYOUT ──
           Mobile: vertically centered hero. Desktop: top-aligned launcher
           that sits naturally at the top of the right pane (no dead space). */
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 overflow-y-auto px-5 pb-16 lg:justify-start lg:px-8 lg:pt-12 lg:pb-10">
          {/* Headline — mobile hero (desktop branding lives in the rail) */}
          <div className="flex flex-col items-center text-center lg:hidden">
            <span className="mb-3 flex size-12 items-center justify-center rounded-2xl" style={{ background: "var(--hh-teal-wash)" }}>
              <SparklesIcon className="size-6" style={{ color: "var(--hh-teal)" }} />
            </span>
            <h1 className="text-[30px] font-extrabold tracking-[-0.6px]" style={{ color: "var(--hh-ink)" }}>Ask</h1>
            <p className="mt-1.5 text-[15px]" style={{ color: "var(--hh-sub)" }}>
              Your home assistant — grounded in your manuals.
            </p>
          </div>

          {/* Desktop welcome (concise — rail carries history) */}
          <h2 className="hidden text-center text-[24px] font-extrabold tracking-[-0.5px] lg:block" style={{ color: "var(--hh-ink)" }}>
            What can I help with?
          </h2>

          {/* Input */}
          <div className="w-full max-w-[560px]">
            <ChatInput onSend={handleSend} disabled={isStreaming} variant="centered" />
          </div>

          {/* Scope control — below the input (both mobile and desktop) */}
          {!filtersLoading && (
            <div className="flex w-full max-w-[560px] justify-center">
              <FilterBar
                variant="centered"
                rooms={rooms}
                items={items}
                selectedRoomIds={selectedRoomIds}
                selectedItemId={selectedItemId}
                onRoomToggle={handleRoomToggle}
                onItemSelect={handleItemSelect}
              />
            </div>
          )}

          {/* Launcher cards (both mobile and desktop) */}
          <div className="grid w-full max-w-[560px] grid-cols-2 gap-3">
            {LAUNCHERS.map((c) => (
              <button
                key={c.label}
                type="button"
                onClick={() => handleSend(c.q)}
                disabled={isStreaming}
                className="flex items-center gap-3 rounded-2xl border border-[var(--hh-line)] bg-[var(--hh-surface)] p-3.5 text-left shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-colors hover:border-[rgba(27,107,90,0.3)] disabled:opacity-60"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl" style={{ background: "var(--hh-teal-wash)" }}>
                  <c.icon className="size-[18px]" style={{ color: "var(--hh-teal)" }} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[14px] font-bold tracking-[-0.2px]" style={{ color: "var(--hh-ink)" }}>{c.label}</span>
                  <span className="block text-[12px]" style={{ color: "var(--hh-sub)" }}>{c.sub}</span>
                </span>
              </button>
            ))}
          </div>

          {/* Recent questions (mobile — compact list above suggestion chips) */}
          {hasHistory && (
            <div className="w-full max-w-[560px] lg:hidden">
              <div className="mb-2 pl-0.5 text-[12px] font-bold uppercase tracking-[0.6px]" style={{ color: "var(--hh-sub)" }}>Recent</div>
              <div className="overflow-hidden rounded-2xl bg-[var(--hh-surface)] shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
                {conversations!.slice(0, 5).map((c, i) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => void handleSelectConversation(c.id)}
                    disabled={isStreaming}
                    className="flex w-full items-center gap-2.5 px-3.5 py-3 text-left disabled:opacity-60"
                    style={{ borderTop: i ? "0.5px solid var(--hh-line)" : "none" }}
                  >
                    <ClockIcon className="size-[15px] shrink-0" style={{ color: "var(--hh-faint)" }} />
                    <span className="min-w-0 flex-1 truncate text-[13.5px]" style={{ color: "#374151" }}>{c.title}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Suggestion chips (both mobile and desktop) */}
          <div className="flex flex-wrap gap-2 justify-center max-w-[560px]">
            {suggestions.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => handleSend(q)}
                className="text-sm text-primary bg-primary/8 border border-primary/20 rounded-full px-4 py-2 hover:bg-primary/14 hover:-translate-y-0.5 transition-all"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}
      </div>

      {/* Save-to-item dialog — available on both mobile and desktop */}
      <SaveFaqDialog
        open={saveDialog.open}
        onOpenChange={(open) => setSaveDialog((p) => ({ ...p, open }))}
        question={saveDialog.question}
        answer={saveDialog.answer}
        homeId={homeId}
        defaultItemUnitId={saveDialog.itemUnitId}
        onSaved={() => {
          setSavedNotice(true)
          setTimeout(() => setSavedNotice(false), 2500)
        }}
      />
      {savedNotice && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white shadow-lg">
          Saved to knowledge base
        </div>
      )}
    </div>
  )
}
