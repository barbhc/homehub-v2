/**
 * The push lanes — every DECISION and every piece of COPY, pure.
 *
 * Nothing here imports Firebase. The sweep (sweep.ts) gathers data and calls
 * these; node --test drives them with plain objects. That split is the point:
 * the old sendPushDaily fused the query, the gating, the copy and the send
 * into one scheduled closure, so its decision table lived only in a hand-
 * mirrored test that had drifted ("Due today" / "Home care today" — strings
 * the function had not said in weeks).
 *
 * Four lanes, one hourly sweep (round 19, design/reminders):
 *
 *   MORNING  — deadlines due today, plus day-of pings for reminders the user
 *              agreed to (their push mode). First hourly tick at/after 08:00
 *              local that is outside quiet hours; once per day. Deferred by
 *              quiet hours, never dropped — a deadline that goes silent is
 *              the distrust failure.
 *   DIGEST   — "Your week at home", at the user's chosen weekday + hour.
 *              The chosen hour IS consent, so quiet hours do not veto it.
 *   BUY-AHEAD — parts to order before a curated reminder lands. Morning,
 *              once per day, only for (instance, part) pairs not already
 *              pushed and not covered by a have/bought shopping row.
 *
 * Timezone is one hardcoded value, isolated in `laParts` — the future
 * per-home swap point (homes.timezone exists in the model; nothing reads it).
 */
import { isWithinQuietHours, notifiesInMode, type NotificationPrefs } from "../../../../shared/notifications/preferences.js"

export const PUSH_TZ = "America/Los_Angeles"
export const MORNING_HOUR = 8
export const BUY_AHEAD_HOUR = 9

export type LocalParts = { date: string; hhmm: string; hour: number; weekday: number }

/** `now` in the delivery timezone: ISO date, HH:MM, hour, weekday (0 = Sunday). */
export function laParts(now: Date): LocalParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: PUSH_TZ, hour12: false, weekday: "short",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  })
  const p = Object.fromEntries(fmt.formatToParts(now).map((x) => [x.type, x.value]))
  const hour = Number(p.hour) % 24 // en-US hour12:false yields "24" at midnight
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday)
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    hhmm: `${String(hour).padStart(2, "0")}:${p.minute}`,
    hour,
    weekday,
  }
}

export function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Per-user dedupe/deferral state at users/{uid}/private/pushState. */
export type PushState = {
  lastMorningDate?: string | null
  lastDigestKey?: string | null
  lastBuyAheadDate?: string | null
  /** `${instanceId}::${partName}` → ISO date sent. */
  buyAheadSent?: Record<string, string> | null
}

export type LaneDecision = { morning: boolean; digest: boolean; buyAhead: boolean; reasons: string[] }

/**
 * Which lanes fire for this user at this tick. Pure; exhaustively tabled in
 * test/pushlanes.test.mjs.
 */
export function decideLanes(local: LocalParts, prefs: NotificationPrefs, state: PushState): LaneDecision {
  const reasons: string[] = []
  const quiet = isWithinQuietHours(local.hhmm, prefs.quiet_hours)

  const morningWindow = local.hour >= MORNING_HOUR && !quiet
  const morning = prefs.events.task_reminders.push && morningWindow && state.lastMorningDate !== local.date
  if (!morning) {
    if (!prefs.events.task_reminders.push) reasons.push("morning:off")
    else if (quiet) reasons.push("morning:quiet")
    else if (local.hour < MORNING_HOUR) reasons.push("morning:early")
    else reasons.push("morning:sent")
  }

  const d = prefs.weekly_digest
  const digestKey = local.date
  const digest = d.enabled && local.weekday === d.day && local.hour === d.hour && state.lastDigestKey !== digestKey
  if (!digest) reasons.push(!d.enabled ? "digest:off" : state.lastDigestKey === digestKey ? "digest:sent" : "digest:not-now")

  const buyWindow = local.hour >= BUY_AHEAD_HOUR && !quiet
  const buyAhead = prefs.events.buy_ahead.push && buyWindow && state.lastBuyAheadDate !== local.date
  if (!buyAhead) reasons.push(!prefs.events.buy_ahead.push ? "buy:off" : quiet ? "buy:quiet" : local.hour < BUY_AHEAD_HOUR ? "buy:early" : "buy:sent")

  return { morning, digest, buyAhead, reasons }
}

// ── candidates ────────────────────────────────────────────────────────────────

export type PendingSupply = { name: string; url: string | null; size: string | null; buyAhead: boolean }

export type Pending = {
  id: string
  taskTemplateId: string | null
  itemUnitId: string | null
  title: string
  itemName: string | null
  dueDate: string
  /** "deadline" per dueKindOf; everything else is a window. */
  isDeadline: boolean
  /** Lapsed safety-critical work — rides the digest in every mode. */
  safety: boolean
  /** From the template; null when the template could not be read. */
  remindEnabled: boolean | null
  priorityTier: string | null
  supplies: PendingSupply[]
}

/** The breadth predicate, applied to a candidate. A missing template keeps the
 *  instance's own judgement rather than being silenced by a lookup failure. */
export function agreed(p: Pending, prefs: NotificationPrefs): boolean {
  return notifiesInMode(prefs.push_mode, p.remindEnabled, p.priorityTier)
}

export type Composed = { title: string; body: string; url: string }

const nameList = (tasks: Pending[], max: number): string => {
  const named = tasks.slice(0, max).map((t) => t.title).join(", ")
  const rest = tasks.length > max ? ` and ${tasks.length - max} more` : ""
  return `${named}${rest}`
}

/**
 * MORNING: deadlines lead, then day-of pings for agreed reminders due today.
 * Returns null when there is nothing to say — silence beats a filler push.
 */
export function composeMorning(pending: Pending[], prefs: NotificationPrefs, today: string, homeId: string): Composed | null {
  const dueToday = pending.filter((p) => p.dueDate <= today)
  const deadlines = dueToday.filter((p) => p.isDeadline)
  const windows = dueToday.filter((p) => !p.isDeadline && p.dueDate === today && agreed(p, prefs))
  const tasks = [...deadlines, ...windows]
  if (tasks.length === 0) return null

  const only = tasks.length === 1 ? tasks[0] : null
  const url = only ? `/tasks/${only.id}?home=${homeId}` : `/week?home=${homeId}`

  if (deadlines.length > 0) {
    const title = deadlines.length === 1 ? "Deadline today" : `${deadlines.length} deadlines today`
    const names = deadlines.slice(0, 2).map((t) => t.title).join(" · ")
    const body = windows.length > 0
      ? `${names}. Plus ${windows.length} reminder${windows.length > 1 ? "s" : ""} you set for today.`
      : names
    return { title, body, url }
  }
  if (only) {
    return {
      title: `Today: ${only.title}`,
      body: `${only.itemName ? `${only.itemName}. ` : ""}You asked to be reminded for this one.`,
      url,
    }
  }
  return { title: `Today: ${tasks.length} reminders`, body: `${nameList(tasks, 3)}. You chose each of these.`, url }
}

/**
 * DIGEST: agreed reminders due within the next 7 days (overdue included),
 * plus lapsed safety work regardless of mode, plus "one thing to buy first"
 * when a buy-ahead part is uncovered. Null when the week is empty — a
 * "nothing this week" push is noise (Relevant, Useful, Timely).
 */
export function composeDigest(
  pending: Pending[],
  prefs: NotificationPrefs,
  today: string,
  homeId: string,
  coveredParts: Set<string>,
): (Composed & { reminders: Pending[]; toBuy: number }) | null {
  const horizon = addDays(today, 7)
  const reminders = pending.filter((p) => p.dueDate <= horizon && (agreed(p, prefs) || p.safety))
  if (reminders.length === 0) return null

  const toBuy = reminders.reduce(
    (n, p) => n + p.supplies.filter((s) => s.buyAhead && !coveredParts.has(`${p.id}::${s.name.trim().toLowerCase()}`)).length,
    0,
  )
  const count = reminders.length
  const lead = `${count} reminder${count === 1 ? "" : "s"}: ${nameList(reminders, 3)}.`
  const buy = toBuy === 0 ? "" : toBuy === 1 ? " One thing to buy first." : ` ${toBuy} things to buy first.`
  const safetyNote = reminders.some((p) => p.safety) ? " Includes a safety check." : ""
  return {
    title: "Your week at home",
    body: `${lead}${buy}${safetyNote}`,
    url: `/week?home=${homeId}`,
    reminders,
    toBuy,
  }
}

export type BuyAheadRow = { pending: Pending; supply: PendingSupply; key: string }

/** The uncovered, unsent buy-ahead parts for agreed reminders inside the lead window. */
export function buyAheadRows(
  pending: Pending[],
  prefs: NotificationPrefs,
  today: string,
  coveredParts: Set<string>,
  state: PushState,
): BuyAheadRow[] {
  const horizon = addDays(today, Math.max(7, prefs.lead_time_days))
  const sent = state.buyAheadSent ?? {}
  const rows: BuyAheadRow[] = []
  for (const p of pending) {
    if (p.dueDate > horizon || !agreed(p, prefs)) continue
    for (const s of p.supplies) {
      if (!s.buyAhead) continue
      const key = `${p.id}::${s.name.trim().toLowerCase()}`
      if (coveredParts.has(key) || sent[key]) continue
      rows.push({ pending: p, supply: s, key })
    }
  }
  return rows.sort((a, b) => a.pending.dueDate.localeCompare(b.pending.dueDate))
}

function weekdayName(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00Z`)
  return d.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" })
}

/** BUY-AHEAD: one part names itself and lands on its task row; several open Buy first. */
export function composeBuyAhead(rows: BuyAheadRow[], homeId: string): Composed | null {
  if (rows.length === 0) return null
  if (rows.length === 1) {
    const { pending, supply } = rows[0]
    const part = supply.size ? `${supply.name} · ${supply.size}` : supply.name
    const task = pending.itemUnitId ? `/items/${pending.itemUnitId}?task=${pending.taskTemplateId ?? ""}&home=${homeId}` : `/week?home=${homeId}`
    return {
      title: `${part} — order this week`,
      body: `The ${pending.title.toLowerCase()} reminder lands ${weekdayName(pending.dueDate)}. ${supply.url ? "Your saved link is one tap away." : "Add a link on the task to make this one tap."}`,
      url: task,
    }
  }
  const names = rows.slice(0, 3).map((r) => r.supply.name).join(", ")
  return {
    title: `${rows.length} parts to order this week`,
    body: `${names}${rows.length > 3 ? ` and ${rows.length - 3} more` : ""} — before their reminders land.`,
    url: `/week?home=${homeId}`,
  }
}
