/**
 * HH-87, the owner's second question: "should there be an in-progress window
 * within the app that shows if one or multiple manuals are being parsed and
 * when the tasks are ready to be reviewed? Otherwise the task window just pops
 * up randomly when it's done."
 *
 * This is that window's data. A live subscription over the home's manuals,
 * split into the two states someone actually waits on:
 *
 *   parsing — a worker is on it right now
 *   ready   — parse finished, previewDraft still exists, i.e. NOTHING has been
 *             saved and the review is waiting on a human
 *
 * A committed manual is in neither list (commitManualDraft deletes the draft),
 * so the tray drains itself and the pill disappears — no dismissal state to
 * store, nothing to nag. The whole-collection listener matches how the rest of
 * the app reads this collection; a home has a handful of manuals.
 */
import { useEffect, useState } from "react"
import { collection, onSnapshot, query, where } from "firebase/firestore"
import { db } from "@/integrations/firebase"
import { ACTIVE_PARSE_STAGES } from "@/modules/knowledge/services/parseManualService"

export interface TrayEntry {
  /** Pages the scan has to get through; null until the PDF has been fetched. */
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

export function useParseTray(homeId: string | null): ParseTray {
  const [tray, setTray] = useState<ParseTray>(EMPTY)

  useEffect(() => {
    if (!homeId) { setTray(EMPTY); return }
    const q = query(collection(db, `homes/${homeId}/manuals`), where("deletedAt", "==", null))
    const unsub = onSnapshot(
      q,
      (snap) => {
        const parsing: TrayEntry[] = []
        const ready: TrayEntry[] = []
        for (const d of snap.docs) {
          const stage: string | null = d.get("parse")?.stage ?? null
          const entry: TrayEntry = {
            manualId: d.id,
            itemUnitId: d.get("itemUnitId") ?? "",
            title: d.get("title") || "Manual",
            pages: (d.get("parse")?.pdfPages as number | undefined) ?? null,
            stage: stage ?? "",
          }
          if (stage && (ACTIVE_PARSE_STAGES as string[]).includes(stage)) parsing.push(entry)
          else if (stage === "done" && d.get("previewDraft") != null) ready.push(entry)
        }
        setTray({ parsing, ready })
      },
      () => {
        // A failed listener must not break the shell; the tray only enriches.
        setTray(EMPTY)
      },
    )
    return unsub
  }, [homeId])

  return tray
}
