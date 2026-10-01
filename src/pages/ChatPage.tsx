import { useState, useCallback, useMemo, useEffect, useRef } from "react"
import { useSearchParams } from "react-router-dom"
import { ChevronLeftIcon, SparklesIcon, WrenchIcon, BookOpenIcon, PlusIcon, ClockIcon } from "lucide-react"
import { FilterBar } from "@/components/chat/FilterBar"
import { ChatThread } from "@/components/chat/ChatThread"
import { ChatInput } from "@/components/chat/ChatInput"
import { SaveFaqDialog } from "@/components/chat/SaveFaqDialog"
import { getSuggestions } from "@/components/chat/chatSuggestions"
import { InlineError } from "@/components/layout/LoadStates"
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
  const { rooms, items, loading: filtersLoading, error: filtersError, reload: reloadFilters } = useChatFilters(homeId)

  // Pre-scope to an item when arriving from "Fix a problem" (/chat?item=ID).
  // This is how troubleshooting now enters Ask — scoped to the appliance, with
  // its problem-oriented suggestions ready and chat answering anything.
  const [searchParams] = useSearchParams()
  const [selectedRoomIds, setSelectedRoomIds] = useState<string[]>([])
  const [selectedItemId, setSelectedItemId] = useState<string | null>(() => searchParams.get("item"))
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)

  // ── Conversation history ──
  // `conversations === null` means no list has loaded yet. A failed read says
  // so in Recent (with a retry) rather than claiming there is no history — the
  // rail's "will appear here once saved" was shown for a list it never read.
  const [conversations, setConversations] = useState<ConversationSummary[] | null>(null)
  const [activeConvoId, setActiveConvoId] = useState<string | null>(null)
  // The id of the conversation we're currently persisting into. Held in a ref
  // so the async streaming callbacks always see the latest value.
  const convoIdRef = useRef<string | null>(null)
  /** The Recent list could not be read. */
  const [historyLoadFailed, setHistoryLoadFailed] = useState(false)
  /** A past conversation that could not be opened — tapping it used to do nothing at all. */
  const [openFailedId, setOpenFailedId] = useState<string | null>(null)
  /** What of this thread is missing from history — said above the composer,
   *  because leaving would lose it (audit H6; the writes used to fail silently).
   *  "whole": the conversation was never created. "part": it exists, but a
   *  question or an answer didn't append. */
  const [threadNotSaved, setThreadNotSaved] = useState<"none" | "whole" | "part">("none")
  /** A part missing never downgrades a whole one missing. */
  const markNotSaved = useCallback((what: "whole" | "part") => setThreadNotSaved((s) => (s === "whole" ? s : what)), [])
  /** Bumped whenever the thread changes, so a late failure from a thread the
   *  person has left never flags the one they are reading now. */
  const threadSeqRef = useRef(0)

  /** Lands a read of Recent. A failed read keeps whatever list we already
   *  hold, and says so. */
  const applyConversations = useCallback((list: ConversationSummary[] | null) => {
    setHistoryLoadFailed(list === null)
    if (list !== null) setConversations(list)
  }, [])

  const refreshConversations = useCallback(async () => {
    if (!homeId) return
    applyConversations(await listConversations(homeId))
  }, [homeId, applyConversations])

  // The first read, and a home switch. The read lands in its own callback: an
  // effect calling a function that sets state reads, to react-hooks, as setting
  // it in the effect.
  useEffect(() => {
    if (!homeId) return
    void listConversations(homeId).then(applyConversations)
  }, [homeId, applyConversations])

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
    threadSeqRef.current += 1
    setThreadNotSaved("none")
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

  // Load a past conversation into the thread. A failed read says so in Recent,
  // with a retry — the tap used to do nothing at all.
  const handleSelectConversation = useCallback(async (id: string) => {
    if (isStreaming) return
    setOpenFailedId(null)
    const rows = await getConversationMessages(homeId, id)
    if (!rows) {
      setOpenFailedId(id)
      return
    }
    setMessages(toChatMessages(rows))
    setActiveConvoId(id)
    convoIdRef.current = id
    threadSeqRef.current += 1
    setThreadNotSaved("none")
  }, [isStreaming, homeId])

  /** Leave the thread and return to the Ask landing. The conversation is kept
   *  (persisted per message); this only resets the view. */
  const handleExitThread = useCallback(() => {
    setMessages([])
    setIsStreaming(false)
    convoIdRef.current = null
    setActiveConvoId(null)
    threadSeqRef.current += 1
    setThreadNotSaved("none")
  }, [])

  /** Append streamed text to one answer bubble. */
  const appendToAnswer = useCallback((id: string, delta: string) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, content: m.content + delta, isStreaming: true } : m))
    )
  }, [])

  /** Turn one answer bubble into its failure — which is also what unlocks the composer. */
  const failAnswer = useCallback((id: string, errMsg: string) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, content: errMsg, isStreaming: false, isError: true } : m))
    )
    setIsStreaming(false)
  }, [])

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

      // Persistence never blocks the stream below. A failed write is logged by
      // the service and said above the composer — this thread is not in
      // history, and leaving it would lose it.
      const thread = threadSeqRef.current
      const notSaved = (what: "whole" | "part") => { if (threadSeqRef.current === thread) markNotSaved(what) }
      const persistUser = async (): Promise<string | null> => {
        let convoId = convoIdRef.current
        if (!convoId && isFirstTurn) {
          convoId = await createConversation(homeId, user?.id ?? null, text.slice(0, 80))
          if (!convoId) {
            notSaved("whole")
            return null
          }
          convoIdRef.current = convoId
          setActiveConvoId(convoId)
        }
        if (convoId && !(await appendMessage(homeId, convoId, { role: "user", content: text }))) notSaved("part")
        return convoId
      }
      const persistPromise = persistUser()

      streamChatQuery({
        question: text,
        history,
        filter: activeFilter,
        homeId,
        onDelta: (delta) => appendToAnswer(assistantId, delta),
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
            if (!(await appendMessage(homeId, convoId, { role: "assistant", content: finalContent, sources }))) notSaved("part")
            void refreshConversations()
          })
        },
        onError: (errMsg) => failAnswer(assistantId, errMsg),
      })
    },
    [homeId, isStreaming, messages, activeFilter, user?.id, refreshConversations, appendToAnswer, failAnswer, markNotSaved]
  )

  /**
   * HH-28: ask a failed answer's question again, in place — the failed bubble
   * becomes the new answer. The question itself was saved to the conversation
   * when it was first asked, so only the answer is saved now.
   */
  const handleRetry = useCallback(
    (messageId: string) => {
      if (!homeId || isStreaming) return
      const idx = messages.findIndex((m) => m.id === messageId)
      if (idx < 1 || !messages[idx].isError || messages[idx - 1].role !== "user") return

      const question = messages[idx - 1].content
      // What came before the failed exchange, minus other failures: an error
      // line is ours, not something the assistant said.
      const history = messages
        .slice(0, idx - 1)
        .filter((m) => !m.isError)
        .map((m) => ({ role: m.role, content: m.content }))

      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? { ...m, content: "", isStreaming: true, isError: false, sources: undefined, inferredItem: undefined }
            : m
        )
      )
      setIsStreaming(true)

      let answer = ""
      streamChatQuery({
        question,
        history,
        filter: activeFilter,
        homeId,
        onDelta: (delta) => {
          answer += delta
          appendToAnswer(messageId, delta)
        },
        onDone: (sources, inferredItem) => {
          setMessages((prev) =>
            prev.map((m) => (m.id === messageId ? { ...m, isStreaming: false, sources, inferredItem } : m))
          )
          setIsStreaming(false)
          const convoId = convoIdRef.current
          if (!convoId) return
          const thread = threadSeqRef.current
          void appendMessage(homeId, convoId, { role: "assistant", content: answer, sources }).then((saved) => {
            if (!saved && threadSeqRef.current === thread) markNotSaved("part")
            void refreshConversations()
          })
        },
        onError: (errMsg) => failAnswer(messageId, errMsg),
      })
    },
    [homeId, isStreaming, messages, activeFilter, refreshConversations, appendToAnswer, failAnswer, markNotSaved]
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
        onDelta: (delta) => appendToAnswer(assistantId, delta),
        onDone: (sources, inferredItem) => {
          setMessages((p) =>
            p.map((m) =>
              m.id === assistantId ? { ...m, isStreaming: false, sources, inferredItem } : m
            )
          )
          setIsStreaming(false)
        },
        onError: (errMsg) => failAnswer(assistantId, errMsg),
      })
    },
    [homeId, isStreaming, messages, activeFilter, appendToAnswer, failAnswer]
  )

  const suggestions = getSuggestions(selectedRoomIds, selectedItemId, rooms, items)
  const hasMessages = messages.length > 0
  const hasHistory = conversations !== null && conversations.length > 0
  // A Recent read that failed, said in Recent itself (rail and phone alike).
  const recentError = openFailedId ? (
    <InlineError onRetry={() => void handleSelectConversation(openFailedId)}>Couldn&apos;t open that conversation.</InlineError>
  ) : historyLoadFailed ? (
    <InlineError onRetry={() => void refreshConversations()}>Couldn&apos;t load your past questions.</InlineError>
  ) : null

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
    <div className="flex flex-col h-[calc(100dvh-48px)] overflow-hidden pb-[calc(70px+env(safe-area-inset-bottom))] md:pb-0 bg-[var(--hh-bg)] lg:grid lg:grid-cols-[260px_minmax(0,1fr)] lg:items-start lg:gap-5">
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
            {/* A failed read is not "nothing saved yet". */}
            {recentError ?? (
              <p
                className="rounded-2xl border border-dashed border-[var(--hh-line)] px-3.5 py-3 text-[12.5px] leading-relaxed"
                style={{ color: "var(--hh-faint)" }}
              >
                Your past questions will appear here once saved.
              </p>
            )}
          </div>
        )}
        {hasHistory && (
          <div>
            <div className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.5px]" style={{ color: "var(--hh-sub)" }}>Recent</div>
            {recentError && <div className="mb-2.5">{recentError}</div>}
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
          {/* Mobile thread header: a way OUT. The thread replaced the Ask
              landing with no back control, and the tab bar's Ask tab returns to
              this same thread — a tester described feeling trapped in the
              conversation. Back ends the thread and returns to Ask home; the
              conversation itself is already persisted server-side. */}
          <div className="flex shrink-0 items-center gap-1 px-2 pt-1 lg:hidden">
            <button
              type="button"
              onClick={handleExitThread}
              className="inline-flex min-h-11 items-center gap-0.5 px-2 text-[15px] font-semibold"
              style={{ color: "var(--hh-teal)" }}
            >
              <ChevronLeftIcon className="size-5" strokeWidth={2.4} /> Ask
            </button>
          </div>
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
                itemsLoading={filtersLoading}
                itemsError={filtersError}
                onRetryItems={reloadFilters}
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
            onRetry={handleRetry}
            activeFilter={activeFilter}
          />
          {threadNotSaved !== "none" && (
            <InlineError className="shrink-0 px-4 pt-2">
              {threadNotSaved === "whole"
                ? "Couldn't save this conversation to Recent. It stays here until you leave."
                : "Part of this conversation didn't save to Recent. It stays here until you leave."}
            </InlineError>
          )}
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
                itemsLoading={filtersLoading}
                itemsError={filtersError}
                onRetryItems={reloadFilters}
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
          {(hasHistory || recentError) && (
            <div className="w-full max-w-[560px] lg:hidden">
              <div className="mb-2 pl-0.5 text-[12px] font-bold uppercase tracking-[0.6px]" style={{ color: "var(--hh-sub)" }}>Recent</div>
              {recentError && <div className="mb-2 pl-0.5">{recentError}</div>}
              {hasHistory && (
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
              )}
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

      {/* Save-to-item dialog — available on both mobile and desktop. The ONLY
          one: every answer's "Save to knowledge base" opens this instance. */}
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
