import { useEffect } from "react"

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
  onDismiss,
  ms = 7000,
}: {
  message: string
  /** Omit when the action genuinely cannot be reversed — then this is just a receipt. */
  onUndo?: () => void
  onDismiss: () => void
  ms?: number
}) {
  useEffect(() => {
    const t = window.setTimeout(onDismiss, ms)
    return () => window.clearTimeout(t)
  }, [onDismiss, ms, message])

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 z-50 flex justify-center px-4"
      // Clears the tab bar, and the home indicator under it.
      style={{ bottom: "calc(74px + env(safe-area-inset-bottom))" }}
    >
      <div
        className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-xl px-4 py-3 shadow-[0_8px_28px_rgba(8,12,11,0.28)]"
        style={{ background: "var(--hh-ink)", color: "var(--hh-bg)" }}
      >
        <span className="min-w-0 flex-1 text-[13.5px] font-medium">{message}</span>
        {onUndo && (
          <button
            type="button"
            onClick={() => { onUndo(); onDismiss() }}
            className="shrink-0 text-[13.5px] font-bold underline underline-offset-2"
            style={{ color: "var(--hh-teal-deep)" }}
          >
            Undo
          </button>
        )}
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="shrink-0 text-[13.5px] opacity-60"
        >
          ✕
        </button>
      </div>
    </div>
  )
}
