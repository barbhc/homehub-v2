/**
 * acceptInvite / removeMember integration tests — drive the cores against the
 * Firestore emulator. Cover the guards the security rules delegate here:
 * token/expiry validation on accept, and owner-only + last-owner on remove.
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import { getApps, initializeApp } from "firebase-admin/app"
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore"
import { runAcceptInvite, runRemoveMember } from "../lib/firebase/functions/src/invites/inviteActions.js"

assert.ok(process.env.FIRESTORE_EMULATOR_HOST, "FIRESTORE_EMULATOR_HOST must be set (run via emulators:exec)")
if (getApps().length === 0) initializeApp({ projectId: "demo-homehub" })
const db = getFirestore()

async function seedHome(H, { name = "Test Home" } = {}) {
  await db.doc(`homes/${H}`).set({ name, deletedAt: null })
}
async function seedMember(H, uid, role) {
  await db.doc(`homes/${H}/members/${uid}`).set({ uid, role, isPrimary: role === "owner", joinedAt: FieldValue.serverTimestamp() })
}
async function seedInvite(H, id, { token, role = "member", acceptedBy = null, expiresInMs = 7 * 864e5 }) {
  await db.doc(`homes/${H}/invites/${id}`).set({
    token,
    role,
    createdBy: "owner",
    acceptedBy,
    acceptedAt: null,
    expiresAt: Timestamp.fromMillis(Date.now() + expiresInMs),
    createdAt: FieldValue.serverTimestamp(),
  })
}

// ── acceptInvite ──────────────────────────────────────────────────────────────

test("accept: valid token creates the member doc + marks the invite accepted", async () => {
  const H = "inv-accept"
  await seedHome(H, { name: "Barb's House" })
  await seedMember(H, "owner1", "owner")
  await seedInvite(H, "i1", { token: "tok-valid", role: "admin" })

  const res = await runAcceptInvite(db, "newuser", "tok-valid")
  assert.equal(res.success, true)
  assert.equal(res.home_id, H)
  assert.equal(res.home_name, "Barb's House")
  assert.equal(res.role, "admin")

  const member = await db.doc(`homes/${H}/members/newuser`).get()
  assert.equal(member.exists, true)
  assert.equal(member.get("uid"), "newuser") // required for the collection-group read rule
  assert.equal(member.get("role"), "admin")
  const inv = await db.doc(`homes/${H}/invites/i1`).get()
  assert.equal(inv.get("acceptedBy"), "newuser")
})

test("accept: unknown token fails cleanly (no throw)", async () => {
  const res = await runAcceptInvite(db, "u", "does-not-exist")
  assert.equal(res.success, false)
  assert.ok(res.error)
})

test("accept: already-accepted invite is rejected", async () => {
  const H = "inv-used"
  await seedHome(H)
  await seedInvite(H, "i1", { token: "tok-used", acceptedBy: "someone" })
  const res = await runAcceptInvite(db, "newuser", "tok-used")
  assert.equal(res.success, false)
})

test("accept: expired invite is rejected", async () => {
  const H = "inv-exp"
  await seedHome(H)
  await seedInvite(H, "i1", { token: "tok-exp", expiresInMs: -1000 })
  const res = await runAcceptInvite(db, "newuser", "tok-exp")
  assert.equal(res.success, false)
})

// ── removeMember ────────────────────────────────────────────────────────────────

test("remove: owner removes another member", async () => {
  const H = "rm-owner"
  await seedHome(H)
  await seedMember(H, "owner1", "owner")
  await seedMember(H, "m1", "member")
  const res = await runRemoveMember(db, "owner1", H, "m1")
  assert.equal(res.success, true)
  assert.equal((await db.doc(`homes/${H}/members/m1`).get()).exists, false)
})

test("remove: a non-owner cannot remove another member", async () => {
  const H = "rm-nonowner"
  await seedHome(H)
  await seedMember(H, "owner1", "owner")
  await seedMember(H, "m1", "member")
  await seedMember(H, "m2", "member")
  const res = await runRemoveMember(db, "m1", H, "m2")
  assert.equal(res.success, false)
  assert.equal((await db.doc(`homes/${H}/members/m2`).get()).exists, true)
})

test("remove: self-leave is allowed", async () => {
  const H = "rm-self"
  await seedHome(H)
  await seedMember(H, "owner1", "owner")
  await seedMember(H, "m1", "member")
  const res = await runRemoveMember(db, "m1", H, "m1")
  assert.equal(res.success, true)
})

test("remove: the last owner cannot be removed", async () => {
  const H = "rm-lastowner"
  await seedHome(H)
  await seedMember(H, "owner1", "owner")
  const res = await runRemoveMember(db, "owner1", H, "owner1")
  assert.equal(res.success, false)
  assert.equal((await db.doc(`homes/${H}/members/owner1`).get()).exists, true)
})
