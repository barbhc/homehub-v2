/**
 * The collections one Home load needs — each read ONCE per revalidation and
 * handed to every derivation that uses it (dashboard.ts, cleanSession.ts).
 *
 * Audit 2026-09-29 (B, Part 1): one Home load read `items` five times,
 * `taskInstances` five times — three of them every instance the home ever had,
 * done history included — and `taskTemplates` twice. Done history grows with
 * every check-off, so Home got more expensive the longer someone used the app.
 * Pinned by src/lib/dashboardReads.test.ts.
 *
 * Now one load reads: items once, the OPEN instances once, the last
 * DONE_HISTORY_DAYS of completions once, and (extras only) templates once.
 */
import { collection, getDocs, query, where, Timestamp, type DocumentData } from "firebase/firestore"
import { db } from "@/integrations/firebase"
// An offline cache-miss is a failure, never an empty home — see the helper.
import { assertServed } from "@/lib/assertServed"

/** A document as the derivations see it: its id and its data, nothing else. */
export type ReadDoc = { id: string; data: DocumentData }

export interface HomeReads {
  /** Items with `deletedAt == null` — any status (Home counts only active ones; warranties and notices list all). */
  items: ReadDoc[]
  /** Open instances: status scheduled or snoozed, `deletedAt == null`. Document-id order, as before. */
  live: ReadDoc[]
  /**
   * Instances with status `done` completed on or after doneHistoryCutoff().
   * Soft-deleted ones are INCLUDED: the dashboard never counted them and the
   * cleaning ranking always did, so each consumer keeps applying its own rule.
   */
  recentDone: ReadDoc[]
}

/**
 * How far back Home looks at completions. Everything Home RENDERS from done
 * history is exact inside this window:
 *  · completedThisMonth counts completions since the 1st (≤ 31 days back);
 *  · the deep-clean guide ranking caps staleness at 90 days (computeCleanScore),
 *    so "last done 91+ days ago" already scores the same as "never done".
 * `DashboardTask.neverCompleted` and `DashboardTasksResult.suggested` look back
 * this far too — neither is rendered anywhere (see their docs).
 */
export const DONE_HISTORY_DAYS = 90

/** UTC midnight, DONE_HISTORY_DAYS before today's UTC date (cleanSession's "today"). */
export function doneHistoryCutoff(now: Date = new Date()): Timestamp {
  const day = new Date(`${now.toISOString().slice(0, 10)}T00:00:00Z`)
  day.setUTCDate(day.getUTCDate() - DONE_HISTORY_DAYS)
  return Timestamp.fromDate(day)
}

const toReadDocs = (snap: { docs: Array<{ id: string; data(): DocumentData }> }): ReadDoc[] =>
  snap.docs.map((d) => ({ id: d.id, data: d.data() }))

/** The three reads every Home load makes. Rejects when any one fails. */
export async function readHomeCollections(homeId: string): Promise<HomeReads> {
  const [itemsSnap, live, recentDone] = await Promise.all([
    getDocs(query(collection(db, `homes/${homeId}/items`), where("deletedAt", "==", null))),
    readOpenInstances(homeId),
    readRecentDone(homeId),
  ])
  assertServed(itemsSnap, "home")
  return { items: toReadDocs(itemsSnap), live, recentDone }
}

/** Open instances — see HomeReads.live. */
export async function readOpenInstances(homeId: string): Promise<ReadDoc[]> {
  // Two equality-class filters (status in / deletedAt ==) use single-field
  // indexes — no composite. getItemUnits runs the same shape in production.
  const snap = await getDocs(
    query(
      collection(db, `homes/${homeId}/taskInstances`),
      where("status", "in", ["scheduled", "snoozed"]),
      where("deletedAt", "==", null),
    ),
  )
  return toReadDocs(snap)
}

/** Completions since doneHistoryCutoff() — see HomeReads.recentDone. */
export async function readRecentDone(homeId: string): Promise<ReadDoc[]> {
  // A single-field range, so no composite index. Only completed rows carry a
  // completedAt — except one a later edit set back to scheduled, hence the filter.
  const snap = await getDocs(
    query(collection(db, `homes/${homeId}/taskInstances`), where("completedAt", ">=", doneHistoryCutoff())),
  )
  return toReadDocs(snap).filter((d) => d.data.status === "done")
}

/** Every task template, deleted ones included — a live instance still takes minutes and a description from one. */
export async function readTaskTemplates(homeId: string): Promise<ReadDoc[]> {
  return toReadDocs(await getDocs(collection(db, `homes/${homeId}/taskTemplates`)))
}

const inRound = new Map<string, Promise<HomeReads>>()

/**
 * The reads for the current revalidation ROUND, shared by Home's two SWR keys.
 *
 * SWR revalidates `dashboard:core` and `dashboard:extras` together — on mount,
 * focus and reconnect, and in refresh() — and starts both fetchers in the same
 * task (on mount with a warm snapshot it defers both to the same animation
 * frame). The first caller starts the reads; the other gets the same promise.
 *
 * The slot is dropped on the next macrotask (or as soon as the reads settle),
 * so a LATER round — above all the refetch after a check-off — can never be
 * handed reads that were already in flight before its write landed.
 */
export function homeReadsForThisRound(homeId: string): Promise<HomeReads> {
  const pending = inRound.get(homeId)
  if (pending) return pending
  const reads = readHomeCollections(homeId)
  inRound.set(homeId, reads)
  const forget = () => {
    if (inRound.get(homeId) === reads) inRound.delete(homeId)
  }
  setTimeout(forget, 0)
  // Also on settle; the rejection itself still reaches every caller.
  reads.then(forget, forget)
  return reads
}
