import { useEffect, useRef } from "react"
import { ChatMessageBubble } from "./ChatMessageBubble"
import { stillFollowing } from "./threadFollow"
import type { ChatMessage } from "@/modules/knowledge/services/chatService"
import type { ChatFilter } from "@/modules/knowledge/services/chatService"

type ChatThreadProps = {
  messages: ChatMessage[]
  onSaveFaq?: (question: string, answer: string, itemUnitId: string | null) => void
  onWebSearch?: (messageId: string) => void
  onRetry?: (messageId: string) => void
  activeFilter?: ChatFilter
}

export function ChatThread({
  messages,
  onSaveFaq,
  onWebSearch,
  onRetry,
  activeFilter,
}: ChatThreadProps) {
  const threadRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  // The thread used to scroll to the bottom on EVERY change — including each
  // streamed chunk — so anyone who scrolled up to reread an answer was yanked
  // back down while the next one arrived (audit 2026-10-15). Now it follows
  // only while the reader is at the bottom, and always when a new message is
  // added (they sent one, asked for a web search, or opened a conversation).
  const followingRef = useRef(true)
  const prevCountRef = useRef(0)
  const hasMessages = messages.length > 0

  useEffect(() => {
    const el = threadRef.current
    if (!el) return
    // The thread may be its own scroller, or the page may scroll around it —
    // watch both and let whichever the reader moved decide.
    let prevEl = el.scrollTop
    let prevWin = window.scrollY
    const onThreadScroll = () => {
      followingRef.current = stillFollowing({
        top: el.scrollTop,
        maxTop: el.scrollHeight - el.clientHeight,
        prevTop: prevEl,
        following: followingRef.current,
      })
      prevEl = el.scrollTop
    }
    const onWindowScroll = () => {
      const doc = document.scrollingElement ?? document.documentElement
      const maxTop = doc.scrollHeight - window.innerHeight
      // A page that cannot scroll says nothing about where the reader is.
      if (maxTop > 0) {
        followingRef.current = stillFollowing({
          top: window.scrollY,
          maxTop,
          prevTop: prevWin,
          following: followingRef.current,
        })
      }
      prevWin = window.scrollY
    }
    el.addEventListener("scroll", onThreadScroll, { passive: true })
    window.addEventListener("scroll", onWindowScroll, { passive: true })
    return () => {
      el.removeEventListener("scroll", onThreadScroll)
      window.removeEventListener("scroll", onWindowScroll)
    }
  }, [hasMessages])

  useEffect(() => {
    const added = messages.length > prevCountRef.current
    prevCountRef.current = messages.length
    if (added) followingRef.current = true
    if (followingRef.current) bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  if (messages.length === 0) {
    return null
  }

  return (
    <div ref={threadRef} className="flex flex-col gap-4 overflow-y-auto flex-1 py-4 px-4">
      {messages.map((msg, i) => {
        const precedingQuestion =
          msg.role === "assistant" && messages[i - 1]?.role === "user"
            ? messages[i - 1].content
            : undefined
        return (
          <ChatMessageBubble
            key={msg.id}
            message={msg}
            precedingQuestion={precedingQuestion}
            onSaveFaq={onSaveFaq}
            onWebSearch={onWebSearch}
            // Only an answer to a question is re-asked in place; a failed
            // web search is retried from the answer it followed.
            onRetry={precedingQuestion !== undefined ? onRetry : undefined}
            activeFilterType={activeFilter?.type}
            activeFilterValue={activeFilter?.value}
          />
        )
      })}
      <div ref={bottomRef} />
    </div>
  )
}
