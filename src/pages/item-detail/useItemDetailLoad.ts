import { useCallback, useEffect, useState } from "react"
import { getRooms } from "@/modules/home"
import { getItemUnit } from "@/modules/items"
import { getTaskTemplatesWithSchedulesByItem, type TaskTemplateWithSchedule } from "@/modules/care"
import { getChunksByItem, getFaqsByItem, getManualsByItem } from "@/modules/knowledge"
import { resolveManualUrl } from "@/hooks/useManualManagement"
import { track } from "@/lib/analytics"
import type { ChatFaq, ItemUnit, KnowledgeChunk, ManualDocument, Room } from "@/integrations/types"

/** How long the item page waits before it says the load is slow and offers a retry. */
export const LOAD_STALL_MS = 10_000

/**
 * Where the item page's own load stands. Kept apart from the errors an ACTION
 * on the page produces (a failed delete, room or category change): those live
 * in the page's actionError, and neither may speak for the other.
 *
 * - loading: the reads for this item are in flight
 * - slow:    still in flight after LOAD_STALL_MS. Said out loud, with a retry,
 *            but NOT a failure — a slow connection is not a dropped one (HH-160)
 * - ready:   the reads came back. The item may still be null: "not found"
 * - failed:  the reads failed
 */
export type ItemLoadStatus = "loading" | "slow" | "ready" | "failed"

type Outcome = { key: string; status: Exclude<ItemLoadStatus, "loading">; error: string | null }

/** One fetch = one key. An outcome only counts for the fetch that produced it,
 *  so a timer or response from an older fetch can never speak for a newer one. */
function loadKey(homeId: string, itemId: string, attempt: number): string {
  return `${homeId}/${itemId}#${attempt}`
}

/**
 * The item page's six reads, and the state of them.
 *
 * HH-160: the page used to keep one `error` string for everything. Its 10 s
 * stall timer (HH-148) wrote "The connection dropped before your item arrived."
 * into it and dropped the skeleton; a response that arrived after that never
 * cleared it, so the banner sat over a page that had loaded fine — and while
 * the request was still in flight the page showed the "Could not load this
 * item" dead end. Every "Try again" or task added then refetched by swapping
 * the page for the skeleton and re-arming the timer.
 *
 * Now a stall is "slow" (the skeleton stays, with a retry beside it), the
 * outcome of the CURRENT fetch always wins (a late success clears everything),
 * and a refetch keeps the item on screen: the skeleton is only for an item the
 * page has not shown yet.
 */
export function useItemDetailLoad(homeId: string | undefined, itemId: string | undefined) {
  const [item, setItem] = useState<ItemUnit | null>(null)
  const [tasks, setTasks] = useState<TaskTemplateWithSchedule[]>([])
  const [chunks, setChunks] = useState<KnowledgeChunk[]>([])
  const [manuals, setManuals] = useState<ManualDocument[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [faqs, setFaqs] = useState<ChatFaq[]>([])
  const [manualPdfUrl, setManualPdfUrl] = useState<string | null>(null)
  /** Bumped by reload() — "Try again", or after a task is added. */
  const [attempt, setAttempt] = useState(0)
  const [outcome, setOutcome] = useState<Outcome | null>(null)

  useEffect(() => {
    if (!homeId || !itemId) return
    const key = loadKey(homeId, itemId, attempt)
    let cancelled = false
    // HH-148 (owner, 2026-09-05): "Dishwasher item page isn't loading" — a bare
    // "Loading..." that never resolved, while her console showed dropped QUIC
    // connections. A request that never settles is the case the failure branch
    // below cannot see, so after LOAD_STALL_MS the page says it is slow and
    // offers a retry. It does not give up on this request: if it lands later,
    // it still wins.
    const stall = setTimeout(() => {
      if (!cancelled) setOutcome({ key, status: "slow", error: null })
    }, LOAD_STALL_MS)

    Promise.all([
      getItemUnit(homeId, itemId),
      getTaskTemplatesWithSchedulesByItem(homeId, itemId),
      getChunksByItem(homeId, itemId),
      getManualsByItem(homeId, itemId),
      getRooms(homeId),
      getFaqsByItem(homeId, itemId),
    ]).then(
      async ([itemRes, tasksRes, chunksRes, manualsRes, roomsRes, faqsRes]) => {
        clearTimeout(stall)
        if (cancelled) return
        // The services report a failed read as `{ data: null, error }` rather
        // than rejecting. For the item itself that is a failed LOAD, not an
        // item that does not exist — "Item not found · This item may have been
        // removed" is not something to say about a dropped connection.
        if (itemRes.error) {
          setOutcome({ key, status: "failed", error: itemRes.error.message })
          return
        }
        setItem(itemRes.data ?? null)
        setTasks(tasksRes.data ?? [])
        setChunks(chunksRes.data ?? [])
        setManuals(manualsRes.data ?? [])
        setRooms(roomsRes.data ?? [])
        setFaqs(faqsRes.data ?? [])
        setOutcome({ key, status: "ready", error: null })

        // AHA-candidate funnel event: the user is looking at an item's content.
        // Props let analysis distinguish "opened an empty item" from "saw parsed
        // manual/care content" without a second event.
        if (itemRes.data) {
          track("item_content_viewed", {
            home_id: homeId,
            item_id: itemId,
            chunk_count: chunksRes.data?.length ?? 0,
            manual_count: manualsRes.data?.length ?? 0,
            task_count: tasksRes.data?.length ?? 0,
            faq_count: faqsRes.data?.length ?? 0,
          })
        }

        // Resolve the PDF URL for "See page X" links.
        const firstManual = (manualsRes.data ?? [])[0]
        if (firstManual) {
          const url = await resolveManualUrl(firstManual.source_type, firstManual.source_ref).catch(() => null)
          if (url && !cancelled) setManualPdfUrl(url)
        }
      },
      (e: unknown) => {
        // Without this the page hangs on the skeleton forever: on a phone one
        // dropped request is enough, and an endless spinner is
        // indistinguishable from the app just being slow — which is exactly
        // how it was reported. Say so, and let them retry.
        clearTimeout(stall)
        if (cancelled) return
        setOutcome({ key, status: "failed", error: e instanceof Error ? e.message : "Could not load this item." })
      },
    )

    return () => {
      cancelled = true
      clearTimeout(stall)
    }
  }, [homeId, itemId, attempt])

  const reload = useCallback(() => setAttempt((n) => n + 1), [])

  const current = homeId && itemId ? loadKey(homeId, itemId, attempt) : null
  // Until the current fetch has an outcome, it is loading — including the
  // render right after a reload or a move to another item, before its effect
  // has run. Deriving it here is what keeps an older outcome from leaking.
  const status: ItemLoadStatus = outcome && outcome.key === current ? outcome.status : "loading"
  const loadError = outcome && outcome.key === current ? outcome.error : null
  /** The page already shows THIS item — a refetch must not take it away. */
  const showingItem = !!item && item.item_unit_id === itemId

  return {
    status,
    loadError,
    /** Skeleton only for an item the page has not shown yet. */
    showSkeleton: (status === "loading" || status === "slow") && !showingItem,
    /** The dead end: this item failed to load and there is nothing to show. */
    showDeadEnd: status === "failed" && !showingItem,
    reload,
    item, setItem,
    tasks, setTasks,
    chunks, setChunks,
    manuals, setManuals,
    rooms, setRooms,
    faqs, setFaqs,
    manualPdfUrl,
  }
}
