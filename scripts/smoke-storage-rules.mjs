/**
 * Post-deploy smoke check for the Storage tenant gate. REQUIRED after any
 * `firebase deploy --only storage` — see docs/launch-readiness.md.
 *
 * Why this exists as a script and not a rules test: the gate is
 * `firestore.exists(...)`, a CROSS-SERVICE call, and it depends on an IAM grant
 * that lives outside the repo entirely. Deploying correct rules to a project
 * missing that grant produces rules that read correctly, compile correctly, and
 * deny every caller — members included. That is not hypothetical: it happened on
 * 19 Aug 2026 and this script is what caught it (see the block comment in
 * storage.rules for the grant).
 *
 * It creates two throwaway users, a synthetic home, and two objects under
 * synthetic paths, asserts the four cases below, then deletes all of it. It
 * never reads, lists, or touches real user content.
 *
 *   1. a member reads their own home's object      -> 200
 *   2. a member reads a legacy-path object         -> 200  (legacy clause intact)
 *   3. a signed-in NON-member reads that object    -> 403  (tenant gate)
 *   4. an unauthenticated caller reads it          -> 403  (no public reads)
 *
 * Assertion 1 polls: an IAM change takes up to a few minutes to reach the Rules
 * evaluator, so a single early miss is not a failure.
 *
 * Usage (needs application-default credentials for the target project):
 *   WEB_API_KEY=<VITE_FIREBASE_API_KEY> npm run smoke:storage
 */
import { initializeApp, applicationDefault } from "firebase-admin/app"
import { getAuth } from "firebase-admin/auth"
import { getFirestore } from "firebase-admin/firestore"
import { getStorage } from "firebase-admin/storage"

const PROJECT = process.env.SMOKE_PROJECT ?? "homehub-2068d"
const BUCKET = process.env.SMOKE_BUCKET ?? `${PROJECT}.firebasestorage.app`
const API_KEY = process.env.WEB_API_KEY
if (!API_KEY) {
  console.error("WEB_API_KEY is required (the project's VITE_FIREBASE_API_KEY).")
  process.exit(2)
}

// `zz-` prefixed so they sort away from real data and are obvious in a console.
const HOME = "zz-rulesprobe-home"
const MEMBER_UID = "zz-rulesprobe-member"
const OUTSIDER_UID = "zz-rulesprobe-outsider"
const OBJ = `homes/${HOME}/photos/${MEMBER_UID}/probeitem/photo.jpg`
const LEGACY_OBJ = `zz-rulesprobe-legacy/probeitem/manual_1.pdf`
const PW = "Pr0be-rules-check-2026"

initializeApp({ credential: applicationDefault(), projectId: PROJECT, storageBucket: BUCKET })
const auth = getAuth(), db = getFirestore(), bucket = getStorage().bucket()

/** Password sign-in, not createCustomToken: local user ADC has no signing key. */
const idTokenFor = async (uid) => {
  const r = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`,
    { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: `${uid}@probe.invalid`, password: PW, returnSecureToken: true }) })
  const j = await r.json()
  if (!j.idToken) throw new Error("sign-in failed: " + JSON.stringify(j).slice(0, 200))
  return j.idToken
}

const read = async (path, token) => {
  const r = await fetch(
    `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(path)}?alt=media`,
    { headers: token ? { Authorization: `Firebase ${token}` } : {} })
  return r.status
}

const cleanup = async () => {
  await bucket.file(OBJ).delete({ ignoreNotFound: true }).catch(() => {})
  await bucket.file(LEGACY_OBJ).delete({ ignoreNotFound: true }).catch(() => {})
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
  for (let i = 0; a1 !== 200 && i < 12; i++) {
    await new Promise((r) => setTimeout(r, 30_000))
    a1 = await read(OBJ, memberTok)
    console.log(`   ...waiting for the cross-service grant to propagate (${i + 1}/12) -> ${a1}`)
  }

  const results = [
    ["1. member reads own home's object   (200)", a1, 200],
    ["2. member reads legacy-path object  (200)", await read(LEGACY_OBJ, memberTok), 200],
    ["3. non-member reads that object     (403)", await read(OBJ, outsiderTok), 403],
    ["4. unauthenticated reads it         (403)", await read(OBJ, null), 403],
  ]
  for (const [label, got, want] of results) {
    const ok = got === want
    if (!ok) failed = true
    console.log(`${ok ? "PASS" : "FAIL"}  ${label}  -> ${got}`)
  }
  console.log(failed
    ? "\nFAILED. If only #1 failed, the cross-service IAM grant is missing — see the\n" +
      "block comment in storage.rules. Do NOT 'fix' this by widening the rule."
    : "\nAll pass — the tenant gate works against the real project.")
} finally {
  await cleanup()
}
process.exit(failed ? 1 : 0)
