/**
 * membership gate tests — hasAnyMembership / requireAnyMembership against the
 * Firestore emulator. This is the denial path that stops anonymous (or any
 * member-less) tokens from burning the paid AI/Brave/proxy functions.
 *
 * NOTE: the emulator does not enforce indexes, so this proves the LOGIC only;
 * the members.uid COLLECTION_GROUP fieldOverride (firestore.indexes.json) is
 * what makes the query legal in prod — scripts/ops/prod-smoke.ts checks that.
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import { getApps, initializeApp } from "firebase-admin/app"
import { getFirestore, FieldValue } from "firebase-admin/firestore"
import { hasAnyMembership, requireAnyMembership } from "../lib/firebase/functions/src/lib/membership.js"

assert.ok(process.env.FIRESTORE_EMULATOR_HOST, "FIRESTORE_EMULATOR_HOST must be set (run via emulators:exec)")
if (getApps().length === 0) initializeApp({ projectId: "demo-homehub" })
const db = getFirestore()

test("fresh uid (e.g. anonymous) has no membership → gate denies", async () => {
  assert.equal(await hasAnyMembership(db, "anon-fresh-uid"), false)
  await assert.rejects(
    () => requireAnyMembership(db, "anon-fresh-uid"),
    (err) => {
      assert.match(String(err.code ?? err.message), /permission-denied/)
      return true
    }
  )
})

test("uid with a member doc passes the gate", async () => {
  const H = "membership-home"
  await db.doc(`homes/${H}`).set({ name: "Gate Home", deletedAt: null })
  await db.doc(`homes/${H}/members/member-uid-1`).set({
    uid: "member-uid-1",
    role: "owner",
    isPrimary: true,
    joinedAt: FieldValue.serverTimestamp(),
  })
  assert.equal(await hasAnyMembership(db, "member-uid-1"), true)
  await requireAnyMembership(db, "member-uid-1") // must not throw
})

test("membership in ANY home suffices (collection-group semantics)", async () => {
  const H2 = "membership-home-2"
  await db.doc(`homes/${H2}`).set({ name: "Second Home", deletedAt: null })
  await db.doc(`homes/${H2}/members/multi-uid`).set({ uid: "multi-uid", role: "member", isPrimary: false })
  assert.equal(await hasAnyMembership(db, "multi-uid"), true)
})
