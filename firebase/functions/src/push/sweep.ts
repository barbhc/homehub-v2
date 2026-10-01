/**
 * The hourly push sweep — decide who is due (lanes.ts), gather only for them,
 * send (injected).
 *
 * `runPushSweep(db, now, send)` is the whole job; the onSchedule wrapper in
 * sendPush.ts just supplies the real clock and the real sender. That is what
 * lets the emulator test drive it with a fake sender and a chosen `now`.
 *
 * ── Order of work (C8, 2026-09-30) ──────────────────────────────────────────
 *
 * The sweep used to START with the expensive part: one collection-group query
 * for every scheduled task instance in the app due within 30 days — with no
 * lower bound, so every overdue row was re-read every hour forever — then the
 * templates, then each home's shopping list and members, then two documents
 * per member. All of it every hour, although the lanes can only fire for a
 * user at a handful of hours a day (the first morning tick, the buy-ahead
 * tick, their digest hour).
 *
 * Now it asks the cheap question first:
 *   1. every membership (one collection-group read of `members`);
 *   2. each user's prefs + push state (two docs per user, batched);
 *   3. `decideLanes` per user — the SAME decision the send path makes;
 *   4. only for homes where at least one member has a lane firing: that home's
 *      candidates, bounded to [today − CANDIDATE_LOOKBACK_DAYS, today + 30].
 * A tick where nobody is due reads memberships and user docs and nothing else.
 * Every tick logs `docsRead` (structured) so the drop can be checked in Cloud
 * Logging rather than taken on trust.
 *
 * Who gets a push is decided exactly as before: the same lanes, the same
 * composition, homes visited in the same order (earliest eligible instance
 * first, as the old app-wide query returned them), and state updated between
 * a user's homes the way the old per-home re-read did. The one deliberate
 * change is the lower bound — see CANDIDATE_LOOKBACK_DAYS.
 */
import type { Firestore } from "firebase-admin/firestore"
import * as logger from "firebase-functions/logger"
import { z } from "zod"
import { storedText } from "../lib/validate.js"
import { storedDocId } from "../lib/storedTask.js"
import { dueKindOf, safetyPhrase } from "../../../../shared/care/dueWindow.js"
import { isAgendaEligible } from "../../../../shared/tasks/agendaEligibility.js"
import { normalizeNotificationPrefs, type NotificationPrefs } from "../../../../shared/notifications/preferences.js"
import {
  addDays, agreed, buyAheadRows, composeBuyAhead, composeDigest, composeMorning, decideLanes, laParts,
  type Composed, type LocalParts, type Pending, type PendingSupply, type PushState,
} from "./lanes.js"

export type Sender = (
  db: Firestore,
  uid: string,
  notification: { title: string; body: string },
  data?: Record<string, string>,
) => Promise<{ sent: number; failed: number }>

/** Widest horizon any lane looks at: buy-ahead with the maximum lead time. */
const CANDIDATE_HORIZON_DAYS = 30

/**
 * How long an OVERDUE instance keeps riding pushes.
 *
 * Before 2026-09-30 there was no lower bound: an overdue deadline was
 * announced as "Deadline today" every morning for as long as it stayed
 * scheduled, a lapsed reminder rode every weekly digest indefinitely, and the
 * query re-read every such row app-wide every hour. Sixty days keeps two full
 * monthly cycles of "you skipped this" in the digest and the morning deadline
 * push, and drops rows nobody is going to act on because a phone buzzed.
 *
 * DELIBERATE BEHAVIOUR CHANGE, scoped: rows overdue by more than this stop
 * appearing in pushes — including lapsed safety-critical work in the digest.
 * They remain on the Home page and in the Tasks list exactly as before; only
 * the phone stops being told. Widening this is one number.
 */
export const CANDIDATE_LOOKBACK_DAYS = 60

/** Documents per getAll round trip. */
const BATCH = 300

type HomeCandidates = { homeId: string; homePath: string; pending: Pending[]; coveredParts: Set<string> }

/** Firestore's `__name__` order: path segment by segment, not the raw string
 *  ("homes/a" sorts before "homes/a-b", which plain string order reverses). */
export function compareDocPaths(a: string, b: string): number {
  const as = a.split("/")
  const bs = b.split("/")
  for (let i = 0; i < Math.min(as.length, bs.length); i++) {
    if (as[i] !== bs[i]) return as[i] < bs[i] ? -1 : 1
  }
  return as.length - bs.length
}

/** Documents read, by what they were read for. Firestore bills an empty query
 *  as one read, so each query counts at least 1. */
export type SweepReads = { members: number; userDocs: number; instances: number; templates: number; shopping: number }

async function readTemplates(
  db: Firestore,
  paths: string[],
  reads: SweepReads,
): Promise<Map<string, { remindEnabled: boolean | null; priorityTier: string | null; supplies: PendingSupply[] }>> {
  const out = new Map<string, { remindEnabled: boolean | null; priorityTier: string | null; supplies: PendingSupply[] }>()
  // Chunked getAll: one runaway home must not turn a scheduled job into a
  // single 10k-document read.
  for (let i = 0; i < paths.length; i += BATCH) {
    const chunk = paths.slice(i, i + BATCH)
    const snaps = await db.getAll(...chunk.map((p) => db.doc(p)))
    reads.templates += chunk.length
    for (const snap of snaps) {
      if (!snap.exists) continue
      const raw = snap.get("supplies")
      const supplies: PendingSupply[] = Array.isArray(raw)
        ? raw
            .filter((s): s is Record<string, unknown> => !!s && typeof s === "object" && typeof s.name === "string")
            .map((s) => ({
              name: s.name as string,
              url: typeof s.url === "string" && s.url ? s.url : null,
              size: typeof s.size === "string" && s.size ? s.size : null,
              buyAhead: s.buyAhead === true,
            }))
        : []
      const re = snap.get("remindEnabled")
      out.set(snap.ref.path, {
        remindEnabled: typeof re === "boolean" ? re : null,
        priorityTier: storedText(snap.get("priorityTier")),
        supplies,
      })
    }
  }
  return out
}

/**
 * Every scheduled, agenda-eligible instance due in
 * [today − CANDIDATE_LOOKBACK_DAYS, today + CANDIDATE_HORIZON_DAYS] in the
 * given homes, joined to its template (reminder flag, tier, supplies) and to
 * the home's have/bought shopping rows. Filtering by lane happens later, per
 * user, because the answer depends on the user's mode.
 *
 * One query per home, on the existing COLLECTION index (status, deletedAt,
 * dueDate). Homes come back in the order the old app-wide collection-group
 * query produced them — by their earliest eligible instance (dueDate, then
 * document path) — because a user in two homes is sent the morning push for
 * the FIRST of them, and that must not change.
 */
export async function collectCandidates(
  db: Firestore,
  today: string,
  homePaths: string[],
  reads: SweepReads = { members: 0, userDocs: 0, instances: 0, templates: 0, shopping: 0 },
): Promise<Map<string, HomeCandidates>> {
  const lower = addDays(today, -CANDIDATE_LOOKBACK_DAYS)
  const horizon = addDays(today, CANDIDATE_HORIZON_DAYS)

  const perHome = await Promise.all(
    homePaths.map(async (homePath) => {
      const snap = await db
        .collection(`${homePath}/taskInstances`)
        .where("status", "==", "scheduled")
        .where("deletedAt", "==", null)
        .where("dueDate", ">=", lower)
        .where("dueDate", "<=", horizon)
        .get()
      return { homePath, docs: snap.docs }
    }),
  )

  const found: Array<{ home: HomeCandidates; first: { dueDate: string; path: string } }> = []
  const templatePaths = new Set<string>()
  for (const { homePath, docs } of perHome) {
    reads.instances += Math.max(docs.length, 1)
    const entry: HomeCandidates = { homeId: homePath.split("/")[1], homePath, pending: [], coveredParts: new Set<string>() }
    let first: { dueDate: string; path: string } | null = null
    for (const d of docs) {
      // Same eligibility as the Home agenda — a push must never count tasks the
      // app deliberately hides (item-scoped cleaning).
      if (!isAgendaEligible({ careType: storedText(d.get("careType")), scopeType: storedText(d.get("scopeType")) })) continue

      // Member-written fields (H3a §3): text that isn't text reads as absent,
      // and the template id becomes a path, so it must be one segment — a
      // slash in one used to throw inside getAll and end the sweep for everyone.
      const title = storedText(d.get("title")) ?? "A task"
      const scheduleType = storedText(d.get("scheduleType"))
      const dueDate = storedText(d.get("dueDate")) ?? today
      const taskTemplateId = storedDocId(d.get("taskTemplateId"))
      if (taskTemplateId) templatePaths.add(`${homePath}/taskTemplates/${taskTemplateId}`)
      // Query order is (dueDate, document path) — the key the old query sorted by.
      first ??= { dueDate, path: d.ref.path }

      entry.pending.push({
        id: d.id,
        taskTemplateId,
        itemUnitId: storedText(d.get("itemUnitId")),
        title,
        itemName: storedText(d.get("itemName")),
        dueDate,
        isDeadline: dueKindOf({ title, scheduleType }) === "deadline",
        safety: !!d.get("isSafetyCritical") && safetyPhrase(dueDate, scheduleType, { today }) !== null,
        remindEnabled: null,
        priorityTier: storedText(d.get("priorityTier")),
        supplies: [],
      })
    }
    if (first !== null) found.push({ home: entry, first })
  }
  found.sort(
    (a, b) =>
      (a.first.dueDate < b.first.dueDate ? -1 : a.first.dueDate > b.first.dueDate ? 1 : 0) ||
      compareDocPaths(a.first.path, b.first.path),
  )

  const byHome = new Map<string, HomeCandidates>()
  const templates = await readTemplates(db, [...templatePaths], reads)
  for (const { home } of found) {
    for (const p of home.pending) {
      const tpl = p.taskTemplateId ? templates.get(`${home.homePath}/taskTemplates/${p.taskTemplateId}`) : undefined
      if (!tpl) continue
      p.remindEnabled = tpl.remindEnabled
      p.priorityTier = tpl.priorityTier ?? p.priorityTier
      p.supplies = tpl.supplies
    }
    // "I have one" / "bought" rows keyed to an instance cover that part for
    // this cycle. Read once per home, never per user.
    const shop = await db.collection(`${home.homePath}/shoppingList`).where("deletedAt", "==", null).get()
    reads.shopping += Math.max(shop.size, 1)
    for (const s of shop.docs) {
      const status = s.get("status")
      const inst = s.get("sourceTaskInstanceId")
      const name = s.get("name")
      if ((status === "have" || status === "bought") && typeof inst === "string" && typeof name === "string") {
        home.coveredParts.add(`${inst}::${name.trim().toLowerCase()}`)
      }
    }
    byHome.set(home.homePath, home)
  }
  return byHome
}

/**
 * Who belongs to which home, from one collection-group read of `members`.
 * Only `homes/{homeId}/members/{uid}` documents count. Homes are listed in
 * path order and members in id order — the order the old per-home
 * `members` read returned them in.
 */
async function readMemberships(db: Firestore, reads: SweepReads) {
  const snap = await db.collectionGroup("members").get()
  reads.members += Math.max(snap.size, 1)
  const homesByUser = new Map<string, string[]>()
  const membersByHome = new Map<string, string[]>()
  for (const d of snap.docs) {
    const home = d.ref.parent.parent
    if (!home || home.parent.id !== "homes" || home.parent.parent !== null) continue
    const uid = d.id
    homesByUser.set(uid, [...(homesByUser.get(uid) ?? []), home.path])
    membersByHome.set(home.path, [...(membersByHome.get(home.path) ?? []), uid])
  }
  return { homesByUser, membersByHome }
}

/**
 * Every user's notification prefs and push state, two documents each, in
 * batched round trips. A read failure fails the tick rather than guessing at
 * state: pushing without the dedupe state would repeat pushes, and the next
 * tick retries (the morning and buy-ahead lanes are deferred, not dropped).
 */
/**
 * A user's push dedupe state. It lives under users/{uid}/private, which the
 * user can write, and the sweep writes a patch on top of what it reads — so
 * each field is parsed (H3a §3). One of the wrong type reads as absent, which
 * at worst repeats a push once; it can no longer reach the lane decisions as
 * something other than what PushState says.
 */
const StoredPushState = z.object({
  lastMorningDate: z.string().nullish().catch(undefined),
  lastDigestKey: z.string().nullish().catch(undefined),
  lastBuyAheadDate: z.string().nullish().catch(undefined),
  buyAheadSent: z.record(z.string(), z.string()).nullish().catch(undefined),
}) satisfies z.ZodType<PushState>

async function readUserState(db: Firestore, uids: string[], reads: SweepReads) {
  const prefs = new Map<string, NotificationPrefs>()
  const state = new Map<string, PushState>()
  const perChunk = Math.floor(BATCH / 2)
  for (let i = 0; i < uids.length; i += perChunk) {
    const chunk = uids.slice(i, i + perChunk)
    const refs = chunk.flatMap((uid) => [db.doc(`users/${uid}/private/preferences`), db.doc(`users/${uid}/private/pushState`)])
    const snaps = await db.getAll(...refs)
    reads.userDocs += refs.length
    chunk.forEach((uid, j) => {
      const p = snaps[j * 2]
      const s = snaps[j * 2 + 1]
      prefs.set(uid, normalizeNotificationPrefs(p.exists ? p.get("notifications") : undefined))
      state.set(uid, s.exists ? StoredPushState.parse(s.data() ?? {}) : {})
    })
  }
  return { prefs, state }
}

const anyLane = (local: LocalParts, prefs: NotificationPrefs, state: PushState) => {
  const l = decideLanes(local, prefs, state)
  return l.morning || l.digest || l.buyAhead
}

export type SweepReport = {
  /** Users whose prefs and state were read. */
  usersChecked: number
  /** Users with at least one lane firing at this tick. */
  usersDue: number
  /** Homes with a due member — the only homes whose tasks were read. */
  homesDue: number
  /** Due homes that had candidates. */
  homes: number
  /** Due members visited in those homes. */
  users: number
  morning: number
  digest: number
  buyAhead: number
  pushesSent: number
  /** Every document this tick read, and what for. */
  docsRead: number
  reads: SweepReads
}

/**
 * One tick. Decide who is due → gather candidates for their homes only → for
 * every due member of every home with candidates, the lanes that fire NOW
 * compose, send, and record their dedupe key in the same pass.
 */
export async function runPushSweep(db: Firestore, now: Date, send: Sender): Promise<SweepReport> {
  const local = laParts(now)
  const reads: SweepReads = { members: 0, userDocs: 0, instances: 0, templates: 0, shopping: 0 }

  const { homesByUser, membersByHome } = await readMemberships(db, reads)
  const uids = [...homesByUser.keys()]
  const { prefs, state } = await readUserState(db, uids, reads)

  const due = new Set(uids.filter((uid) => anyLane(local, prefs.get(uid)!, state.get(uid)!)))
  const homesDue = [...new Set([...due].flatMap((uid) => homesByUser.get(uid) ?? []))]

  const byHome = homesDue.length > 0 ? await collectCandidates(db, local.date, homesDue, reads) : new Map<string, HomeCandidates>()
  const report: SweepReport = {
    usersChecked: uids.length,
    usersDue: due.size,
    homesDue: homesDue.length,
    homes: byHome.size,
    users: 0,
    morning: 0,
    digest: 0,
    buyAhead: 0,
    pushesSent: 0,
    docsRead: 0,
    reads,
  }

  for (const home of byHome.values()) {
    for (const uid of membersByHome.get(home.homePath) ?? []) {
      if (!due.has(uid)) continue
      report.users += 1
      const userPrefs = prefs.get(uid)!
      // The state as it stands NOW, after any earlier home's pushes this tick —
      // what the old per-home re-read of pushState returned.
      const userState = state.get(uid)!
      const lanes = decideLanes(local, userPrefs, userState)
      const patch: Partial<PushState> = {}

      if (lanes.morning) {
        const msg = composeMorning(home.pending, userPrefs, local.date, home.homeId)
        if (msg) {
          report.pushesSent += (await deliver(db, uid, msg, home.homePath, send)).sent
          report.morning += 1
        }
        // Mark even when there was nothing to say: the lane's question for
        // today has been answered, so the next tick is not a second look.
        patch.lastMorningDate = local.date
      }

      if (lanes.digest) {
        const msg = composeDigest(home.pending, userPrefs, local.date, home.homeId, home.coveredParts)
        if (msg) {
          report.pushesSent += (await deliver(db, uid, msg, home.homePath, send)).sent
          report.digest += 1
        }
        patch.lastDigestKey = local.date
      }

      if (lanes.buyAhead) {
        const rows = buyAheadRows(home.pending, userPrefs, local.date, home.coveredParts, userState)
        const msg = composeBuyAhead(rows, home.homeId)
        if (msg) {
          report.pushesSent += (await deliver(db, uid, msg, home.homePath, send)).sent
          report.buyAhead += 1
          patch.buyAheadSent = { ...(userState.buyAheadSent ?? {}), ...Object.fromEntries(rows.map((r) => [r.key, local.date])) }
        }
        patch.lastBuyAheadDate = local.date
      }

      if (Object.keys(patch).length > 0) {
        await db.doc(`users/${uid}/private/pushState`).set(patch, { merge: true })
        state.set(uid, { ...userState, ...patch })
      }
    }
  }

  report.docsRead = reads.members + reads.userDocs + reads.instances + reads.templates + reads.shopping
  logger.info("sendPushSweep tick", {
    date: local.date,
    time: local.hhmm,
    ...report,
  })
  return report
}

async function deliver(db: Firestore, uid: string, msg: Composed, homePath: string, send: Sender) {
  // The home id rides in the URL, not `data`: the APNs lane forwards only
  // {title, body, url}, so a data-only field is dropped on the platform that
  // matters. `homePath` in data is for the FCM/web lane's own bookkeeping.
  return send(db, uid, { title: msg.title, body: msg.body }, { homePath, url: msg.url })
}

/** Exposed for tests: the breadth predicate as the sweep applies it. */
export const _agreed = agreed
