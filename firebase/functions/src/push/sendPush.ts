/**
 * Push delivery (v1 send-push-notifications + send-test-push edge fns → Firebase-native).
 * Tokens live at users/{uid}/private/fcmTokens as { tokens: string[] } (model §1).
 *
 * This file owns the two things that need the Firebase runtime — the token
 * lanes (`sendToUser`) and the scheduled/callable wrappers. What to send and
 * when lives in lanes.ts (pure) and sweep.ts (orchestration with an injected
 * sender), so the decision table is unit-tested and the whole sweep runs
 * against the emulator with a fake sender.
 *
 * NOTE: FCM sends have no emulator — a real push must be verified on the
 * OWNER's device. `previewDigest` exists so that proof is one deliberate call
 * to the caller's own devices, not a Sunday-evening wait.
 */
import { onCall, HttpsError } from "firebase-functions/v2/https"
import { onSchedule } from "firebase-functions/v2/scheduler"
import { defineSecret } from "firebase-functions/params"
import { getFirestore, type Firestore } from "firebase-admin/firestore"
import { getMessaging } from "firebase-admin/messaging"
import { isApnsToken, sendApns } from "./apns.js"
import { composeDigestForUser, runPushSweep } from "./sweep.js"

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
export async function sendToUser(
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
 * The hourly sweep. Replaces `sendPushDaily`, which fired at "0 15 * * *" in
 * America/Los_Angeles — 3 PM, not the morning its own comment promised: v1
 * ran that expression in UTC, and the port kept the digits while adding the
 * timezone. Hourly is what makes a per-user digest hour and a per-user quiet
 * window honest with ONE function to deploy; the lanes gate themselves inside
 * (lanes.ts). Cost: ~168 invocations a week reading a handful of prefs docs.
 *
 * Deploy cutover: the old job must be deleted explicitly —
 * `firebase functions:delete sendPushDaily` — or it keeps firing at 3 PM
 * beside this one. `firebase functions:list` afterwards must show
 * sendPushSweep and NOT sendPushDaily.
 */
export const sendPushSweep = onSchedule(
  { region: REGION, schedule: "0 * * * *", timeZone: "America/Los_Angeles", secrets: APNS_SECRETS },
  async () => {
    await runPushSweep(getFirestore(), new Date(), sendToUser)
  }
)

/**
 * Compose the caller's Sunday digest for a home NOW — the same code path the
 * sweep takes on their chosen day/hour, with the clock made irrelevant.
 * `send: true` delivers it to the CALLER's own devices only, never to other
 * members: this is how a deploy is proven on one phone without a spam risk.
 */
export const previewDigest = onCall({ region: REGION, secrets: APNS_SECRETS }, async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required.")
  const homeId = typeof request.data?.homeId === "string" ? request.data.homeId : null
  if (!homeId) throw new HttpsError("invalid-argument", "homeId is required.")
  const db = getFirestore()
  const member = await db.doc(`homes/${homeId}/members/${uid}`).get()
  if (!member.exists) throw new HttpsError("permission-denied", "Not a member of that home.")

  const digest = await composeDigestForUser(db, uid, `homes/${homeId}`, new Date())
  if (!digest) return { ok: true as const, empty: true as const, sent: 0 }

  let sent = 0
  if (request.data?.send === true) {
    const res = await sendToUser(db, uid, { title: digest.title, body: digest.body }, { homePath: `homes/${homeId}`, url: digest.url })
    sent = res.sent
    if (sent === 0) throw new HttpsError("failed-precondition", "No registered devices for this account.")
  }
  return { ok: true as const, empty: false as const, ...digest, sent }
})
