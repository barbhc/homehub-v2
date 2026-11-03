// ── Why a task row is leaving, or coming back ────────────────────────────────
// A row's data and its animation are decoupled on purpose: Done/Snooze take the
// task off the list at once (useTaskActions — the optimistic update, its error
// path and rollback are unchanged), and the row animates out AFTER it has left
// the data, kept on screen by <AnimatePresence> until its exit finishes.
//
// So the exit needs to know what the person did — tick (leave right), Snooze
// (leave left), a swipe (keep travelling the way the finger threw it) — while
// a row that leaves for any OTHER reason (a filter, a lens switch, a refetch)
// simply goes. The row records the intent here as it calls onDone/onSnooze;
// its exit reads it. Ids are task-instance ids, unique per task.
//
// The Tasks page mounts a phone and a desktop tree at once (CSS hides one), so
// an intent is PEEKED, never consumed: both trees' rows read it, and the
// hidden one, having no layout, just leaves. Intents expire, and are cancelled
// when the write fails or the row comes back.

export type LeaveKind = "tick" | "button" | "swipe"
export type LeaveIntent = { dir: 1 | -1; kind: LeaveKind; at: number }

/** Long enough for a slow Snooze write to land; short enough that a stale intent never animates a filter change. */
const LEAVE_TTL_MS = 15_000
/** An Undo'd Snooze comes back on the agenda's refetch, so the return waits that long. */
const RETURN_TTL_MS = 10_000

const leaving = new Map<string, LeaveIntent>()
const returning = new Map<string, number>()

export function markLeaving(id: string, dir: 1 | -1, kind: LeaveKind): void {
  leaving.set(id, { dir, kind, at: Date.now() })
}

export function cancelLeaving(id: string): void {
  leaving.delete(id)
}

export function peekLeaving(id: string): LeaveIntent | null {
  const i = leaving.get(id)
  if (!i) return null
  if (Date.now() - i.at > LEAVE_TTL_MS) {
    leaving.delete(id)
    return null
  }
  return i
}

/** The row is on its way back (Undo, or a write that failed): it grows back in rather than appearing. */
export function markReturning(id: string): void {
  returning.set(id, Date.now())
  leaving.delete(id)
}

/** Consumed by the first row that can show it (the tree on screen). */
export function takeReturning(id: string): boolean {
  const at = returning.get(id)
  if (at === undefined) return false
  returning.delete(id)
  return Date.now() - at <= RETURN_TTL_MS
}

/** Tests only. */
export function resetRowIntentsForTests(): void {
  leaving.clear()
  returning.clear()
}
