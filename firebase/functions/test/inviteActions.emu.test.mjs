/**
 * acceptInvite / removeMember integration tests — drive the cores against the
 * Firestore emulator. Cover the guards the security rules delegate here:
 * token/expiry validation on accept, and owner-only + last-owner on remove.
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import { getApps, initializeApp } from "firebase-admin/app"
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore"
import { runAcceptInvite, runRemoveMember, runGetInviteDetails } from "../lib/firebase/functions/src/invites/inviteActions.js"

assert.ok(process.env.FIRESTORE_EMULATOR_HOST, "FIRESTORE_EMULATOR_HOST must be set (run via emulators:exec)")
if (getApps().length === 0) initializeApp({ projectId: "demo-homehub" })
const db = getFirestore()

async function seedHome(H, { name = "Test Home" } = {}) {
  await db.doc(`homes/${H}`).set({ name, deletedAt: null })
}
async function seedMember(H, uid, role) {
  await db.doc(`homes/${H}/members/${uid}`).set({ uid, role, isPrimary: role === "owner", joinedAt: FieldValue.serverTimestamp() })
}
async function seedInvite(H, id, { token, role = "member", createdBy = "owner", acceptedBy = null, expiresInMs = 7 * 864e5 }) {
  await db.doc(`homes/${H}/invites/${id}`).set({
    token,
    role,
    createdBy,
    acceptedBy,
    acceptedAt: null,
    expiresAt: Timestamp.fromMillis(Date.now() + expiresInMs),
    createdAt: FieldValue.serverTimestamp(),
  })
}
const roleOf = async (H, uid) => (await db.doc(`homes/${H}/members/${uid}`).get()).get("role")

// ── acceptInvite ──────────────────────────────────────────────────────────────

test("accept: valid token creates the member doc + marks the invite accepted", async () => {
  const H = "inv-accept"
  await seedHome(H, { name: "Barb's House" })
  await seedMember(H, "owner1", "owner")
  // createdBy is the home's owner: a privileged role is honoured only when the
  // invite's creator is an owner at accept time (was createdBy "owner", a uid
  // that is not a member of this home — that invite would now confer "member").
  await seedInvite(H, "i1", { token: "tok-valid", role: "admin", createdBy: "owner1" })

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

// B1 — the self-accept escalation. A member writes (or, before the rules fix,
// was able to write) an owner invite and accepts it with the SAME account. The
// old set(..., {merge:true}) re-roled their existing row to owner.
test("accept: an EXISTING member is refused, and their role is untouched", async () => {
  const H = "inv-self-accept"
  await seedHome(H)
  await seedMember(H, "owner1", "owner")
  await seedMember(H, "m1", "member")
  await seedInvite(H, "i1", { token: "tok-self", role: "owner", createdBy: "m1" })

  const res = await runAcceptInvite(db, "m1", "tok-self")
  assert.equal(res.success, false)
  assert.match(res.error, /already a member/i)
  assert.equal(await roleOf(H, "m1"), "member")
  // Refused before any write: the invite is still unspent.
  assert.equal((await db.doc(`homes/${H}/invites/i1`).get()).get("acceptedBy"), null)
})

test("accept: an owner opening their OWN link stays owner (never downgraded)", async () => {
  // The old merge re-roled them to the invite's role ("admin" by default) —
  // and a sole owner left the home with none.
  const H = "inv-owner-own-link"
  await seedHome(H)
  await seedMember(H, "owner1", "owner")
  await seedInvite(H, "i1", { token: "tok-own", role: "admin", createdBy: "owner1" })

  const res = await runAcceptInvite(db, "owner1", "tok-own")
  assert.equal(res.success, false)
  assert.equal(await roleOf(H, "owner1"), "owner")
})

test("accept: a privileged role on an invite a NON-owner wrote is clamped to member", async () => {
  // e.g. an owner invite planted before the rules refused it, spent by a
  // second account.
  const H = "inv-planted"
  await seedHome(H)
  await seedMember(H, "owner1", "owner")
  await seedMember(H, "m1", "member")
  await seedInvite(H, "i1", { token: "tok-planted", role: "owner", createdBy: "m1" })

  const res = await runAcceptInvite(db, "second-account", "tok-planted")
  assert.equal(res.success, true)
  assert.equal(res.role, "member")
  assert.equal(await roleOf(H, "second-account"), "member")
})

test("accept: the creator's role is judged NOW — demoted or removed creators confer member", async () => {
  const H = "inv-stale-creator"
  await seedHome(H)
  await seedMember(H, "owner1", "owner")
  await seedMember(H, "ex-owner", "member") // was an owner when they wrote i1
  await seedInvite(H, "i1", { token: "tok-demoted", role: "owner", createdBy: "ex-owner" })
  await seedInvite(H, "i2", { token: "tok-removed", role: "owner", createdBy: "long-gone" })

  assert.equal((await runAcceptInvite(db, "u-a", "tok-demoted")).role, "member")
  assert.equal((await runAcceptInvite(db, "u-b", "tok-removed")).role, "member")
  assert.equal(await roleOf(H, "u-a"), "member")
  assert.equal(await roleOf(H, "u-b"), "member")
})

test("accept: an owner's co-owner invite is honoured (the legitimate privileged path)", async () => {
  const H = "inv-coowner"
  await seedHome(H)
  await seedMember(H, "owner1", "owner")
  await seedInvite(H, "i1", { token: "tok-coowner", role: "owner", createdBy: "owner1" })

  const res = await runAcceptInvite(db, "partner", "tok-coowner")
  assert.equal(res.success, true)
  assert.equal(res.role, "owner")
  assert.equal(await roleOf(H, "partner"), "owner")
})

test("accept: unknown roles and junk createdBy never pass through (and never throw)", async () => {
  const H = "inv-junk"
  await seedHome(H)
  await seedMember(H, "owner1", "owner")
  await seedInvite(H, "i1", { token: "tok-junk-role", role: "superuser", createdBy: "owner1" })
  await seedInvite(H, "i2", { token: "tok-junk-creator", role: "owner", createdBy: "owner1/../../x" })

  assert.equal((await runAcceptInvite(db, "u-c", "tok-junk-role")).role, "member")
  assert.equal((await runAcceptInvite(db, "u-d", "tok-junk-creator")).role, "member")
})

test("accept: two people racing for ONE invite — exactly one gets in", async () => {
  const H = "inv-race"
  await seedHome(H)
  await seedMember(H, "owner1", "owner")
  await seedInvite(H, "i1", { token: "tok-race", role: "member", createdBy: "owner1" })

  const results = await Promise.all([runAcceptInvite(db, "racer-1", "tok-race"), runAcceptInvite(db, "racer-2", "tok-race")])
  assert.equal(results.filter((r) => r.success).length, 1)
  const joined = await Promise.all(["racer-1", "racer-2"].map(async (u) => (await db.doc(`homes/${H}/members/${u}`).get()).exists))
  assert.equal(joined.filter(Boolean).length, 1)
})

// ── getInviteDetails ────────────────────────────────────────────────────────────

test("details: valid token returns sanitized home + creator + role", async () => {
  const H = "inv-details"
  await seedHome(H, { name: "Cliffside" })
  await db.doc(`users/owner`).set({ fullName: "Barb C" })
  // The creator must be an owner of THIS home for "admin" to be the role the
  // page promises — details now reports what accepting would actually confer.
  await seedMember(H, "owner", "owner")
  await seedInvite(H, "i1", { token: "tok-details", role: "admin" })

  const res = await runGetInviteDetails(db, "tok-details")
  assert.equal(res.found, true)
  assert.equal(res.home_id, H)
  assert.equal(res.home_name, "Cliffside")
  assert.equal(res.role, "admin")
  assert.equal(res.accepted, false)
  assert.equal(res.creator_name, "Barb C")
})

test("details: unknown token returns not-found (no throw)", async () => {
  const res = await runGetInviteDetails(db, "nope")
  assert.equal(res.found, false)
})

test("details: an accepted invite reports accepted:true", async () => {
  const H = "inv-details-used"
  await seedHome(H)
  await seedInvite(H, "i1", { token: "tok-details-used", acceptedBy: "someone" })
  const res = await runGetInviteDetails(db, "tok-details-used")
  assert.equal(res.found, true)
  assert.equal(res.accepted, true)
})

test("details: reports the role accepting would CONFER, not the stored field", async () => {
  const H = "inv-details-clamp"
  await seedHome(H)
  await seedMember(H, "m1", "member")
  await seedInvite(H, "i1", { token: "tok-details-clamp", role: "owner", createdBy: "m1" })
  const res = await runGetInviteDetails(db, "tok-details-clamp")
  assert.equal(res.role, "member")
})

test("details: tells an existing member they are already in (and nobody else)", async () => {
  const H = "inv-details-member"
  await seedHome(H)
  await seedMember(H, "owner1", "owner")
  await seedInvite(H, "i1", { token: "tok-details-member", createdBy: "owner1" })
  assert.equal((await runGetInviteDetails(db, "tok-details-member", "owner1")).already_member, true)
  assert.equal((await runGetInviteDetails(db, "tok-details-member", "stranger")).already_member, false)
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

test("remove: an owner may remove a co-owner while another owner remains (control)", async () => {
  const H = "rm-coowner"
  await seedHome(H)
  await seedMember(H, "owner1", "owner")
  await seedMember(H, "owner2", "owner")
  assert.equal((await runRemoveMember(db, "owner1", H, "owner2")).success, true)
  assert.equal((await db.doc(`homes/${H}/members/owner2`).get()).exists, false)
})

test("remove: two owners removing EACH OTHER at once leave the home with an owner", async () => {
  // Outside a transaction both read "2 owners", both deletes pass, and the
  // home ends with none. The count now runs inside the transaction.
  const H = "rm-mutual"
  await seedHome(H)
  await seedMember(H, "owner1", "owner")
  await seedMember(H, "owner2", "owner")
  // allSettled: the loser of the lock contention may come back as a rejected
  // transaction (the emulator reports "Transaction is invalid or closed") —
  // the caller sees an error, which is fine. What must never happen is both
  // succeeding.
  const settled = await Promise.allSettled([
    runRemoveMember(db, "owner1", H, "owner2"),
    runRemoveMember(db, "owner2", H, "owner1"),
  ])
  const succeeded = settled.filter((s) => s.status === "fulfilled" && s.value.success).length
  assert.ok(succeeded <= 1, `both removals reported success: ${JSON.stringify(settled)}`)
  const owners = await db.collection(`homes/${H}/members`).where("role", "==", "owner").get()
  assert.ok(owners.size >= 1, `expected an owner to survive, found ${owners.size}`)
})
