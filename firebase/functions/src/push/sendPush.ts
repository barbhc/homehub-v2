/**
 * FCM push (v1 send-push-notifications + send-test-push edge fns → Firebase-native).
 * Tokens live at users/{uid}/private/fcmTokens as { tokens: string[] } (model §1).
 *
 * NOTE: FCM sends have no emulator — these compile + run structurally, but a real
 * push must be verified on the OWNER's device (desktop + iOS PWA) per the plan's
 * Phase 4 gate. Invalid tokens are pruned on send (standard FCM hygiene).
 */
import { onCall, HttpsError } from "firebase-functions/v2/https"
import { onSchedule } from "firebase-functions/v2/scheduler"
import { getFirestore, type Firestore } from "firebase-admin/firestore"
import { getMessaging } from "firebase-admin/messaging"

const REGION = "us-central1"

async function getTokens(db: Firestore, uid: string): Promise<string[]> {
  const snap = await db.doc(`users/${uid}/private/fcmTokens`).get()
  const tokens = snap.get("tokens")
  return Array.isArray(tokens) ? tokens.filter((t): t is string => typeof t === "string") : []
}

/** Send to a user's tokens, pruning any the FCM response reports invalid. */
async function sendToUser(
  db: Firestore,
  uid: string,
  notification: { title: string; body: string },
  data?: Record<string, string>
): Promise<{ sent: number; failed: number }> {
  const tokens = await getTokens(db, uid)
  if (tokens.length === 0) return { sent: 0, failed: 0 }

  const res = await getMessaging().sendEachForMulticast({ tokens, notification, data })
  const invalid: string[] = []
  res.responses.forEach((r, i) => {
    if (!r.success) {
      const code = r.error?.code ?? ""
      if (code.includes("registration-token-not-registered") || code.includes("invalid-argument")) {
        invalid.push(tokens[i])
      }
    }
  })
  if (invalid.length) {
    const remaining = tokens.filter((t) => !invalid.includes(t))
    await db.doc(`users/${uid}/private/fcmTokens`).set({ tokens: remaining }, { merge: true })
  }
  return { sent: res.successCount, failed: res.failureCount }
}

/** Send a test push to the caller — proves token registration + delivery. */
export const sendTestPush = onCall({ region: REGION }, async (request) => {
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
 * Daily reminder (v1 cron 0 15 * * * ≈ 7–8am Pacific). For each home, notify each
 * member who has tokens about today's due/overdue tasks. Selection mirrors v1's
 * intent (scheduled, not deleted, due on/before today).
 */
export const sendPushDaily = onSchedule(
  { region: REGION, schedule: "0 15 * * *", timeZone: "America/Los_Angeles" },
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

    const byHome = new Map<string, number>()
    for (const d of due.docs) {
      const homeRef = d.ref.parent.parent
      if (!homeRef) continue
      byHome.set(homeRef.path, (byHome.get(homeRef.path) ?? 0) + 1)
    }

    let notified = 0
    for (const [homePath, count] of byHome) {
      if (count === 0) continue
      const members = await db.collection(`${homePath}/members`).get()
      const body = count === 1 ? "You have 1 task due today." : `You have ${count} tasks due today.`
      for (const m of members.docs) {
        const res = await sendToUser(db, m.id, { title: "Home care today", body }, { homePath, count: String(count) })
        notified += res.sent
      }
    }
    console.log(`sendPushDaily: homes=${byHome.size} pushesSent=${notified}`)
  }
)
