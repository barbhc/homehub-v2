import type { ReactNode } from "react"
import { CloudOffIcon, RotateCwIcon } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * A failed read with nothing to show in its place: say what failed and offer
 * the one thing to do about it. Calm, never red — design/hh-states.jsx
 * (ErrorState): "errors stay reassuring".
 */
export function LoadErrorState({ title, message, onRetry }: { title: string; message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="mx-auto flex max-w-sm flex-col items-center px-4 py-14 text-center">
      <span className="mb-4 flex size-16 items-center justify-center rounded-full" style={{ background: "var(--hh-slate-soft)" }}>
        <CloudOffIcon className="size-7" style={{ color: "var(--hh-slate)" }} aria-hidden />
      </span>
      <h2 className="text-[21px] font-extrabold tracking-[-0.4px]" style={{ color: "var(--hh-ink)" }}>{title}</h2>
      <p className="mt-2 text-[14.5px] leading-relaxed" style={{ color: "var(--hh-sub)" }}>{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl px-5 text-[14.5px] font-bold text-white"
        style={{ background: "var(--hh-teal)" }}
      >
        <RotateCwIcon className="size-4" strokeWidth={2.4} aria-hidden />
        Try again
      </button>
    </div>
  )
}

/** Clay nudged toward ink, so the line holds AA contrast on every surface it
 *  lands on — plain clay on Home's open-row teal wash measures ~4.3:1 — and
 *  mixing with ink (not black) keeps it right in dark mode too. */
const INLINE_ERROR_COLOR = "color-mix(in srgb, var(--hh-clay) 85%, var(--hh-ink))"

/**
 * A write (or a small read) that failed, said where it happened: one calm line
 * — what failed and what to do — plus the retry when there is one. Clay, never
 * alarm red. This is RefinedWeek's `actionError` line, shared, so a failed save
 * reads the same on every screen and never leaves a success state standing.
 */
export function InlineError({
  children,
  onRetry,
  retryLabel = "Try again",
  className,
}: {
  children: ReactNode
  onRetry?: () => void
  retryLabel?: string
  className?: string
}) {
  return (
    <div role="alert" className={cn("text-[13px] font-medium leading-snug", className)} style={{ color: INLINE_ERROR_COLOR }}>
      {children}
      {onRetry && (
        <>
          {" "}
          <button type="button" onClick={onRetry} className="font-bold underline underline-offset-2">
            {retryLabel}
          </button>
        </>
      )}
    </div>
  )
}

/**
 * A failed REFRESH behind data we can still show — the in-memory list, or the
 * snapshot persisted by an earlier launch. Say so quietly and stay usable: only
 * freshness is in question, so this is a note, not an error state. Same words
 * as Home's banner, so the app says one thing about one situation.
 */
export function StaleDataNote({ onRetry, className }: { onRetry: () => void; className?: string }) {
  return (
    <div
      role="status"
      className={cn("flex items-center gap-2.5 rounded-xl border px-3.5 py-1", className)}
      style={{ borderColor: "var(--hh-line)", background: "var(--hh-surface)" }}
    >
      <CloudOffIcon className="size-4 shrink-0" style={{ color: "var(--hh-sub)" }} aria-hidden />
      <span className="min-w-0 flex-1 py-1.5 text-[12.5px]" style={{ color: "var(--hh-sub)" }}>
        Showing your last saved view — couldn&apos;t reach the server.
      </span>
      <button type="button" onClick={onRetry} className="min-h-11 shrink-0 text-[12.5px] font-bold" style={{ color: "var(--hh-teal)" }}>
        Retry
      </button>
    </div>
  )
}
