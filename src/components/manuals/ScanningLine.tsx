import { toUiStage } from "@/modules/knowledge/services/parseManualService"
import type { ManualReading } from "@/lib/manualReviewState"
import { SCAN_KEEPS_GOING_SHORT } from "@/lib/scanCopy"

/**
 * What the worker is doing, in a clause. Keyed by the UI stage; the page says
 * READING throughout (HH-161 — "Reading" everywhere, never "scanning").
 */
const STAGE_LINE: Record<string, string> = {
  queued: "Waiting to start…",
  reading: "Reading it end to end…",
  extracting: "Pulling out care steps and schedules…",
  saving: "Saving what we found…",
}

/**
 * A manual being read: one readable line, the page count, the leave-is-safe
 * promise, and a 3px rail carrying the motion — design A (HH-135).
 *
 * Extracted from ParsePickupCard, where it sat ABOVE the page — above "‹ Items"
 * — only because the item page used to mount two trees and a copy inside a
 * tree would have mounted twice. The page renders one tree now (HH-159), so the
 * line lives where the tasks will land: inside the Upkeep card (HH-161).
 *
 * The rail is indeterminate ON PURPOSE. The worker reports the page count, not
 * its position, and a bar that implies progress it cannot measure is the kind
 * of small lie this product does not tell. `.hh-scanrail` holds still, as a
 * faint full bar, under reduced motion.
 */
export function ScanningLine({ reading }: { reading: ManualReading }) {
  const line = reading.stage === "awaiting_capacity"
    // Parked by the daily ceiling, not running (HH-124, HH-132): say so rather
    // than implying the worker is on it.
    ? "Queued — it starts on its own."
    : STAGE_LINE[toUiStage(reading.stage)] ?? "Working…"
  return (
    <div data-testid="reading-line">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[14.5px] font-bold" style={{ color: "var(--hh-ink)" }}>
          Reading the manual
        </p>
        {reading.pages ? (
          <span className="shrink-0 text-[12px] tabular-nums" style={{ color: "var(--hh-sub)" }}>
            {reading.pages} pages
          </span>
        ) : null}
      </div>
      <p className="mt-0.5 text-[12.5px]" style={{ color: "var(--hh-sub)" }}>
        {line} {SCAN_KEEPS_GOING_SHORT}
      </p>
      <div
        className="mt-2 h-[3px] w-full overflow-hidden rounded-full"
        style={{ background: "var(--hh-line)" }}
        role="progressbar"
        aria-label="Reading the manual"
      >
        <div className="hh-scanrail h-full rounded-full" style={{ background: "var(--hh-teal)" }} />
      </div>
    </div>
  )
}
