import { useCallback, useEffect, useRef, useState } from "react"
import { getRooms } from "@/modules/home"
import { getItemUnit } from "@/modules/items"
import { getTaskTemplatesWithSchedulesByItem, type TaskTemplateWithSchedule } from "@/modules/care"
import { getChunksByItem, getFaqsByItem } from "@/modules/knowledge"
import { track } from "@/lib/analytics"
import type { ChatFaq, ItemUnit, KnowledgeChunk, Room } from "@/integrations/types"
import type { ItemManualsStatus } from "@/hooks/useItemManuals"

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

type Counts = { chunk_count: number; task_count: number; faq_count: number }
type Outcome =
  | { key: string; status: "ready"; error: null; counts: Counts; found: boolean }
  | { key: string; status: "failed"; error: string }

/** One fetch = one key. An outcome only counts for the fetch that produced it,
 *  so a timer or response from an older fetch can never speak for a newer one. */
function loadKey(homeId: string, itemId: string, attempt: number): string {
  return `${homeId}/${itemId}#${attempt}`
}

/** Where the page's live manuals stand (useItemManuals). */
export interface ManualsLoad {
  status: ItemManualsStatus
  count: number
}

const MANUALS_IN: ManualsLoad = { status: "ready", count: 0 }

/**
 * The item page's reads, and the state of them.
 *
 * HH-160: the page used to keep one `error` string for everything. Its 10 s
 * stall timer (HH-148) wrote "The connection dropped before your item arrived."
 * into it and dropped the skeleton; a response that arrived after that never
 * cleared it, so the banner sat over a page that had loaded fine — and while
 * the request was still in flight the page showed the "Could not load this
 * item" dead end. Every "Try again" or task added then refetched by swapping
 * the page for the skeleton and re-armed the timer.
 *
 * Now a stall is "slow" (the skeleton stays, with a retry beside it), the
 * outcome of the CURRENT fetch always wins (a late success clears everything),
 * and a refetch keeps the item on screen: the skeleton is only for an item the
 * page has not shown yet.
 *
 * HH-161: the manuals are no longer one of these reads. They come from a live
 * listener (useItemManuals), and the page is not ready until that listener has
 * answered too — a page drawn before it would say "No upkeep yet — add the
 * manual" for a moment over a manual being read. A listener that is slow is
 * slow here too; one that failed does not hold the page (the page says so).
 */
export function useItemDetailLoad(homeId: string | undefined, itemId: string | undefined, manuals: ManualsLoad = MANUALS_IN) {
  const [item, setItem] = useState<ItemUnit | null>(null)
  const [tasks, setTasks] = useState<TaskTemplateWithSchedule[]>([])
  const [chunks, setChunks] = useState<KnowledgeChunk[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [faqs, setFaqs] = useState<ChatFaq[]>([])
  /** Bumped by reload() — "Try again", or after a task is added. */
  const [attempt, setAttempt] = useState(0)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  /** The fetch that has been in flight longer than LOAD_STALL_MS. */
  const [stalledKey, setStalledKey] = useState<string | null>(null)

  useEffect(() => {
    if (!homeId || !itemId) return
    const key = loadKey(homeId, itemId, attempt)
    let cancelled = false
    // HH-148 (owner, 2026-09-05): "Dishwasher item page isn't loading" — a bare
    // "Loading..." that never resolved, while her console showed dropped QUIC
    // connections. A request that never settles is the case the failure branch
    // below cannot see, so after LOAD_STALL_MS the page says it is slow and
    // offers a retry. It does not give up on this request: if it lands later,
    // it still wins. (It only speaks while the page is not ready — see status.)
    const stall = setTimeout(() => {
      if (!cancelled) setStalledKey(key)
    }, LOAD_STALL_MS)

    Promise.all([
      getItemUnit(homeId, itemId),
      getTaskTemplatesWithSchedulesByItem(homeId, itemId),
      getChunksByItem(homeId, itemId),
      getRooms(homeId),
      getFaqsByItem(homeId, itemId),
    ]).then(
      ([itemRes, tasksRes, chunksRes, roomsRes, faqsRes]) => {
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
        setRooms(roomsRes.data ?? [])
        setFaqs(faqsRes.data ?? [])
        setOutcome({
          key, status: "ready", error: null, found: !!itemRes.data,
          counts: {
            chunk_count: chunksRes.data?.length ?? 0,
            task_count: tasksRes.data?.length ?? 0,
            faq_count: faqsRes.data?.length ?? 0,
          },
        })
      },
      (e: unknown) => {
        // Without this the page hangs on the skeleton forever: on a phone one
        // dropped request is enough, and an endless spinner is
        // indistinguishable from the app just being slow — which is exactly
        // how it was reported. Say so, and let them retry.
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
  // Until the current fetch has an outcome — and the live manuals have
  // answered — it is loading, including the render right after a reload or a
  // move to another item, before its effect has run. Deriving it here is what
  // keeps an older outcome from leaking.
  const reads = outcome && outcome.key === current ? outcome : null
  const status: ItemLoadStatus =
    reads?.status === "failed"
      ? "failed"
      : reads?.status === "ready" && manuals.status !== "loading"
        ? "ready"
        : current !== null && stalledKey === current ? "slow" : "loading"
  const loadError = reads?.status === "failed" ? reads.error : null
  // The item this page has SHOWN — reached "ready" for, not merely read: with
  // the reads back and the live manuals not, the item is in state but the page
  // must still hold its skeleton, or it draws Upkeep before it knows the manual.
  const [shownFor, setShownFor] = useState<string | null>(null)
  // Recorded while rendering (React's "information from previous renders"
  // pattern), guarded so it settles in one pass — not in an effect, which
  // would paint one frame with the skeleton back.
  if (status === "ready" && item && itemId && item.item_unit_id === itemId && shownFor !== itemId) setShownFor(itemId)
  /** The page already shows THIS item — a refetch must not take it away. */
  const showingItem = !!item && item.item_unit_id === itemId && (status === "ready" || shownFor === itemId)

  // AHA-candidate funnel event: the user is looking at an item's content.
  // Props let analysis distinguish "opened an empty item" from "saw parsed
  // manual/care content" without a second event. Once per fetch, as before.
  const tracked = useRef<string | null>(null)
  const manualCount = manuals.count
  useEffect(() => {
    if (status !== "ready" || reads?.status !== "ready" || !reads.found || !current || tracked.current === current) return
    tracked.current = current
    track("item_content_viewed", {
      home_id: homeId,
      item_id: itemId,
      ...reads.counts,
      manual_count: manualCount,
    })
  }, [status, reads, current, homeId, itemId, manualCount])

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
    rooms, setRooms,
    faqs, setFaqs,
  }
}
