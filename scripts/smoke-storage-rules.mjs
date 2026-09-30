/**
 * Post-deploy smoke check for the Storage tenant gate. REQUIRED after any
 * `firebase deploy --only storage` — see docs/launch-readiness.md.
 *
 * Why this exists as a script and not only a rules test: the gate is
 * `firestore.exists(...)`, a CROSS-SERVICE call, and in production it depends on
 * an IAM grant that lives outside the repo entirely. Deploying correct rules to
 * a project missing that grant produces rules that read correctly, compile
 * correctly, and deny every caller — members included. That is not
 * hypothetical: it happened on 19 Aug 2026 and this script is what caught it
 * (see the block comment in storage.rules for the grant).
 *
 * It creates two throwaway users, a synthetic home, and objects under synthetic
 * paths, asserts the cases below, then deletes all of it. It never reads,
 * lists, or touches real user content.
 *
 *   1. a member reads their own home's object                    -> 200
 *   2. a member reads a legacy-path object                        -> 200  (legacy clause intact)
 *   3. a signed-in NON-member reads that object                   -> 403  (tenant gate)
 *   4. an unauthenticated caller reads it                         -> 403  (no public reads)
 *   5. a member UPLOADS into their own home                       -> 200  (write gate lets members in)
 *   6. a non-member uploads under their OWN uid in that home      -> 403  (write gate — the old any-homeId hole)
 *   7. a non-member uploads a receipt into that home              -> 403  (write gate — the old any-signed-in hole)
 *
 * #1 and #5 both need the IAM grant; if exactly those fail, the rules are fine
 * and the grant is missing. Assertion 1 polls: an IAM change takes up to a few
 * minutes to reach the Rules evaluator, so a single early miss is not a failure.
 *
 * Usage (production; needs application-default credentials for the project):
 *   WEB_API_KEY=<VITE_FIREBASE_API_KEY> npm run smoke:storage
 *
 * EMULATOR mode, to prove this script before pointing it at production: when
 * FIREBASE_AUTH_EMULATOR_HOST, FIRESTORE_EMULATOR_HOST and
 * FIREBASE_STORAGE_EMULATOR_HOST are ALL set (as `firebase emulators:exec`
 * sets them), it targets the emulators, on the project in SMOKE_PROJECT or
 * GCLOUD_PROJECT — which must be a demo- project. Some-but-not-all set is
 * refused: half-emulated would mean real users against fake rules, or the
 * reverse.
 */
import { initializeApp, applicationDefault } from "firebase-admin/app"
import { getAuth } from "firebase-admin/auth"
import { getFirestore } from "firebase-admin/firestore"
import { getStorage } from "firebase-admin/storage"

const EMU = {
  auth: process.env.FIREBASE_AUTH_EMULATOR_HOST,
  firestore: process.env.FIRESTORE_EMULATOR_HOST,
  storage: process.env.FIREBASE_STORAGE_EMULATOR_HOST,
}
const emuSet = Object.values(EMU).filter(Boolean).length
if (emuSet > 0 && emuSet < 3) {
  console.error(`Set all three emulator hosts or none (got ${JSON.stringify(EMU)}).`)
  process.exit(2)
}
const EMULATED = emuSet === 3

const PROJECT = process.env.SMOKE_PROJECT ?? (EMULATED ? process.env.GCLOUD_PROJECT : undefined) ?? "homehub-2068d"
if (EMULATED && !PROJECT.startsWith("demo-")) {
  console.error(`Emulator mode needs a demo- project (got ${PROJECT}).`)
  process.exit(2)
}
const BUCKET = process.env.SMOKE_BUCKET ?? `${PROJECT}.firebasestorage.app`
const API_KEY = process.env.WEB_API_KEY ?? (EMULATED ? "emulator-any-key" : undefined)
if (!API_KEY) {
  console.error("WEB_API_KEY is required (the project's VITE_FIREBASE_API_KEY).")
  process.exit(2)
}
const AUTH_API = EMULATED ? `http://${EMU.auth}/identitytoolkit.googleapis.com` : "https://identitytoolkit.googleapis.com"
const STORAGE_API = EMULATED ? `http://${EMU.storage}` : "https://firebasestorage.googleapis.com"

// `zz-` prefixed so they sort away from real data and are obvious in a console.
const HOME = "zz-rulesprobe-home"
const MEMBER_UID = "zz-rulesprobe-member"
const OUTSIDER_UID = "zz-rulesprobe-outsider"
const OBJ = `homes/${HOME}/photos/${MEMBER_UID}/probeitem/photo.jpg`
const LEGACY_OBJ = `zz-rulesprobe-legacy/probeitem/manual_1.pdf`
const MEMBER_UPLOAD = `homes/${HOME}/photos/${MEMBER_UID}/probeitem/upload-probe.jpg`
const OUTSIDER_OWN_UID_UPLOAD = `homes/${HOME}/photos/${OUTSIDER_UID}/probeitem/photo.jpg`
const OUTSIDER_RECEIPT_UPLOAD = `homes/${HOME}/receipts/probeitem/outsider-probe.jpg`
const PW = "Pr0be-rules-check-2026"

console.log(`Target: ${EMULATED ? `EMULATORS (${PROJECT})` : `PRODUCTION (${PROJECT})`} · bucket ${BUCKET}\n`)
initializeApp(
  EMULATED
    ? { projectId: PROJECT, storageBucket: BUCKET }
    : { credential: applicationDefault(), projectId: PROJECT, storageBucket: BUCKET },
)
const auth = getAuth(), db = getFirestore(), bucket = getStorage().bucket()

/** Password sign-in, not createCustomToken: local user ADC has no signing key. */
const idTokenFor = async (uid) => {
  const r = await fetch(
    `${AUTH_API}/v1/accounts:signInWithPassword?key=${API_KEY}`,
    { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: `${uid}@probe.invalid`, password: PW, returnSecureToken: true }) })
  const j = await r.json()
  if (!j.idToken) throw new Error("sign-in failed: " + JSON.stringify(j).slice(0, 200))
  return j.idToken
}

const read = async (path, token) => {
  const r = await fetch(
    `${STORAGE_API}/v0/b/${BUCKET}/o/${encodeURIComponent(path)}?alt=media`,
    { headers: token ? { Authorization: `Firebase ${token}` } : {} })
  return r.status
}

/** A client-shaped upload (Storage REST, rules-evaluated) — not the Admin SDK. */
const upload = async (path, token) => {
  const r = await fetch(
    `${STORAGE_API}/v0/b/${BUCKET}/o?name=${encodeURIComponent(path)}`,
    { method: "POST",
      headers: { "Content-Type": "image/jpeg", ...(token ? { Authorization: `Firebase ${token}` } : {}) },
      body: Buffer.from("probe") })
  return r.status
}

// Every step is best-effort: most of these objects and docs do not exist on a
// clean run, and a missing one must not stop the rest of the cleanup.
const cleanup = async () => {
  for (const p of [OBJ, LEGACY_OBJ, MEMBER_UPLOAD, OUTSIDER_OWN_UID_UPLOAD, OUTSIDER_RECEIPT_UPLOAD]) {
    await bucket.file(p).delete({ ignoreNotFound: true }).catch(() => {})
  }
  await db.doc(`homes/${HOME}/members/${MEMBER_UID}`).delete().catch(() => {})
  await db.doc(`homes/${HOME}`).delete().catch(() => {})
  for (const u of [MEMBER_UID, OUTSIDER_UID]) await auth.deleteUser(u).catch(() => {})
}

let failed = false
try {
  await cleanup() // a previous aborted run must not poison this one
  for (const u of [MEMBER_UID, OUTSIDER_UID]) {
    await auth.createUser({ uid: u, email: `${u}@probe.invalid`, password: PW })
  }
  await db.doc(`homes/${HOME}`).set({ name: "rules smoke probe", createdBy: MEMBER_UID })
  await db.doc(`homes/${HOME}/members/${MEMBER_UID}`).set({ uid: MEMBER_UID, role: "owner" })
  await bucket.file(OBJ).save(Buffer.from("probe"), { contentType: "image/jpeg" })
  await bucket.file(LEGACY_OBJ).save(Buffer.from("probe"), { contentType: "application/pdf" })

  const memberTok = await idTokenFor(MEMBER_UID)
  const outsiderTok = await idTokenFor(OUTSIDER_UID)

  // Poll assertion 1 only: it is the one gated on an IAM grant that propagates.
  let a1 = await read(OBJ, memberTok)
  for (let i = 0; a1 !== 200 && i < 12 && !EMULATED; i++) {
    await new Promise((r) => setTimeout(r, 30_000))
    a1 = await read(OBJ, memberTok)
    console.log(`   ...waiting for the cross-service grant to propagate (${i + 1}/12) -> ${a1}`)
  }

  const results = [
    ["1. member reads own home's object          (200)", a1, 200],
    ["2. member reads legacy-path object         (200)", await read(LEGACY_OBJ, memberTok), 200],
    ["3. non-member reads that object            (403)", await read(OBJ, outsiderTok), 403],
    ["4. unauthenticated reads it                (403)", await read(OBJ, null), 403],
    ["5. member uploads into own home            (200)", await upload(MEMBER_UPLOAD, memberTok), 200],
    ["6. non-member uploads under own uid there  (403)", await upload(OUTSIDER_OWN_UID_UPLOAD, outsiderTok), 403],
    ["7. non-member uploads a receipt there      (403)", await upload(OUTSIDER_RECEIPT_UPLOAD, outsiderTok), 403],
  ]
  for (const [label, got, want] of results) {
    const ok = got === want
    if (!ok) failed = true
    console.log(`${ok ? "PASS" : "FAIL"}  ${label}  -> ${got}`)
  }
  console.log(failed
    ? "\nFAILED. If only #1 and #5 failed, the cross-service IAM grant is missing — see\n" +
      "the block comment in storage.rules. Do NOT 'fix' this by widening the rule."
    : `\nAll pass — the tenant gate works for reads and writes against ${EMULATED ? "the emulators" : "the real project"}.`)
} finally {
  await cleanup()
}
process.exit(failed ? 1 : 0)
