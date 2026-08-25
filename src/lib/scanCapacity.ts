/**
 * What happens when a scan hits the daily AI ceiling.
 *
 * HH-124 (owner): "I received this AI limit, which is a terrible experience…
 * figure out a backup plan when I hit an AI limit. And at the very least the
 * messaging should be better, something along the lines that the user should
 * come back and when there is more AI capacity, [it] will scan it."
 *
 * Three things were wrong with what she saw:
 *
 *  1. It rendered in the destructive/red style — an error she had caused. A
 *     ceiling WE set is not that, and this product does not do alarm-red.
 *  2. It said "It resets at midnight UTC", which is our clock, not hers.
 *  3. "Try again" sat underneath, and would have failed identically. A dead
 *     end wearing a button.
 *
 * The copy lives here rather than being taken from the server's error text on
 * purpose: the server's wording can only change with a functions deploy, and
 * what the user reads should not be gated on that. The server still refuses;
 * the client decides how that reads.
 */

/**
 * Is this refusal the daily ceiling, rather than a real failure?
 *
 * Matched on the shape of the message because the callable's error CODE does
 * not survive the client SDK intact for every transport. Deliberately narrow:
 * a genuine parse error must never be dressed up as "we'll do it later", or we
 * would promise a scan that never comes.
 */
export function isCapacityRefusal(message: string | null | undefined): boolean {
  if (!message) return false
  const m = message.toLowerCase()
  const ceiling = /daily ai limit|monthly ai budget|resource[- ]exhausted|too many requests/.test(m)
  return ceiling
}

/** App-wide budget rather than this user's day — worth saying differently. */
export function isGlobalCapacityRefusal(message: string | null | undefined): boolean {
  return !!message && /monthly ai budget/i.test(message)
}

export interface CapacityNotice {
  title: string
  body: string
  /** Shown as a small state chip. */
  chip: string
  /** Rough, never a promise we cannot keep. */
  eta: string
}

/**
 * What to say. Never names a clock the user did not choose, never states an
 * hour, and always leads with the fact that nothing was lost.
 */
export function capacityNotice(message: string | null | undefined): CapacityNotice {
  if (isGlobalCapacityRefusal(message)) {
    return {
      title: "We'll scan this a bit later",
      body:
        "Scanning is paused across the app for now — this isn't something you did. " +
        "Your manual is saved and queued, and it starts automatically when scanning resumes.",
      chip: "Queued",
      eta: "We'll tell you when it's ready",
    }
  }
  return {
    title: "We'll scan this a bit later",
    body:
      "Today's scanning capacity is used up. Your manual is saved and queued — it starts " +
      "automatically when capacity frees up, and we'll tell you when the upkeep is ready.",
    chip: "Queued",
    eta: "Usually within a few hours",
  }
}

// ---------------------------------------------------------------------------
// The queue itself
// ---------------------------------------------------------------------------

/**
 * The backup plan, client-side.
 *
 * The manual is already saved and the scan is already an enqueued task, so
 * nothing is lost when the ceiling refuses — what was missing is anything that
 * picks it back up. This records which manuals are waiting so the app can start
 * them the next time it is opened with capacity available.
 *
 * HONEST LIMIT, and it is the reason this is not the whole fix: a client-side
 * queue only runs while someone has the app open. Scanning a queued manual
 * while the app is closed needs the WORKER to retry, which is a functions
 * change and a functions deploy. This is the half that ships today.
 */
const KEY = "homehub:scans-awaiting-capacity"

export interface QueuedScan {
  manualId: string
  itemUnitId: string
  /** ISO. Used to expire entries rather than retrying something forgotten. */
  queuedAt: string
}

/** Entries older than this are dropped: a week-old queued scan is not wanted. */
const MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000

function read(): QueuedScan[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (e): e is QueuedScan =>
        !!e && typeof e === "object" &&
        typeof (e as QueuedScan).manualId === "string" &&
        typeof (e as QueuedScan).itemUnitId === "string" &&
        typeof (e as QueuedScan).queuedAt === "string",
    )
  } catch {
    // A corrupt entry must not break the page that reads it.
    return []
  }
}

function write(entries: QueuedScan[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(entries))
  } catch {
    // Private mode / quota. Losing the queue is survivable; throwing is not.
  }
}

/** Remember a scan the ceiling refused. Idempotent per manual. */
export function queueScan(manualId: string, itemUnitId: string, nowMs: number): void {
  const kept = read().filter((e) => e.manualId !== manualId)
  kept.push({ manualId, itemUnitId, queuedAt: new Date(nowMs).toISOString() })
  write(kept)
}

export function isScanQueued(manualId: string): boolean {
  return read().some((e) => e.manualId === manualId)
}

export function unqueueScan(manualId: string): void {
  write(read().filter((e) => e.manualId !== manualId))
}

/**
 * Everything still worth retrying, oldest first — stale entries dropped.
 *
 * Oldest first because the person who waited longest should not be overtaken by
 * something queued a minute ago.
 */
export function dueScans(nowMs: number): QueuedScan[] {
  const fresh = read().filter((e) => {
    const at = Date.parse(e.queuedAt)
    return Number.isFinite(at) && nowMs - at < MAX_AGE_MS
  })
  if (fresh.length !== read().length) write(fresh)
  return [...fresh].sort((a, b) => Date.parse(a.queuedAt) - Date.parse(b.queuedAt))
}
