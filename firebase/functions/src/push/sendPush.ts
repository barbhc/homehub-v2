/**
 * FCM push (v1 send-push-notifications + send-test-push edge fns → Firebase-native).
 * Tokens live at users/{uid}/private/fcmTokens as { tokens: string[] } (model §1).
 *
 * NOTE: FCM sends have no emulator — these compile + run structurally, but a real
 * push must be verified on the OWNER's device (desktop + iOS PWA) per the plan's
 * Phase 4 gate. Invalid tokens are pruned on send (standard FCM hygiene).
 */
import { onCall, HttpsError } from "firebase-functions/v2/https"
import { dueKindOf, safetyPhrase, type DueKind } from "../../../../shared/care/dueWindow.js"
import { onSchedule } from "firebase-functions/v2/scheduler"
import { defineSecret } from "firebase-functions/params"
import { getFirestore, type Firestore } from "firebase-admin/firestore"
import { getMessaging } from "firebase-admin/messaging"
import { isApnsToken, sendApns } from "./apns.js"
import { isAgendaEligible } from "../../../../shared/tasks/agendaEligibility.js"

const REGION = "us-central1"

// The APNs auth key (8RJM846HM6, Sandbox & Production, Team Scoped — created
// for v1 on 2026-06-18 and reused). Set via `firebase functions:secrets:set`;
// the .p8 content never enters source control.
const APNS_KEY = defineSecret("APNS_KEY")
const APNS_KEY_ID = defineSecret("APNS_KEY_ID")
const APNS_TEAM_ID = defineSecret("APNS_TEAM_ID")
const APNS_SECRETS = [APNS_KEY, APNS_KEY_ID, APNS_TEAM_ID]

async function getTokens(db: Firestore, uid: string): Promise<string[]> {
  const snap = await db.doc(`users/${uid}/private/fcmTokens`).get()
  const tokens = snap.get("tokens")
  return Array.isArray(tokens) ? tokens.filter((t): t is string => typeof t === "string") : []
}

/**
 * Send to a user's tokens across BOTH lanes.
 *
 * The stored array mixes dialects: web pushes register FCM tokens; the iOS
 * shell stores Apple's raw APNs token (64 hex). FCM multicast cannot address
 * the latter — worse, it rejects them as invalid-argument, and the old prune
 * treated that as "token is dead" and DELETED the iOS registration. So the
 * lanes are split by token shape, each with its own definitive-death rule:
 * FCM prunes on not-registered only; APNs prunes on 410/BadDeviceToken only.
 * Transient failures never prune — a timeout is not evidence.
 */
async function sendToUser(
  db: Firestore,
  uid: string,
  notification: { title: string; body: string },
  data?: Record<string, string>
): Promise<{ sent: number; failed: number }> {
  const tokens = await getTokens(db, uid)
  if (tokens.length === 0) return { sent: 0, failed: 0 }

  const apnsTokens = tokens.filter(isApnsToken)
  const fcmTokens = tokens.filter((t) => !isApnsToken(t))
  const invalid: string[] = []
  let sent = 0
  let failed = 0

  if (fcmTokens.length > 0) {
    const res = await getMessaging().sendEachForMulticast({ tokens: fcmTokens, notification, data })
    res.responses.forEach((r, i) => {
      if (!r.success && (r.error?.code ?? "").includes("registration-token-not-registered")) {
        invalid.push(fcmTokens[i])
      }
    })
    sent += res.successCount
    failed += res.failureCount
  }

  if (apnsTokens.length > 0) {
    const creds = { keyId: APNS_KEY_ID.value(), teamId: APNS_TEAM_ID.value(), p8: APNS_KEY.value() }
    for (const t of apnsTokens) {
      const r = await sendApns(t, { title: notification.title, body: notification.body, url: data?.url }, creds)
      if (r.status === 200) sent += 1
      else {
        failed += 1
        if (r.definitivelyDead) invalid.push(t)
      }
    }
  }

  if (invalid.length) {
    const remaining = tokens.filter((t) => !invalid.includes(t))
    await db.doc(`users/${uid}/private/fcmTokens`).set({ tokens: remaining }, { merge: true })
  }
  return { sent, failed }
}

/** Send a test push to the caller — proves token registration + delivery. */
export const sendTestPush = onCall({ region: REGION, secrets: APNS_SECRETS }, async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required.")
  const db = getFirestore()
  const res = await sendToUser(db, uid, {
    title: "Homehub",
    body: "Push notifications are working. 🎉",
  })
  if (res.sent === 0) throw new HttpsError("failed-precondition", "No registered devices for this account.")
  return { ok: true as const, ...res }
})

/**
 * Scheduled reminder (0 15 * * * ≈ 7–8am Pacific).
 *
 * Two lanes, because two kinds of work deserve different urgency
 * (design/due-windows.md):
 *
 *   DEADLINES — a real date exists (warranty closing, a recall). Pushed the
 *   day they are due, every day, as before. This is what red is for.
 *
 *   WINDOWS — everything else, which is almost everything. A filter change has
 *   no deadline, so a day-of alarm invents one. These are batched into a single
 *   SUNDAY digest: "3 things worth doing this month". Push volume for a normal
 *   home drops to ≤1 digest a week plus true deadlines, which is the design
 *   doc's done-criterion.
 *
 * One function, not two crons: the digest is the same daily run checking the
 * day of week. A second scheduled function would be a second thing to deploy
 * and a second thing to forget.
 */
const DIGEST_WEEKDAY = 0 // Sunday, in the home's display timezone
export const sendPushDaily = onSchedule(
  { region: REGION, schedule: "0 15 * * *", timeZone: "America/Los_Angeles", secrets: APNS_SECRETS },
  async () => {
    const db = getFirestore()
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date())

    // Due/overdue instances across all homes, grouped by home.
    const due = await db
      .collectionGroup("taskInstances")
      .where("status", "==", "scheduled")
      .where("deletedAt", "==", null)
      .where("dueDate", "<=", today)
      .get()

    // Keep the tasks themselves, not just a count: a notification that can name
    // the one thing due — and open it — is worth more than one that says "1 task"
    // and drops you on the Home screen to go find it.
    // Sunday in Pacific — the digest lane only runs then.
    const weekday = new Date(`${today}T12:00:00Z`).getUTCDay()
    const isDigestDay = weekday === DIGEST_WEEKDAY

    type Pending = { id: string; title: string; itemName: string | null; kind: DueKind; safety: boolean }
    const byHome = new Map<string, Pending[]>()
    for (const d of due.docs) {
      const homeRef = d.ref.parent.parent
      if (!homeRef) continue
      // Same eligibility as the Home agenda. Without it the push counted tasks
      // the app deliberately hides (item-scoped cleaning), and the owner's
      // phone announced "22 tasks due today" over a Home screen showing 3 —
      // an alert that contradicts the app it opens teaches people to ignore both.
      if (!isAgendaEligible({ careType: d.get("careType") as string | null, scopeType: d.get("scopeType") as string | null })) continue
      const title = (d.get("title") as string) ?? "A task"
      const scheduleType = (d.get("scheduleType") as string | null) ?? null
      const kind = dueKindOf({ title, scheduleType })
      const dueDate = (d.get("dueDate") as string) ?? today
      const safety =
        !!d.get("isSafetyCritical") &&
        safetyPhrase(dueDate, scheduleType, { today }) !== null

      // Deadlines push the day they land. Everything else waits for Sunday —
      // and a lapsed SAFETY check rides the digest too rather than going
      // silent: firm, but not an alarm on a random Tuesday.
      if (kind !== "deadline" && !isDigestDay) continue

      const list = byHome.get(homeRef.path) ?? []
      list.push({ id: d.id, title, itemName: (d.get("itemName") as string | null) ?? null, kind, safety })
      byHome.set(homeRef.path, list)
    }

    let notified = 0
    for (const [homePath, tasks] of byHome) {
      const count = tasks.length
      if (count === 0) continue
      const members = await db.collection(`${homePath}/members`).get()

      // One task: say which, and deep-link straight to it. Several: summarise
      // and open the Tasks list, because picking one for the user would be a
      // guess. The url is a PATH, never an absolute link — the client refuses
      // anything else.
      const deadlines = tasks.filter((t) => t.kind === "deadline")
      const windows = tasks.filter((t) => t.kind !== "deadline")

      // A deadline is never buried inside a digest — if one is due, it leads.
      const only = deadlines.length === 1 && windows.length === 0 ? deadlines[0]
        : count === 1 ? tasks[0]
        : null

      let title: string
      let body: string
      if (deadlines.length > 0) {
        title = deadlines.length === 1 ? "Deadline today" : `${deadlines.length} deadlines today`
        const names = deadlines.slice(0, 2).map((t) => t.title).join(" · ")
        body = windows.length > 0
          ? `${names}. Plus ${windows.length} other thing${windows.length > 1 ? "s" : ""} worth doing.`
          : names
      } else if (only) {
        title = "Worth doing this week"
        body = `${only.title}${only.itemName ? ` · ${only.itemName}` : ""}`
      } else {
        // The digest. Names, not a bare count: "3 tasks" sends you hunting.
        title = `${count} things worth doing`
        const named = tasks.slice(0, 3).map((t) => t.title).join(" · ")
        const rest = count > 3 ? ` and ${count - 3} more` : ""
        const safetyNote = tasks.some((t) => t.safety) ? " Includes a safety check." : ""
        body = `${named}${rest}. No rush on a day — pick a morning.${safetyNote}`
      }
      // The home id rides in the URL, not in `data`: the APNs lane forwards
      // only {title, body, url}, so a data-only field would be silently dropped
      // on exactly the platform that matters. Without it, a push about the
      // second home tapped while the first is selected opens a task that isn't
      // in the current home.
      const homeId = homePath.split("/")[1]
      const url = only ? `/tasks/${only.id}?home=${homeId}` : `/maintenance?home=${homeId}`

      for (const m of members.docs) {
        const res = await sendToUser(
          db,
          m.id,
          { title, body },
          { homePath, count: String(count), url },
        )
        notified += res.sent
      }
    }
    console.log(`sendPushDaily: digestDay=${isDigestDay} homes=${byHome.size} pushesSent=${notified}`)
  }
)
