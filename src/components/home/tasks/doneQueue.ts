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
 */
import { markTaskInstanceDone } from "@/modules/care"
import { localToday } from "../../../../shared/dates/calendar"

export interface QueuedDone {
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

export type DoneWrite = { success: boolean; error?: string }

const STORAGE_KEY = "hh:pending-dones:v1"
const YMD = /^\d{4}-\d{2}-\d{2}$/

const entries = new Map<string, QueuedDone>()
/** Held by a mounted screen's Undo window: not for anyone else to write yet. Never persisted. */
const owned = new Set<string>()
const inFlight = new Map<string, Promise<DoneWrite>>()
const listeners = new Set<() => void>()
let loaded = false
let failedSnapshot: QueuedDone[] = []

const keyOf = (homeId: string, id: string) => `${homeId}/${id}`
const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** One stored entry, checked field by field — what comes off disk is never trusted as typed. */
function parseEntry(v: unknown): QueuedDone | null {
  if (!v || typeof v !== "object") return null
  const r = v as Record<string, unknown>
  const text = (x: unknown) => (typeof x === "string" && x ? x : null)
  const homeId = text(r.homeId), id = text(r.id), completedOn = text(r.completedOn)
  if (!homeId || !id || !completedOn || !YMD.test(completedOn)) return null
  const nextDue = text(r.nextDue)
  return {
    homeId, id, completedOn,
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
    if (entry) entries.set(keyOf(entry.homeId, entry.id), entry)
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
  failedSnapshot = [...entries.values()].filter((e) => e.state === "failed")
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
  return failedSnapshot
}

/** A Done was tapped: on disk now, held by the tapping screen's Undo window. */
export function queueDone(d: { homeId: string; id: string; label: string | null; completedOn: string }) {
  load()
  const key = keyOf(d.homeId, d.id)
  entries.set(key, { ...d, nextDue: null, state: "pending", error: null })
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
    if (res.success) entries.delete(key)
    else entries.set(key, { ...e, state: "failed", error: res.error ?? null })
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
  for (const [key, e] of entries) {
    if (e.state === "pending" && !owned.has(key) && !inFlight.has(key)) {
      void writeDone(e.homeId, e.id).then((r) => {
        if (!r.success) console.warn(`[done queue] could not mark task done ${e.id} (home ${e.homeId}):`, r.error)
      })
    }
  }
}

/** Tests only: forget everything in memory (disk is the test's to set). */
export function resetDoneQueueForTests() {
  entries.clear()
  owned.clear()
  inFlight.clear()
  listeners.clear()
  loaded = false
  failedSnapshot = []
}
