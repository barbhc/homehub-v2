import { useRef, useState, useCallback } from "react"
import { Loader2Icon, SendIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const MAX_ROWS = 4

type ChatInputProps = {
  onSend: (text: string) => void
  disabled?: boolean
  variant?: "default" | "centered"
}

export function ChatInput({ onSend, disabled, variant = "default" }: ChatInputProps) {
  const [value, setValue] = useState("")
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const adjustHeight = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = "auto"
    const lineHeight = variant === "centered" ? 24 : 20
    const maxRows = variant === "centered" ? 5 : MAX_ROWS
    const rows = Math.min(Math.max(1, Math.ceil(el.scrollHeight / lineHeight)), maxRows)
    el.style.height = `${rows * lineHeight}px`
  }, [variant])

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value)
    adjustHeight()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  const submit = () => {
    const trimmed = value.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
    setValue("")
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
    }
  }

  if (variant === "centered") {
    return (
      <div className="relative w-full">
        <div
          className={cn(
            "flex items-end gap-2 bg-card border-[1.5px] border-border rounded-2xl px-4 py-3 shadow-[0_4px_20px_rgba(0,0,0,0.08)] transition-all",
            "focus-within:border-primary focus-within:shadow-[0_0_0_3px_rgba(27,107,90,0.08),0_4px_20px_rgba(0,0,0,0.08)]"
          )}
        >
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your home…"
            disabled={disabled}
            rows={1}
            className="flex-1 bg-transparent outline-none resize-none text-base placeholder:text-muted-foreground/40 py-1 min-h-[28px] max-h-[120px] overflow-y-auto leading-relaxed"
            aria-label="Message"
          />
          <Button
            type="button"
            size="icon"
            onClick={submit}
            disabled={disabled || !value.trim()}
            className="shrink-0 size-10 rounded-xl"
            aria-label="Send"
          >
            {disabled ? (
              <Loader2Icon className="size-4 animate-spin" aria-hidden />
            ) : (
              <SendIcon className="size-4" aria-hidden />
            )}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="px-4 pb-4 pt-2 shrink-0 bg-background">
      <div
        className={cn(
          "flex items-end gap-2 bg-background border-[1.5px] border-border rounded-2xl px-4 py-2 shadow-[0_2px_12px_rgba(0,0,0,0.06)] transition-all",
          "focus-within:border-primary focus-within:shadow-[0_0_0_3px_rgba(27,107,90,0.08),0_2px_12px_rgba(0,0,0,0.06)]"
        )}
      >
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Ask a follow-up…"
          disabled={disabled}
          rows={1}
          className="flex-1 bg-transparent outline-none resize-none text-base md:text-sm placeholder:text-muted-foreground/50 py-1 min-h-[24px] max-h-[96px] overflow-y-auto leading-relaxed"
          aria-label="Message"
        />
        <Button
          type="button"
          size="icon"
          onClick={submit}
          disabled={disabled || !value.trim()}
          className="shrink-0 size-11 md:size-9 rounded-xl"
          aria-label="Send"
        >
          {disabled ? (
            <Loader2Icon className="size-4 animate-spin" aria-hidden />
          ) : (
            <SendIcon className="size-4" aria-hidden />
          )}
        </Button>
      </div>
    </div>
  )
}
