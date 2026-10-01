import { BookmarkIcon, BookOpenIcon, BrainIcon, GlobeIcon, RotateCcwIcon, ScanSearchIcon, StickyNoteIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ChatMessage, ChatSource } from "@/modules/knowledge/services/chatService"
import ReactMarkdown from "react-markdown"

/**
 * HH-28: "empty answers say so honestly." An answer that finished with no text
 * rendered as an empty bubble — a shape with nothing in it, which reads as the
 * app breaking rather than as "nothing matched". One calm line instead.
 */
export const EMPTY_ANSWER = "I couldn't find anything in your manuals for that."

function SourceChip({ source: s }: { source: ChatSource }) {
  const isWeb = s.source_type === "web"
  const isAi = s.source_type === "ai"
  // The household's own note (design/spares-and-notes.md): "Your note · House".
  const isNote = s.source_type === "note"

  const label = isAi
    ? "General knowledge"
    : isNote
      ? `Your note · ${s.item_name}`
      : isWeb
      ? (s.url ? new URL(s.url).hostname.replace(/^www\./, "") : s.item_name)
      : `${s.item_name}${s.title && s.title !== "Manual excerpt" ? ` — ${s.title}` : ""}`

  const chip = (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[11px] rounded px-1.5 py-0.5 font-medium",
        isAi && "bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
        isWeb && "bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
        !isAi && !isWeb && "bg-primary/8 text-primary"
      )}
    >
      {isAi && <BrainIcon className="size-2.5 shrink-0" aria-hidden />}
      {isWeb && <GlobeIcon className="size-2.5 shrink-0" aria-hidden />}
      {isNote && <StickyNoteIcon className="size-2.5 shrink-0" aria-hidden />}
      {!isAi && !isWeb && !isNote && <BookOpenIcon className="size-2.5 shrink-0" aria-hidden />}
      {label}
    </span>
  )

  if (isWeb && s.url) {
    return (
      <a href={s.url} target="_blank" rel="noopener noreferrer" className="hover:opacity-80 transition-opacity">
        {chip}
      </a>
    )
  }
  return chip
}

function shouldOfferWebSearch(message: ChatMessage): boolean {
  if (message.role !== "assistant" || message.isStreaming || message.isError) return false
  if (!message.content?.trim()) return false
  if (message.sources?.some((s) => s.source_type === "web")) return false
  return /not covered|doesn't cover|not in the manual|contact the manufacturer|general knowledge/i.test(
    message.content
  )
}

type ChatMessageBubbleProps = {
  message: ChatMessage
  precedingQuestion?: string
  /** Asks the PAGE to open its one save dialog for this answer. The bubble used
   *  to open a dialog of its own and hand the page `onSaved`, which opened the
   *  page's dialog too — two dialogs, and a second tap wrote the answer twice
   *  (audit H6). */
  onSaveFaq?: (question: string, answer: string, itemUnitId: string | null) => void
  onWebSearch?: (messageId: string) => void
  /** Ask a failed answer's question again, in place (HH-28). */
  onRetry?: (messageId: string) => void
  activeFilterType?: "all" | "item" | "room" | "category"
  activeFilterValue?: string
}

export function ChatMessageBubble({
  message,
  precedingQuestion,
  onSaveFaq,
  onWebSearch,
  onRetry,
  activeFilterType,
  activeFilterValue,
}: ChatMessageBubbleProps) {
  const isUser = message.role === "user"
  /** Whitespace is not an answer — a finished bubble of blanks is an empty one. */
  const hasText = !!message.content?.trim()

  return (
    <>
      <div
        className={cn(
          "flex flex-col gap-1",
          isUser ? "items-end ml-auto max-w-[80%]" : "items-start max-w-[85%]"
        )}
      >
        <div
          className={cn(
            "rounded-2xl px-4 py-2.5",
            isUser
              ? "bg-foreground text-background rounded-2xl rounded-br-sm px-4 py-2.5"
              : "bg-card border border-border rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm",
            message.isError && "text-destructive"
          )}
        >
          {hasText || (message.isStreaming && message.content) ? (
            <div className={cn(
              "text-sm break-words",
              !isUser && "prose prose-sm max-w-none prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0 prose-blockquote:my-1 prose-blockquote:border-l-2 prose-blockquote:pl-3 prose-blockquote:text-muted-foreground dark:prose-invert"
            )}>
              {isUser ? message.content : <ReactMarkdown>{message.content}</ReactMarkdown>}
              {message.isStreaming && (
                <span className="inline-block w-2 h-4 ml-0.5 bg-current animate-pulse align-middle" />
              )}
            </div>
          ) : message.isStreaming ? (
            <span className="inline-block w-2 h-4 bg-current animate-pulse" />
          ) : !isUser && !message.isError ? (
            <p className="text-sm text-muted-foreground">{EMPTY_ANSWER}</p>
          ) : null}
        </div>
        {!isUser && message.isError && onRetry && (
          // HH-28: an answer that failed or stopped short unlocks the composer
          // AND offers the one thing worth doing next, beside the failure.
          <button
            type="button"
            onClick={() => onRetry(message.id)}
            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground border border-border rounded-md px-2.5 py-1 hover:border-primary hover:text-primary hover:bg-primary/5 transition-colors mt-1"
          >
            <RotateCcwIcon className="size-3" aria-hidden />
            Try again
          </button>
        )}
        {!isUser && message.inferredItem && !message.isStreaming && (
          <div className="flex items-center gap-1 text-[11px] text-amber-700 dark:text-amber-400 mt-1">
            <ScanSearchIcon className="size-3 shrink-0" aria-hidden />
            <span>Scoped to: <span className="font-medium">{message.inferredItem.display_name}</span></span>
          </div>
        )}
        {!isUser && message.sources && message.sources.length > 0 && (
          <div className="flex flex-wrap gap-1.5 items-center text-xs text-muted-foreground mt-2 pt-2 border-t border-border">
            <span className="text-muted-foreground">Sources:</span>
            {message.sources.map((s, i) => <SourceChip key={i} source={s} />)}
          </div>
        )}
        {!isUser &&
          !message.isStreaming &&
          !message.isError &&
          hasText &&
          onWebSearch &&
          shouldOfferWebSearch(message) && (
            <button
              type="button"
              onClick={() => onWebSearch(message.id)}
              className="flex items-center gap-1.5 text-xs font-medium text-sky-700 border border-sky-200 rounded-md px-2.5 py-1 hover:bg-sky-50 dark:text-sky-300 dark:border-sky-800 dark:hover:bg-sky-950/40 transition-colors mt-1"
            >
              <GlobeIcon className="size-3" aria-hidden />
              Search the web for more
            </button>
          )}
        {!isUser &&
          !message.isStreaming &&
          !message.isError &&
          hasText &&
          onSaveFaq &&
          precedingQuestion !== undefined && (
            <button
              type="button"
              onClick={() =>
                onSaveFaq(
                  precedingQuestion,
                  message.content,
                  // The item the answer was scoped or inferred to, else the
                  // scope filter's item; the page falls back to its own scope.
                  message.inferredItem?.item_unit_id ??
                    (activeFilterType === "item" ? activeFilterValue ?? null : null),
                )
              }
              className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground border border-border rounded-md px-2.5 py-1 hover:border-primary hover:text-primary hover:bg-primary/5 transition-colors mt-1"
            >
              <BookmarkIcon className="size-3" aria-hidden />
              Save to knowledge base
            </button>
          )}
      </div>
    </>
  )
}
