import { useEffect, useState } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { SKELETON_PATIENCE_MS } from "@/lib/homeLoadingGate"
import { dens } from "@/lib/redesign/tokens"
import { ItemsPhoneHeader } from "./RefinedItems"

const INK = "var(--hh-ink)", SUB = "var(--hh-sub)", TEAL = "var(--hh-teal)"

/**
 * The Items page while its list loads, shaped like the page it turns into —
 * RefinedItems on phones (the real header with a live "+", then the house-notes
 * card, search, sort chips and grouped rows) and DesktopItems at lg+ (title,
 * count line, 190 px card grid). The skeleton this replaces was the
 * pre-redesign page: "Inventory", an "Add Item" pill, a tab bar and 3-column
 * icon grids, so every load showed one page and landed on another.
 *
 * It only appears when there is nothing at all to paint — no fresh list, no
 * cached one, no persisted snapshot (see useHomeItems). Past
 * SKELETON_PATIENCE_MS it says so and offers Try again: shimmer alone stops
 * reading as loading after a few seconds and starts reading as broken.
 */
export function ItemsSkeleton({ onRetry }: { onRetry: () => void }) {
  // Each Try again restarts the wait; the note belongs to the attempt that
  // outlasted its patience, so a retry takes it down until that one does too.
  const [attempt, setAttempt] = useState(0)
  const [slowAttempt, setSlowAttempt] = useState<number | null>(null)
  useEffect(() => {
    const t = window.setTimeout(() => setSlowAttempt(attempt), SKELETON_PATIENCE_MS)
    return () => window.clearTimeout(t)
  }, [attempt])
  const slow = slowAttempt === attempt
  const retry = () => {
    setAttempt((a) => a + 1)
    onRetry()
  }

  return (
    <div data-testid="items-skeleton">
      <div className="lg:hidden -mx-6">
        <div className="mx-auto w-full max-w-[460px]">
          <PhoneSkeleton slow={slow} onRetry={retry} />
        </div>
      </div>
      <div className="hidden lg:block">
        <DesktopSkeleton slow={slow} onRetry={retry} />
      </div>
    </div>
  )
}

/** Screen-reader status for the load, and — once the wait is long — the visible note. */
function LoadingStatus({ slow, onRetry }: { slow: boolean; onRetry: () => void }) {
  return (
    <div role="status">
      <span className="sr-only">Loading items…</span>
      {slow && (
        <div
          className="mb-3 flex items-center gap-3 rounded-xl border px-3.5 py-1 text-[13px]"
          style={{ borderColor: "var(--hh-line)", background: "var(--hh-surface)", color: SUB }}
        >
          <span className="min-w-0 flex-1 py-2">Still loading…</span>
          <button type="button" onClick={onRetry} className="min-h-11 shrink-0 font-bold" style={{ color: TEAL }}>
            Try again
          </button>
        </div>
      )}
    </div>
  )
}

function PhoneSkeleton({ slow, onRetry }: { slow: boolean; onRetry: () => void }) {
  const d = dens("cozy")
  return (
    <div className="flex min-h-full flex-col" style={{ background: "var(--hh-bg)" }}>
      <ItemsPhoneHeader />
      <div className="flex flex-1 flex-col px-5 pt-4" style={{ paddingInline: d.pad }}>
        <LoadingStatus slow={slow} onRetry={onRetry} />
        <div aria-hidden="true">
          {/* House notes card */}
          <Skeleton className="mb-3 h-[62px] rounded-2xl" />
          {/* Search */}
          <Skeleton className="mb-3 h-11 rounded-xl" />
          {/* Sort chips */}
          <div className="mb-4 flex items-center gap-2">
            <Skeleton className="h-3.5 w-8" />
            {[62, 58, 72].map((w) => (
              <Skeleton key={w} className="h-8 rounded-full" style={{ width: w }} />
            ))}
          </div>
          {/* Room groups of list rows */}
          {[3, 2].map((rows, g) => (
            <div key={g} style={{ marginBottom: d.stack }}>
              <Skeleton className="mb-2 h-3 w-20" />
              <div className="overflow-hidden rounded-2xl shadow-[0_1px_2px_rgba(15,23,42,0.05)]" style={{ background: "var(--hh-surface)" }}>
                {Array.from({ length: rows }, (_, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3.5"
                    style={{ padding: `${d.rowPy}px ${d.cardPad}px`, borderBottom: i === rows - 1 ? "none" : "0.5px solid var(--hh-line)" }}
                  >
                    <Skeleton className="shrink-0 rounded-xl" style={{ width: d.tap + 20, height: d.tap + 20 }} />
                    <div className="min-w-0 flex-1">
                      <Skeleton className="h-4" style={{ width: `${64 - i * 9}%` }} />
                      <Skeleton className="mt-1.5 h-3" style={{ width: `${40 - i * 6}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function DesktopSkeleton({ slow, onRetry }: { slow: boolean; onRetry: () => void }) {
  return (
    <div>
      {/* DesktopItems' header: the title, then the count line it fills in. */}
      <div className="mb-4">
        <h1 className="text-[27px] font-extrabold tracking-[-0.6px]" style={{ color: INK }}>Items</h1>
        <Skeleton className="mt-2.5 h-3.5 w-48" aria-hidden="true" />
      </div>
      <div className="max-w-md">
        <LoadingStatus slow={slow} onRetry={onRetry} />
      </div>
      <div aria-hidden="true">
        {/* House notes card */}
        <Skeleton className="mb-4 h-[62px] max-w-md rounded-2xl" />
        {/* Room + sort pills */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {[64, 96, 84, 104, 58, 62, 72].map((w, i) => (
            <Skeleton key={i} className="h-8 rounded-full" style={{ width: w }} />
          ))}
        </div>
        {/* Room groups of cards */}
        <div className="flex flex-col gap-6">
          {[4, 3].map((cards, g) => (
            <div key={g}>
              <Skeleton className="mb-3 h-3 w-24" />
              <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))" }}>
                {Array.from({ length: cards }, (_, i) => (
                  <div key={i} className="flex min-h-[168px] flex-col gap-3 rounded-[18px] bg-[var(--hh-surface)] p-4 shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
                    <Skeleton className="size-12 rounded-xl" />
                    <div>
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="mt-1.5 h-3 w-1/2" />
                    </div>
                    <Skeleton className="mt-auto h-2.5 w-16" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
