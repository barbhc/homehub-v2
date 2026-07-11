import { useEffect, useRef } from "react"
import { ChatMessageBubble } from "./ChatMessageBubble"
import type { ChatMessage } from "@/modules/knowledge/services/chatService"
import type { ChatFilter } from "@/modules/knowledge/services/chatService"

type ChatThreadProps = {
  messages: ChatMessage[]
  onSaveFaq?: (question: string, answer: string, itemUnitId: string | null) => void
  onWebSearch?: (messageId: string) => void
  activeFilter?: ChatFilter
  homeId: string
}

export function ChatThread({
  messages,
  onSaveFaq,
  onWebSearch,
  activeFilter,
  homeId,
}: ChatThreadProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  if (messages.length === 0) {
    return null
  }

  return (
    <div className="flex flex-col gap-4 overflow-y-auto flex-1 py-4 px-4">
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
            activeFilterType={activeFilter?.type}
            activeFilterValue={activeFilter?.value}
            homeId={homeId}
          />
        )
      })}
      <div ref={bottomRef} />
    </div>
  )
}
