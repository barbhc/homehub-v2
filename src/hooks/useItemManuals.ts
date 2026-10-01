/**
 * The item page's manuals, LIVE — the one source of truth for where each
 * manual's read stands (HH-161).
 *
 * The page used to read its manuals once, on load, and then patch that copy by
 * hand: a manual added in this session was prepended with `parse_stage: null`
 * and never heard from again, so Upkeep said "No upkeep yet — add the manual"
 * and offered the button under a band saying the manual was being read. The
 * pickup card kept its own watch per manual, the tray its own home-wide one,
 * and the three disagreed (audit 2026-09-29, A-bugfixes HH-161).
 *
 * Now the page listens to the documents the worker writes. Every write — the
 * record created, the read queued, each stage, the draft, Save — arrives here,
 * so nothing is patched locally, and a manual can appear once however many
 * times it is re-added (the listener has one row per document).
 *
 * `watched` answers HH-48's question — did THIS page see this read run? — from
 * what the listener observed: a manual whose CURRENT read (by requestId) was
 * seen in an active stage. A read that finished while nobody was looking, or a
 * different run of the same manual that was never seen running, is not
 * watched, and its review waits for a tap instead of opening by itself.
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { collection, onSnapshot, query, where } from "firebase/firestore"
import { db } from "@/integrations/firebase"
import { toManual } from "@/modules/knowledge/services/manualDocumentService"
import { isReading } from "@/lib/manualReviewState"
import type { ManualDocument } from "@/integrations/types"

export type ItemManualsStatus = "loading" | "ready" | "failed"

export interface ItemManuals {
  /** Newest first, deleted ones left out. */
  manuals: ManualDocument[]
  /** "ready" once the SERVER has answered — a cached "nothing" is not an
   *  answer (an empty result from cache drove a duplicate home once). */
  status: ItemManualsStatus
  error: string | null
  /** Manuals whose current read this page watched run. */
  watched: ReadonlySet<string>
  /** Listen afresh — only meaningful after the listener failed; a live
   *  listener already has everything, so a page refetch never calls this. */
  retry: () => void
}

type Loaded = { key: string; manuals: ManualDocument[]; status: ItemManualsStatus; error: string | null; watched: ReadonlySet<string> }

const NONE: ReadonlySet<string> = new Set()

const newestFirst = (a: ManualDocument, b: ManualDocument) => (b.created_at ?? "").localeCompare(a.created_at ?? "")

/**
 * Which manuals' current read was seen running, given what has been seen so far
 * (`seen`: manual id → the requestId last observed in an active stage, updated
 * in place). Pure apart from that map, so the rule can be tested on its own.
 */
export function observeRuns(seen: Map<string, string>, manuals: ManualDocument[]): Set<string> {
  const watched = new Set<string>()
  for (const m of manuals) {
    if (isReading(m) && m.parse_request_id) seen.set(m.manual_id, m.parse_request_id)
    const run = seen.get(m.manual_id)
    if (run && run === m.parse_request_id) watched.add(m.manual_id)
  }
  return watched
}

const sameSet = (a: ReadonlySet<string>, b: ReadonlySet<string>) =>
  a.size === b.size && [...a].every((x) => b.has(x))

export function useItemManuals(homeId: string | undefined, itemUnitId: string | undefined): ItemManuals {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [attempt, setAttempt] = useState(0)
  const retry = useCallback(() => setAttempt((n) => n + 1), [])
  const seen = useRef(new Map<string, string>())

  useEffect(() => {
    if (!homeId || !itemUnitId) return
    const key = `${homeId}/${itemUnitId}#${attempt}`
    // A different item (or a fresh listen) starts with nothing watched.
    seen.current = new Map()
    let serverAnswered = false
    const unsub = onSnapshot(
      query(collection(db, `homes/${homeId}/manuals`), where("itemUnitId", "==", itemUnitId)),
      // Metadata changes too, so the moment the cache's answer is confirmed by
      // the server is an event even when no document changed.
      { includeMetadataChanges: true },
      (snap) => {
        if (!snap.metadata.fromCache) serverAnswered = true
        // Until the server has answered, a cached snapshot is at best part of
        // the answer (it holds only what other listeners happened to fetch).
        if (!serverAnswered) return
        const manuals = snap.docs
          .filter((d) => d.get("deletedAt") == null)
          .map((d) => toManual(d.id, d.data()))
          .sort(newestFirst)
        const watched = observeRuns(seen.current, manuals)
        setLoaded((prev) => ({
          key,
          manuals,
          status: "ready",
          error: null,
          // Keep the old set's identity when nothing changed, so effects keyed
          // on it do not re-run on every stage write.
          watched: prev && prev.key === key && sameSet(prev.watched, watched) ? prev.watched : watched,
        }))
      },
      (e) => {
        // Said, not swallowed: the page shows a note and the rest of the item.
        console.error(`[item-manuals] listener failed for ${homeId}/${itemUnitId}:`, e.message)
        setLoaded({ key, manuals: [], status: "failed", error: e.message, watched: NONE })
      },
    )
    return unsub
  }, [homeId, itemUnitId, attempt])

  const current = homeId && itemUnitId ? `${homeId}/${itemUnitId}#${attempt}` : null
  // A listener for a different item (or an older attempt) never speaks for
  // this one — the same rule the page's own load keeps (HH-160).
  if (!loaded || loaded.key !== current) return { manuals: [], status: "loading", error: null, watched: NONE, retry }
  return { manuals: loaded.manuals, status: loaded.status, error: loaded.error, watched: loaded.watched, retry }
}
