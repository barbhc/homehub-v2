/**
 * Where a manual being read, or a read waiting for its review, shows up —
 * without anything floating over a page.
 *
 * Owner, 2026-11-20 (walk comments; mock https://claude.ai/artifact/Cz4hWKhTjR5YenPBdaJjeU,
 * screen "Nothing covers what you're reading"): "the navigation should never
 * block the text that should be readable by the user". The floating pill of
 * HH-161 always covered whatever scrolled under it, so it is gone. The same
 * facts now live in three places that cover nothing:
 *
 *   - the item's own page: its Upkeep card ("Reading the manual") and the
 *     hand-off card, as before;
 *   - a count on the Items tab (phone tab bar and desktop header);
 *   - the Items list: that item's row says "Reading · 42 pages", "Queued" or
 *     "Ready to review", and a ready row opens the review on arrival.
 *
 * One subscription for the whole app (useParseTray, mounted once by the
 * layout), shared through context.
 */
import { createContext, useContext } from "react"
import type { ParseTray } from "@/hooks/useParseTray"
import { scanProgressLabel } from "@/lib/scanCopy"

const EMPTY: ParseTray = { parsing: [], ready: [] }
/** Provided once by the layout (ScanTrayProvider in ScanTray.tsx). */
export const ScanTrayContext = createContext<ParseTray>(EMPTY)

/** The home's reads in flight and reads waiting for review. Empty outside the layout. */
export const useScanTray = (): ParseTray => useContext(ScanTrayContext)

/** Parked by the ceiling: saved, not running, and started automatically (HH-132). */
const isQueued = (stage: string) => stage === "awaiting_capacity"

export type ItemScanStatus =
  | { state: "ready"; manualId: string; text: string }
  | { state: "reading" | "queued"; manualId: string; text: string }

/**
 * One status per item. A read waiting for review wins over another still being
 * read for the same item: it is the one with something to do.
 */
export function scanStatusByItem(tray: ParseTray): Map<string, ItemScanStatus> {
  const out = new Map<string, ItemScanStatus>()
  for (const e of tray.parsing) {
    if (out.has(e.itemUnitId)) continue
    out.set(e.itemUnitId, isQueued(e.stage)
      ? { state: "queued", manualId: e.manualId, text: "Queued to read" }
      // The worker's page count once it has one; never a position it does not report.
      : { state: "reading", manualId: e.manualId, text: `Reading the manual · ${scanProgressLabel(null, e.pages)}` })
  }
  for (const e of tray.ready) out.set(e.itemUnitId, { state: "ready", manualId: e.manualId, text: "Ready to review" })
  return out
}

/** The Items tab's count and its spoken form ("1 reading, 1 ready to review"). */
export function scanCount(tray: ParseTray): { count: number; label: string } {
  const queued = tray.parsing.filter((e) => isQueued(e.stage)).length
  const reading = tray.parsing.length - queued
  const parts = [
    reading ? `${reading} reading` : null,
    queued ? `${queued} queued` : null,
    tray.ready.length ? `${tray.ready.length} ready to review` : null,
  ].filter(Boolean)
  return { count: tray.parsing.length + tray.ready.length, label: parts.join(", ") }
}

