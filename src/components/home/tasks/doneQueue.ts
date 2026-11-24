/**
 * Dones that have been TAPPED but not yet WRITTEN — one store for the whole app,
 * kept in localStorage from the moment of the tap.
 *
 * A Done from a list shows "Done · next due … · Undo" and is only written when
 * that bar goes (useTaskActions). Kept per screen, two paths lost a Done after
 * its receipt had said it was done (gate review of #246):
 *  · leave the screen inside the window while offline — the write is refused
 *    with nobody left to say so;
 *  · swipe the app away inside the window — the write never finishes (or never
 *    starts: iOS fires no pagehide on backgrounding).
 * So every tapped Done lands here, and here — and on disk — it stays until it
 * is written, undone, or the person has been told it failed:
 *  · a Done whose screen is gone is written by the next screen that mounts
 *    useTaskActions (on the next app start, that is Home);
 *  · a write refused with no row to say it on stays as `failed`, and every
 *    mounted useTaskActions shows it — "Couldn't mark X done" with Try again —
 *    until it lands or the person dismisses it.
 *
 * Every entry is stamped with the signed-in user (and its home), and belongs
 * to that account alone: only that user's session ever shows it or writes it.
 * Sign-out does NOT erase it (Codex review D6). It used to — after trying for
 * three seconds — so a Done tapped offline and followed by a sign-out was
 * lost, receipt and all. An unsent Done now stays on this device, keyed by
 * account, and is sent at THAT account's next sign-in (writeUnheldDones, from
 * the first screen that mounts). Under any other sign-in, or none, it is
 * invisible and inert.
 *
 * A refusal that will never succeed — the task is gone, the person is no
 * longer in the home — is terminal: logged with its ids and dropped, not
 * offered as Try again forever.
 */
import { auth } from "@/integrations/firebase"
import { markTaskInstanceDone } from "@/modules/care"
import { localToday } from "../../../../shared/dates/calendar"

export interface QueuedDone {
  /** Who tapped it. Only that user's session ever shows or writes it. */
  uid: string
  homeId: string
  /** The task instance. */
  id: string
  /** The task's title, for the failure line on a screen that has no row for it. */
  label: string | null
  /** The day it was tapped — written as the completion day, whenever the write lands. */
  completedOn: string
  /** The date the receipt named (previewNextDue), written as the override. */
  nextDue: string | null
  /** "pending": not written yet. "failed": a write was refused and no row is showing it. */
  state: "pending" | "failed"
  /** The service's error from the last refused write — for the log and the date refusal. */
  error: string | null
}

export type DoneWrite = { success: boolean; error?: string; /** Refused for good — dropped, not retried. */ terminal?: boolean }

const STORAGE_KEY = "hh:pending-dones:v1"
const YMD = /^\d{4}-\d{2}-\d{2}$/

const entries = new Map<string, QueuedDone>()
/** Held by a mounted screen's Undo window: not for anyone else to write yet. Never persisted. */
const owned = new Set<string>()
const inFlight = new Map<string, Promise<DoneWrite>>()
const listeners = new Set<() => void>()
let loaded = false
let failedSnapshot: QueuedDone[] = []
/** Whose snapshot that is: one taken for another account is never handed out. */
let snapshotUid = ""

/** The signed-in user; "" when nobody is (nothing is shown or written for them then). */
const currentUid = (): string => auth.currentUser?.uid ?? ""
/** Keyed by ACCOUNT as well as task: two people sharing a device (and a home)
 *  can each leave a Done for the same task without one replacing the other. */
const keyFor = (uid: string, homeId: string, id: string) => `${uid}/${homeId}/${id}`
/** The signed-in user's key for a task — every caller acts for that user only. */
const keyOf = (homeId: string, id: string) => keyFor(currentUid(), homeId, id)

/**
 * Refusals that no retry can fix: the instance is gone, or the caller is not a
 * member of the home (any more). completeTask says these in these words
 * (completeTask.ts: "Task instance not found", "Not a member of this home.").
 */
export function isTerminalDoneError(error: string | null | undefined): boolean {
  return typeof error === "string" && /not found|not a member|permission[- ]denied|missing or insufficient permissions/i.test(error)
}
const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** One stored entry, checked field by field — what comes off disk is never trusted as typed. */
function parseEntry(v: unknown): QueuedDone | null {
  if (!v || typeof v !== "object") return null
  const r = v as Record<string, unknown>
  const text = (x: unknown) => (typeof x === "string" && x ? x : null)
  const uid = typeof r.uid === "string" ? r.uid : null
  const homeId = text(r.homeId), id = text(r.id), completedOn = text(r.completedOn)
  if (uid === null || !homeId || !id || !completedOn || !YMD.test(completedOn)) return null
  const nextDue = text(r.nextDue)
  return {
    uid, homeId, id, completedOn,
    label: text(r.label),
    nextDue: nextDue && YMD.test(nextDue) ? nextDue : null,
    state: r.state === "failed" ? "failed" : "pending",
    error: text(r.error),
  }
}

function load() {
  if (loaded) return
  loaded = true
  let raw: string | null
  try {
    raw = localStorage.getItem(STORAGE_KEY)
  } catch (e) {
    console.warn("[done queue] could not read Dones saved from last time:", message(e))
    return
  }
  if (!raw) return
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (e) {
    console.warn("[done queue] Dones saved from last time are unreadable; dropping them:", message(e), raw.slice(0, 200))
    return
  }
  if (!Array.isArray(parsed)) return
  for (const v of parsed) {
    const entry = parseEntry(v)
    // Every account's entries are kept; each is only ever read by its own key.
    if (entry) entries.set(keyFor(entry.uid, entry.homeId, entry.id), entry)
  }
  refreshSnapshot()
}

function persist() {
  try {
    if (entries.size === 0) localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, JSON.stringify([...entries.values()]))
  } catch (e) {
    // Private mode / full storage: the Done still lives in memory for this
    // session; only an app kill inside the window could lose it now.
    console.warn("[done queue] could not save pending Dones to this device:", message(e))
  }
}

function refreshSnapshot() {
  const uid = currentUid()
  snapshotUid = uid
  failedSnapshot = [...entries.values()].filter((e) => e.state === "failed" && e.uid === uid)
}

function changed() {
  persist()
  refreshSnapshot()
  for (const fn of listeners) fn()
}

export function subscribeDoneQueue(fn: () => void): () => void {
  load()
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** Dones refused with no row to show it on. A stable array between changes (useSyncExternalStore). */
export function failedDones(): QueuedDone[] {
  load()
  // Taken under another sign-in (or none): rebuilt NOW, before anything
  // renders it — never one paint of the last account's task.
  if (snapshotUid !== currentUid()) refreshSnapshot()
  return failedSnapshot
}

/** A Done was tapped: on disk now, held by the tapping screen's Undo window. */
export function queueDone(d: { homeId: string; id: string; label: string | null; completedOn: string }) {
  load()
  const key = keyOf(d.homeId, d.id)
  entries.set(key, { ...d, uid: currentUid(), nextDue: null, state: "pending", error: null })
  owned.add(key)
  changed()
}

export function setQueuedNextDue(homeId: string, id: string, nextDue: string | null) {
  const e = entries.get(keyOf(homeId, id))
  if (!e) return
  e.nextDue = nextDue
  changed()
}

/** Undo, or the failure is now said on the task's own row (which offers Mark done again). */
export function forgetDone(homeId: string, id: string) {
  const key = keyOf(homeId, id)
  owned.delete(key)
  if (entries.delete(key)) changed()
}

/**
 * Write one queued Done. Concurrent calls share one write. On success the entry
 * is gone; on refusal it stays, as `failed`, until someone tells the person.
 */
export function writeDone(homeId: string, id: string): Promise<DoneWrite> {
  load()
  const key = keyOf(homeId, id)
  owned.delete(key)
  const running = inFlight.get(key)
  if (running) return running
  // The key carries the signed-in account, so another account's Done for the
  // same task is simply not found here: never written under this sign-in.
  const e = entries.get(key)
  if (!e) return Promise.resolve({ success: true })
  const p = (async (): Promise<DoneWrite> => {
    let res: DoneWrite
    try {
      res = await markTaskInstanceDone(e.homeId, e.id, null, {
        completedOn: e.completedOn,
        // A Done carried over from an earlier day is written on the day it was
        // tapped; the server allows that only when it is marked as backdated.
        backdated: e.completedOn < localToday(),
        nextDueOverride: e.nextDue,
      })
    } catch (err) {
      res = { success: false, error: message(err) }
    }
    if (res.success) {
      entries.delete(key)
    } else if (currentUid() !== e.uid) {
      // The account signed out while this was on its way. Whatever it was
      // refused with may be the sign-out's own doing ("permission-denied" for
      // a session that just ended), so it is neither dropped nor called
      // failed: it waits, unsent, for that account's next sign-in.
      console.warn(`[done queue] task ${e.id} (home ${e.homeId}) was not marked done before its account signed out; keeping it for their next sign-in:`, res.error)
      entries.set(key, { ...e, state: "pending", error: res.error ?? null })
    } else if (isTerminalDoneError(res.error)) {
      console.warn(`[done queue] dropping a Done that can never be written — task ${e.id} (home ${e.homeId}):`, res.error)
      entries.delete(key)
      res = { ...res, terminal: true }
    } else {
      entries.set(key, { ...e, state: "failed", error: res.error ?? null })
    }
    changed()
    return res
  })()
  inFlight.set(key, p)
  void p.finally(() => inFlight.delete(key))
  return p
}

/** Write every Done no screen is holding: left over from a screen that is gone, or from the last app run. */
export function writeUnheldDones() {
  load()
  const uid = currentUid()
  // Re-reads the snapshot for THIS user: it may have been taken before
  // sign-in resolved, when no entry was anyone's.
  changed()
  for (const [key, e] of entries) {
    // Only this account's: a Done another account left here waits for them.
    if (e.uid === uid && e.state === "pending" && !owned.has(key) && !inFlight.has(key)) {
      void writeDone(e.homeId, e.id).then((r) => {
        if (!r.success) console.warn(`[done queue] could not mark task done ${e.id} (home ${e.homeId}):`, r.error)
      })
    }
  }
}

/**
 * Sign-out, first half: write every Done the leaving user has not yet written
 * — those in an Undo window included (they said "Done") — while they are still
 * signed in. Bounded by `timeoutMs` so sign-out never hangs. A write that
 * fails or runs out of time is logged and KEPT (parkDoneQueue): it is sent at
 * that account's next sign-in.
 */
export async function writeAllDonesNow(timeoutMs = 3000): Promise<void> {
  load()
  const uid = currentUid()
  const mine = [...entries.values()].filter((e) => e.uid === uid && e.state === "pending")
  if (mine.length === 0) return
  const writes = Promise.all(
    mine.map((e) =>
      writeDone(e.homeId, e.id).then((r) => {
        if (!r.success) console.warn(`[done queue] signing out: could not mark task done ${e.id} (home ${e.homeId}):`, r.error)
      }),
    ),
  )
  let timer: number | undefined
  const timedOut = new Promise<"timeout">((r) => {
    timer = window.setTimeout(() => r("timeout"), timeoutMs)
  })
  const outcome = await Promise.race([writes.then(() => "done" as const), timedOut])
  window.clearTimeout(timer)
  if (outcome === "timeout") console.warn(`[done queue] signing out: ${mine.length} Done(s) still being written after ${timeoutMs}ms`)
}

/**
 * Sign-out, second half: leave the departing account's unsent Dones on this
 * device for its next sign-in, and take them out of play until then.
 *
 * Nothing is erased (Codex review D6). No screen holds an Undo window any
 * more, and a Done that had been refused on screen goes back to waiting — the
 * next sign-in sends it rather than leaving it for a tap on "Try again" that
 * nobody may be shown. The next account sees none of it: every read and every
 * write is by the signed-in account's own key (failedDones, writeDone).
 *
 * Call it while the leaving user is still signed in.
 */
export function parkDoneQueue() {
  load()
  const uid = currentUid()
  owned.clear()
  for (const [key, e] of entries) {
    if (e.uid === uid && e.state === "failed") entries.set(key, { ...e, state: "pending" })
  }
  changed()
}

/** Tests only: forget everything in memory (disk is the test's to set). */
export function resetDoneQueueForTests() {
  entries.clear()
  owned.clear()
  inFlight.clear()
  listeners.clear()
  loaded = false
  failedSnapshot = []
  snapshotUid = ""
}
