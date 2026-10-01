/**
 * HH-87, the owner's second question: "should there be an in-progress window
 * within the app that shows if one or multiple manuals are being parsed and
 * when the tasks are ready to be reviewed? Otherwise the task window just pops
 * up randomly when it's done."
 *
 * This is that window's data. A live subscription over the home's manuals,
 * split into the two states someone actually waits on:
 *
 *   parsing — being read right now (or parked for capacity, starting itself)
 *   ready   — read, and its findings are waiting for the review
 *
 * HH-161: both come from lib/manualReviewState — the same functions the item
 * page reads its live manuals through — so the pill and the page cannot
 * disagree about a manual they both see. This used to keep its own definition
 * of "ready" (done + a draft), which parted from the page's on a manual read
 * again after it was saved.
 *
 * A saved manual is in neither list (Save clears the draft), so the tray drains
 * itself and the pill disappears — no dismissal state to store, nothing to nag.
 */
import { useEffect, useState } from "react"
import { collection, onSnapshot, query, where, type DocumentSnapshot } from "firebase/firestore"
import { db } from "@/integrations/firebase"
import { ACTIVE_PARSE_STAGES } from "@/modules/knowledge/services/parseManualService"
import { isAwaitingReview, isReading, readingPages } from "@/lib/manualReviewState"

export interface TrayEntry {
  /** Pages the read has to get through; null until THIS read has counted them. */
  pages: number | null
  manualId: string
  itemUnitId: string
  title: string
  stage: string
}

export interface ParseTray {
  parsing: TrayEntry[]
  ready: TrayEntry[]
}

const EMPTY: ParseTray = { parsing: [], ready: [] }

/**
 * Only the stages the tray can show: a read in progress, or finished. Every
 * saved manual is "done" too, but a home has a handful of manuals, and the
 * never-read and errored ones — the rest — are not streamed at all.
 */
const TRAY_STAGES = [...ACTIVE_PARSE_STAGES, "done"]

/**
 * The few fields the tray reads, and nothing else. The web SDK has no field
 * mask for a listener, so a manual waiting for review still arrives with its
 * draft attached — the tray asks only WHETHER there is one and never keeps it.
 */
export function trayEntryFacts(d: DocumentSnapshot) {
  const parse = (d.get("parse") ?? null) as { stage?: string; pdfPages?: number; mode?: string } | null
  const stage = parse?.stage ?? null
  const facts = {
    parse_stage: stage,
    parsed_at: d.get("parsedAt") == null ? null : "saved",
    has_preview_draft: d.get("previewDraft") != null,
    parse_mode: parse?.mode ?? null,
    parse_pages: parse?.pdfPages ?? null,
  }
  const entry: TrayEntry = {
    manualId: d.id,
    itemUnitId: d.get("itemUnitId") ?? "",
    title: d.get("title") || "Manual",
    pages: readingPages(facts),
    stage: stage ?? "",
  }
  return { facts, entry, deleted: d.get("deletedAt") != null }
}

export function useParseTray(homeId: string | null): ParseTray {
  const [tray, setTray] = useState<ParseTray>(EMPTY)

  useEffect(() => {
    if (!homeId) { setTray(EMPTY); return }
    const q = query(collection(db, `homes/${homeId}/manuals`), where("parse.stage", "in", TRAY_STAGES))
    const unsub = onSnapshot(
      q,
      (snap) => {
        const parsing: TrayEntry[] = []
        const ready: TrayEntry[] = []
        for (const d of snap.docs) {
          const { facts, entry, deleted } = trayEntryFacts(d)
          if (deleted) continue
          if (isReading(facts)) parsing.push(entry)
          else if (isAwaitingReview(facts)) ready.push(entry)
        }
        setTray({ parsing, ready })
      },
      (e) => {
        // A failed listener must not break the shell; the tray only enriches.
        // Logged, so a rules or index regression is visible in the console.
        console.warn("[tray] manuals listener failed:", e.message)
        setTray(EMPTY)
      },
    )
    return unsub
  }, [homeId])

  return tray
}
