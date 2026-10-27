import { useEffect } from "react"
import { XIcon } from "lucide-react"

/**
 * A brief confirmation of something that just happened, with a way back.
 *
 * Built because the app kept doing things silently: a swiped row simply
 * disappeared, and a tester reasonably concluded he had deleted a task and
 * asked for it to be restored. Nothing had been deleted. An action the user
 * cannot see the result of — and cannot reverse — is a destructive action as
 * far as they are concerned, whatever the database did.
 *
 * Deliberately not a toast library: one element, no portal, no dependency.
 */
export function UndoBar({
  message,
  onUndo,
  actionLabel,
  onDismiss,
  ms = 7000,
}: {
  message: string
  /** Omit when the action genuinely cannot be reversed — then this is just a receipt. */
  onUndo?: () => void
  /** The button's word when it is not Undo ("Try again"). Such an action does
   *  not close the bar itself — the caller decides what the bar says next. */
  actionLabel?: string
  onDismiss: () => void
  /** 0: the bar stays until it is acted on or dismissed (a failure is not furniture to time out). */
  ms?: number
}) {
  useEffect(() => {
    if (ms <= 0) return
    const t = window.setTimeout(onDismiss, ms)
    return () => window.clearTimeout(t)
  }, [onDismiss, ms, message])

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 z-50 flex justify-center px-4"
      // Clears the tab bar, and the home indicator under it — and a page's own
      // bottom bar when it has one (--hh-page-bar-h, published by usePageBar).
      // 74px at the normal text size; rises with the tab bar under Larger Text.
      style={{ bottom: "calc(max(74px, var(--hh-tabbar-h) + 11.5px) + env(safe-area-inset-bottom) + var(--hh-page-bar-h, 0px))" }}
    >
      <div
        className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-xl px-4 py-3 shadow-[0_8px_28px_rgba(8,12,11,0.28)]"
        style={{ background: "var(--hh-ink)", color: "var(--hh-bg)" }}
      >
        <span className="min-w-0 flex-1 text-[0.84375rem] font-medium">{message}</span>
        {onUndo && (
          <button
            type="button"
            onClick={() => {
              onUndo()
              if (!actionLabel) onDismiss()
            }}
            className="hit-44 shrink-0 text-[0.84375rem] font-bold underline underline-offset-2"
            // Not --hh-teal-deep: that is a colour for light SURFACES, and on
            // the ink bar it was 2.19:1. --hh-accent-on-ink flips with the bar.
            style={{ color: "var(--hh-accent-on-ink)" }}
          >
            {actionLabel ?? "Undo"}
          </button>
        )}
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          // Grows RIGHT, into the bar's padding and the margin past it: Undo
          // sits 12px to its left, too close for two centred 44pt taps.
          className="hit-44-right flex shrink-0 opacity-60"
        >
          <XIcon className="size-3.5" aria-hidden />
        </button>
      </div>
    </div>
  )
}
