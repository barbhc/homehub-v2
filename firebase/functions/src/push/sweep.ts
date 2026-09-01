/**
 * The hourly push sweep — gather, decide (lanes.ts), send (injected).
 *
 * `runPushSweep(db, now, send)` is the whole job; the onSchedule wrapper in
 * sendPush.ts just supplies the real clock and the real sender. That is what
 * lets the emulator test drive it with a fake sender and a chosen `now`, and
 * lets `previewDigest` compose a real user's digest on demand — the same code
 * path the Sunday push takes, with the clock made irrelevant.
 */
import type { Firestore } from "firebase-admin/firestore"
import { dueKindOf, safetyPhrase } from "../../../../shared/care/dueWindow.js"
import { isAgendaEligible } from "../../../../shared/tasks/agendaEligibility.js"
import { normalizeNotificationPrefs, type NotificationPrefs } from "../../../../shared/notifications/preferences.js"
import {
  addDays, agreed, buyAheadRows, composeBuyAhead, composeDigest, composeMorning, decideLanes, laParts,
  type Composed, type Pending, type PendingSupply, type PushState,
} from "./lanes.js"

export type Sender = (
  db: Firestore,
  uid: string,
  notification: { title: string; body: string },
  data?: Record<string, string>,
) => Promise<{ sent: number; failed: number }>

/** Widest horizon any lane looks at: buy-ahead with the maximum lead time. */
const CANDIDATE_HORIZON_DAYS = 30

type HomeCandidates = { homeId: string; homePath: string; pending: Pending[]; coveredParts: Set<string> }

async function readTemplates(db: Firestore, paths: string[]): Promise<Map<string, { remindEnabled: boolean | null; priorityTier: string | null; supplies: PendingSupply[] }>> {
  const out = new Map<string, { remindEnabled: boolean | null; priorityTier: string | null; supplies: PendingSupply[] }>()
  // Chunked getAll: one runaway home must not turn a scheduled job into a
  // single 10k-document read.
  for (let i = 0; i < paths.length; i += 300) {
    const snaps = await db.getAll(...paths.slice(i, i + 300).map((p) => db.doc(p)))
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
        priorityTier: (snap.get("priorityTier") as string | null) ?? null,
        supplies,
      })
    }
  }
  return out
}

/**
 * Every scheduled, agenda-eligible instance due within the widest horizon,
 * grouped by home, joined to its template (reminder flag, tier, supplies) and
 * to the home's have/bought shopping rows. Filtering by lane happens later,
 * per user, because the answer depends on the user's mode.
 */
export async function collectCandidates(db: Firestore, today: string, opts?: { homePaths?: string[] }): Promise<Map<string, HomeCandidates>> {
  const horizon = addDays(today, CANDIDATE_HORIZON_DAYS)
  const due = await db
    .collectionGroup("taskInstances")
    .where("status", "==", "scheduled")
    .where("deletedAt", "==", null)
    .where("dueDate", "<=", horizon)
    .get()

  const byHome = new Map<string, HomeCandidates>()
  const templatePaths = new Set<string>()
  for (const d of due.docs) {
    const homeRef = d.ref.parent.parent
    if (!homeRef) continue
    if (opts?.homePaths && !opts.homePaths.includes(homeRef.path)) continue
    // Same eligibility as the Home agenda — a push must never count tasks the
    // app deliberately hides (item-scoped cleaning).
    if (!isAgendaEligible({ careType: d.get("careType") as string | null, scopeType: d.get("scopeType") as string | null })) continue

    const title = (d.get("title") as string) ?? "A task"
    const scheduleType = (d.get("scheduleType") as string | null) ?? null
    const dueDate = (d.get("dueDate") as string) ?? today
    const taskTemplateId = (d.get("taskTemplateId") as string | null) ?? null
    const templatePath = taskTemplateId ? `${homeRef.path}/taskTemplates/${taskTemplateId}` : null
    if (templatePath) templatePaths.add(templatePath)

    const entry = byHome.get(homeRef.path) ?? { homeId: homeRef.id, homePath: homeRef.path, pending: [], coveredParts: new Set<string>() }
    entry.pending.push({
      id: d.id,
      taskTemplateId,
      itemUnitId: (d.get("itemUnitId") as string | null) ?? null,
      title,
      itemName: (d.get("itemName") as string | null) ?? null,
      dueDate,
      isDeadline: dueKindOf({ title, scheduleType }) === "deadline",
      safety: !!d.get("isSafetyCritical") && safetyPhrase(dueDate, scheduleType, { today }) !== null,
      remindEnabled: null,
      priorityTier: (d.get("priorityTier") as string | null) ?? null,
      supplies: [],
    })
    byHome.set(homeRef.path, entry)
  }

  const templates = await readTemplates(db, [...templatePaths])
  for (const home of byHome.values()) {
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
    for (const s of shop.docs) {
      const status = s.get("status")
      const inst = s.get("sourceTaskInstanceId")
      const name = s.get("name")
      if ((status === "have" || status === "bought") && typeof inst === "string" && typeof name === "string") {
        home.coveredParts.add(`${inst}::${name.trim().toLowerCase()}`)
      }
    }
  }
  return byHome
}

async function readPrefs(db: Firestore, uid: string): Promise<NotificationPrefs> {
  // A prefs read failure must not silence a user: defaults are today's
  // behavior, and the push still goes. The failure is logged, not swallowed.
  try {
    const snap = await db.doc(`users/${uid}/private/preferences`).get()
    return normalizeNotificationPrefs(snap.exists ? snap.get("notifications") : undefined)
  } catch (e) {
    console.error(`push: prefs read failed for ${uid}, using defaults`, e)
    return normalizeNotificationPrefs(undefined)
  }
}

async function readPushState(db: Firestore, uid: string): Promise<PushState> {
  const snap = await db.doc(`users/${uid}/private/pushState`).get()
  return snap.exists ? (snap.data() as PushState) : {}
}

export type SweepReport = {
  homes: number
  users: number
  morning: number
  digest: number
  buyAhead: number
  pushesSent: number
}

/**
 * One tick. For every home with candidates → every member → their prefs and
 * state decide which lanes fire NOW; each lane composes, sends, and records
 * its dedupe key in the same pass.
 */
export async function runPushSweep(db: Firestore, now: Date, send: Sender): Promise<SweepReport> {
  const local = laParts(now)
  const byHome = await collectCandidates(db, local.date)
  const report: SweepReport = { homes: byHome.size, users: 0, morning: 0, digest: 0, buyAhead: 0, pushesSent: 0 }

  for (const home of byHome.values()) {
    const members = await db.collection(`${home.homePath}/members`).get()
    for (const m of members.docs) {
      report.users += 1
      const uid = m.id
      const prefs = await readPrefs(db, uid)
      const state = await readPushState(db, uid)
      const lanes = decideLanes(local, prefs, state)
      const patch: Partial<PushState> = {}

      if (lanes.morning) {
        const msg = composeMorning(home.pending, prefs, local.date, home.homeId)
        if (msg) {
          report.pushesSent += (await deliver(db, uid, msg, home.homePath, send)).sent
          report.morning += 1
        }
        // Mark even when there was nothing to say: the lane's question for
        // today has been answered, so the next tick is not a second look.
        patch.lastMorningDate = local.date
      }

      if (lanes.digest) {
        const msg = composeDigest(home.pending, prefs, local.date, home.homeId, home.coveredParts)
        if (msg) {
          report.pushesSent += (await deliver(db, uid, msg, home.homePath, send)).sent
          report.digest += 1
        }
        patch.lastDigestKey = local.date
      }

      if (lanes.buyAhead) {
        const rows = buyAheadRows(home.pending, prefs, local.date, home.coveredParts, state)
        const msg = composeBuyAhead(rows, home.homeId)
        if (msg) {
          report.pushesSent += (await deliver(db, uid, msg, home.homePath, send)).sent
          report.buyAhead += 1
          patch.buyAheadSent = { ...(state.buyAheadSent ?? {}), ...Object.fromEntries(rows.map((r) => [r.key, local.date])) }
        }
        patch.lastBuyAheadDate = local.date
      }

      if (Object.keys(patch).length > 0) {
        await db.doc(`users/${uid}/private/pushState`).set(patch, { merge: true })
      }
    }
  }
  console.log(`sendPushSweep: ${local.date} ${local.hhmm} homes=${report.homes} users=${report.users} morning=${report.morning} digest=${report.digest} buyAhead=${report.buyAhead} sent=${report.pushesSent}`)
  return report
}

async function deliver(db: Firestore, uid: string, msg: Composed, homePath: string, send: Sender) {
  // The home id rides in the URL, not `data`: the APNs lane forwards only
  // {title, body, url}, so a data-only field is dropped on the platform that
  // matters. `homePath` in data is for the FCM/web lane's own bookkeeping.
  return send(db, uid, { title: msg.title, body: msg.body }, { homePath, url: msg.url })
}

/**
 * Compose the caller's digest for one home, as the sweep would on their chosen
 * day and hour — with the clock made irrelevant. Returns null when the week
 * is empty (the sweep sends nothing then either).
 */
export async function composeDigestForUser(
  db: Firestore,
  uid: string,
  homePath: string,
  now: Date,
): Promise<(Composed & { reminders: number; toBuy: number }) | null> {
  const local = laParts(now)
  const byHome = await collectCandidates(db, local.date, { homePaths: [homePath] })
  const home = byHome.get(homePath)
  if (!home) return null
  const prefs = await readPrefs(db, uid)
  const msg = composeDigest(home.pending, prefs, local.date, home.homeId, home.coveredParts)
  if (!msg) return null
  return { title: msg.title, body: msg.body, url: msg.url, reminders: msg.reminders.length, toBuy: msg.toBuy }
}

/** Exposed for tests: the breadth predicate as the sweep applies it. */
export const _agreed = agreed
