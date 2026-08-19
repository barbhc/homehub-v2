/**
 * Firestore security-rules unit tests (Phase 2).
 *
 * Verifies the membership model in docs/firestore-model.md §6 against the emulator:
 * tenant isolation, the assignee-must-be-member guard, role/self-management rules,
 * and the global-catalog server-write lock.
 *
 * Requires the Firestore emulator. Run with:
 *   firebase emulators:exec --only firestore --project demo-homehub-rules 'npm run test:rules'
 * (the `test:rules:emu` npm script wraps this). NOT collected by the default `npm test`
 * (vitest include is scoped to src/**), so a green unit run never depends on a JAR download.
 */
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest"
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing"
import { doc, getDoc, getDocs, collection, setDoc, updateDoc, deleteDoc, writeBatch } from "firebase/firestore"

const __dirname = dirname(fileURLToPath(import.meta.url))

const HOME = "home-1"
const OWNER = "owner-uid"
const MEMBER = "member-uid"
const OUTSIDER = "outsider-uid"
// A home written before `createdBy` existed — proves the new rule locks legacy
// homes down rather than locking their real owners out.
const LEGACY = "home-legacy"

let testEnv: RulesTestEnvironment

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "demo-homehub-rules",
    firestore: {
      rules: readFileSync(resolve(__dirname, "../firestore.rules"), "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  })
})

afterAll(async () => {
  await testEnv?.cleanup()
})

beforeEach(async () => {
  await testEnv.clearFirestore()
  // Seed: HOME with OWNER (role owner) and MEMBER (role member). OUTSIDER is in no home.
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await setDoc(doc(db, `homes/${HOME}`), { name: "Test", timezone: "America/Los_Angeles", createdBy: OWNER, deletedAt: null })
    await setDoc(doc(db, `homes/${HOME}/members/${OWNER}`), { role: "owner", isPrimary: true })
    await setDoc(doc(db, `homes/${HOME}/members/${MEMBER}`), { role: "member", isPrimary: false })
  })
})

const asOwner = () => testEnv.authenticatedContext(OWNER).firestore()
const asMember = () => testEnv.authenticatedContext(MEMBER).firestore()
const asOutsider = () => testEnv.authenticatedContext(OUTSIDER).firestore()
const asAnon = () => testEnv.unauthenticatedContext().firestore()

describe("tenant isolation", () => {
  it("member reads and writes home data", async () => {
    await assertSucceeds(setDoc(doc(asMember(), `homes/${HOME}/items/i1`), { displayName: "Fridge", deletedAt: null }))
    await assertSucceeds(getDoc(doc(asMember(), `homes/${HOME}/items/i1`)))
  })

  it("outsider cannot read or write another home's data", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `homes/${HOME}/items/i1`), { displayName: "Fridge", deletedAt: null })
    })
    await assertFails(getDoc(doc(asOutsider(), `homes/${HOME}/items/i1`)))
    await assertFails(setDoc(doc(asOutsider(), `homes/${HOME}/items/i2`), { displayName: "x", deletedAt: null }))
  })

  it("anonymous is denied everywhere", async () => {
    await assertFails(getDoc(doc(asAnon(), `homes/${HOME}/items/i1`)))
  })

  it("membership gates the manual/chunk subtree", async () => {
    await assertSucceeds(setDoc(doc(asMember(), `homes/${HOME}/manuals/m1/chunks/c1`), { content: "x", deletedAt: null }))
    await assertFails(setDoc(doc(asOutsider(), `homes/${HOME}/manuals/m1/chunks/c2`), { content: "x", deletedAt: null }))
  })
})

describe("assignee-must-be-member guard", () => {
  it("allows a taskInstance assigned to a member", async () => {
    await assertSucceeds(
      setDoc(doc(asMember(), `homes/${HOME}/taskInstances/t1`), {
        taskTemplateId: "tpl", status: "scheduled", dueDate: null, assignedTo: MEMBER, deletedAt: null,
      })
    )
  })

  it("allows an unassigned taskInstance (assignedTo null)", async () => {
    await assertSucceeds(
      setDoc(doc(asMember(), `homes/${HOME}/taskInstances/t2`), {
        taskTemplateId: "tpl", status: "scheduled", dueDate: null, assignedTo: null, deletedAt: null,
      })
    )
  })

  it("rejects a taskInstance assigned to a non-member", async () => {
    await assertFails(
      setDoc(doc(asMember(), `homes/${HOME}/taskInstances/t3`), {
        taskTemplateId: "tpl", status: "scheduled", dueDate: null, assignedTo: OUTSIDER, deletedAt: null,
      })
    )
  })

  it("rejects a taskTemplate defaultAssignee who is not a member", async () => {
    await assertFails(
      setDoc(doc(asMember(), `homes/${HOME}/taskTemplates/tpl1`), {
        title: "x", isActive: true, defaultAssignee: OUTSIDER, deletedAt: null,
      })
    )
  })
})

describe("users self-ownership", () => {
  it("a user writes their own profile but not another's", async () => {
    await assertSucceeds(setDoc(doc(asMember(), `users/${MEMBER}`), { fullName: "Me" }))
    await assertFails(setDoc(doc(asMember(), `users/${OWNER}`), { fullName: "Not me" }))
  })

  it("private prefs are self-only for read", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `users/${OWNER}/private/preferences`), { interfaceLevel: 2 })
    })
    await assertSucceeds(getDoc(doc(asOwner(), `users/${OWNER}/private/preferences`)))
    await assertFails(getDoc(doc(asMember(), `users/${OWNER}/private/preferences`)))
  })
})

describe("global catalog", () => {
  it("is readable by any signed-in user but not client-writable", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `supplyCatalog/s1`), { name: "Filter", category: "filter" })
    })
    await assertSucceeds(getDoc(doc(asMember(), `supplyCatalog/s1`)))
    await assertFails(setDoc(doc(asMember(), `supplyCatalog/s2`), { name: "x", category: "other" }))
  })

  it("server-only caches deny client access entirely", async () => {
    await assertFails(getDoc(doc(asMember(), `webRetrievals/w1`)))
    await assertFails(setDoc(doc(asMember(), `webRetrievals/w1`), { query: "x" }))
  })
})

describe("member management + roles", () => {
  it("a non-owner cannot create another user's member row", async () => {
    await assertFails(setDoc(doc(asMember(), `homes/${HOME}/members/${OUTSIDER}`), { role: "member", isPrimary: false }))
  })

  it("owner can add another member", async () => {
    await assertSucceeds(setDoc(doc(asOwner(), `homes/${HOME}/members/${OUTSIDER}`), { role: "member", isPrimary: false }))
  })

  it("a member cannot self-escalate their role", async () => {
    await assertFails(updateDoc(doc(asMember(), `homes/${HOME}/members/${MEMBER}`), { role: "owner" }))
  })

  it("a member can update non-role fields on their own row", async () => {
    await assertSucceeds(updateDoc(doc(asMember(), `homes/${HOME}/members/${MEMBER}`), { isPrimary: true }))
  })

  it("owner can change another member's role", async () => {
    await assertSucceeds(updateDoc(doc(asOwner(), `homes/${HOME}/members/${MEMBER}`), { role: "admin" }))
  })

  it("self-leave is allowed; removing another member requires owner", async () => {
    await assertSucceeds(deleteDoc(doc(asMember(), `homes/${HOME}/members/${MEMBER}`)))
    // re-seed the removed member for the outsider check
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `homes/${HOME}/members/${MEMBER}`), { role: "member", isPrimary: false })
    })
    await assertFails(deleteDoc(doc(asOutsider(), `homes/${HOME}/members/${MEMBER}`)))
    await assertSucceeds(deleteDoc(doc(asOwner(), `homes/${HOME}/members/${MEMBER}`)))
  })
})

/**
 * Ownership anchoring (the member self-create / owner-escalation fix).
 *
 * Before the fix, `allow create: uid == memberUid || isOwner(homeId)` never
 * consulted the invite and never looked at the home, so any signed-in user who
 * learned a homeId could write their own member row into that home at ANY role.
 * Home IDs are not secret: push deep-links carry ?home=<homeId>, and every
 * current and former member knows one. Each case below was reproduced against
 * the old rules on this emulator before being fixed.
 */
describe("home bootstrap + member self-create (anchored on createdBy)", () => {
  it("createHome's ONE-batch bootstrap still works (home doc + own owner row)", async () => {
    // Mirrors homeService.createHome. The rule uses getAfter() precisely so the
    // home doc written in this same batch is visible to the member-create check;
    // a plain get() would not see it and would break home creation outright.
    const db = asOutsider()
    const batch = writeBatch(db)
    batch.set(doc(db, `homes/new-home`), {
      name: "New", timezone: "America/Los_Angeles", createdBy: OUTSIDER, deletedAt: null,
    })
    batch.set(doc(db, `homes/new-home/members/${OUTSIDER}`), {
      uid: OUTSIDER, role: "owner", isPrimary: true,
    })
    await assertSucceeds(batch.commit())
  })

  it("a home cannot be stamped with someone else's uid as createdBy", async () => {
    const db = asOutsider()
    const batch = writeBatch(db)
    batch.set(doc(db, `homes/forged`), { name: "x", createdBy: OWNER, deletedAt: null })
    batch.set(doc(db, `homes/forged/members/${OUTSIDER}`), { uid: OUTSIDER, role: "owner", isPrimary: true })
    await assertFails(batch.commit())
  })

  it("an outsider who knows a homeId cannot self-join (no invite doc present)", async () => {
    await assertFails(
      setDoc(doc(asOutsider(), `homes/${HOME}/members/${OUTSIDER}`), { uid: OUTSIDER, role: "member", isPrimary: false })
    )
  })

  it("an outsider cannot self-join even with an invite seeded (rules never read it)", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `homes/${HOME}/invites/inv1`), { token: "tok", role: "member" })
    })
    await assertFails(
      setDoc(doc(asOutsider(), `homes/${HOME}/members/${OUTSIDER}`), { uid: OUTSIDER, role: "member", isPrimary: false })
    )
  })

  it("an outsider cannot self-join AS OWNER", async () => {
    await assertFails(
      setDoc(doc(asOutsider(), `homes/${HOME}/members/${OUTSIDER}`), { uid: OUTSIDER, role: "owner", isPrimary: false })
    )
  })

  it("a self-joined outsider therefore cannot reach the home's data", async () => {
    await assertFails(setDoc(doc(asOutsider(), `homes/${HOME}/members/${OUTSIDER}`), { uid: OUTSIDER, role: "owner" }))
    await assertFails(getDoc(doc(asOutsider(), `homes/${HOME}/items/i1`)))
    await assertFails(getDocs(collection(asOutsider(), `homes/${HOME}/rooms`)))
  })

  it("delete-then-recreate cannot escalate a member to owner", async () => {
    // Self-leave stays legitimate...
    await assertSucceeds(deleteDoc(doc(asMember(), `homes/${HOME}/members/${MEMBER}`)))
    // ...but coming back as owner was the proven escalation. Now refused.
    await assertFails(
      setDoc(doc(asMember(), `homes/${HOME}/members/${MEMBER}`), { uid: MEMBER, role: "owner", isPrimary: false })
    )
    // Even rejoining as a plain member is refused — that is acceptInvite's job.
    await assertFails(
      setDoc(doc(asMember(), `homes/${HOME}/members/${MEMBER}`), { uid: MEMBER, role: "member", isPrimary: false })
    )
  })

  it("a non-owner cannot delete the real owner's member row", async () => {
    await assertFails(deleteDoc(doc(asMember(), `homes/${HOME}/members/${OWNER}`)))
    await assertFails(deleteDoc(doc(asOutsider(), `homes/${HOME}/members/${OWNER}`)))
  })

  it("createdBy is immutable — nobody can re-point the anchor, not even the owner", async () => {
    await assertFails(updateDoc(doc(asMember(), `homes/${HOME}`), { createdBy: MEMBER }))
    await assertFails(updateDoc(doc(asOwner(), `homes/${HOME}`), { createdBy: MEMBER }))
  })

  it("ordinary home-profile edits still work (merge carries createdBy through)", async () => {
    await assertSucceeds(setDoc(doc(asMember(), `homes/${HOME}`), { squareFeet: 1200 }, { merge: true }))
  })

  it("only the owner may hard-delete the home", async () => {
    await assertFails(deleteDoc(doc(asMember(), `homes/${HOME}`)))
    await assertFails(deleteDoc(doc(asOutsider(), `homes/${HOME}`)))
    await assertSucceeds(deleteDoc(doc(asOwner(), `homes/${HOME}`)))
  })

  describe("legacy homes (written before createdBy existed)", () => {
    beforeEach(async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        const db = ctx.firestore()
        await setDoc(doc(db, `homes/${LEGACY}`), { name: "Legacy", deletedAt: null })
        await setDoc(doc(db, `homes/${LEGACY}/members/${OWNER}`), { uid: OWNER, role: "owner", isPrimary: false })
      })
    })

    it("admit no self-created member row at all", async () => {
      await assertFails(
        setDoc(doc(asOutsider(), `homes/${LEGACY}/members/${OUTSIDER}`), { uid: OUTSIDER, role: "owner" })
      )
    })

    it("but their real owner is not locked out of editing them", async () => {
      await assertSucceeds(setDoc(doc(asOwner(), `homes/${LEGACY}`), { name: "Renamed" }, { merge: true }))
    })

    it("and createdBy cannot be back-filled from the client", async () => {
      await assertFails(updateDoc(doc(asOwner(), `homes/${LEGACY}`), { createdBy: OWNER }))
    })
  })
})

describe("invites (hardened: members-only; acceptance is server-side)", () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `homes/${HOME}/invites/inv1`), {
        token: "tok", role: "member", createdBy: OWNER, acceptedBy: null,
      })
    })
  })

  it("a member can create, read, and delete invites", async () => {
    await assertSucceeds(getDoc(doc(asMember(), `homes/${HOME}/invites/inv1`)))
    await assertSucceeds(setDoc(doc(asMember(), `homes/${HOME}/invites/inv2`), { token: "t2", role: "member" }))
    await assertSucceeds(deleteDoc(doc(asMember(), `homes/${HOME}/invites/inv2`)))
  })

  it("a signed-in NON-member cannot read invites (no token harvesting)", async () => {
    await assertFails(getDoc(doc(asOutsider(), `homes/${HOME}/invites/inv1`)))
  })

  it("a non-member cannot self-accept by writing acceptedBy (acceptance is the callable's job)", async () => {
    await assertFails(updateDoc(doc(asOutsider(), `homes/${HOME}/invites/inv1`), { acceptedBy: OUTSIDER }))
  })
})

describe("users profile access (get-only; list closed against enumeration)", () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `users/${OWNER}`), { fullName: "Owner O.", avatarUrl: null })
      await setDoc(doc(ctx.firestore(), `users/${MEMBER}`), { fullName: "Member M.", avatarUrl: null })
    })
  })

  it("any signed-in user can GET another user's profile doc (co-member display)", async () => {
    await assertSucceeds(getDoc(doc(asOutsider(), `users/${OWNER}`)))
  })

  it("LISTING the users collection is denied for everyone (no name/avatar enumeration)", async () => {
    await assertFails(getDocs(collection(asOutsider(), "users")))
    await assertFails(getDocs(collection(asOwner(), "users")))
  })

  it("self-write allowed; writing another user's profile denied", async () => {
    await assertSucceeds(setDoc(doc(asOwner(), `users/${OWNER}`), { fullName: "New Name" }))
    await assertFails(setDoc(doc(asMember(), `users/${OWNER}`), { fullName: "Hijack" }))
  })
})

describe("AI usage quota docs (usage/{uid}/daily/{day}) — Admin-SDK-only", () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `usage/${OWNER}/daily/2026-07-21`), { count: 50 })
    })
  })

  it("a user cannot read or reset their own quota counter (no cap bypass)", async () => {
    await assertFails(getDoc(doc(asOwner(), `usage/${OWNER}/daily/2026-07-21`)))
    await assertFails(setDoc(doc(asOwner(), `usage/${OWNER}/daily/2026-07-21`), { count: 0 }))
  })

  it("other users cannot touch it either", async () => {
    await assertFails(getDoc(doc(asMember(), `usage/${OWNER}/daily/2026-07-21`)))
    await assertFails(setDoc(doc(asOutsider(), `usage/${OWNER}/daily/2026-07-21`), { count: 0 }))
  })
})

describe("growth gate (invite codes)", () => {
  const NEWCOMER = "newcomer-uid"
  const asNewcomer = () => testEnv.authenticatedContext(NEWCOMER).firestore()
  const newHome = (db: ReturnType<typeof asNewcomer>, id: string) =>
    setDoc(doc(db, `homes/${id}`), { name: "Theirs", createdBy: NEWCOMER, deletedAt: null })

  const setGate = (on: boolean) =>
    testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "config/growth"), { inviteGateEnabled: on })
    })
  const admit = (uid: string) =>
    testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `admissions/${uid}`), { code: "TESTCODE" })
    })

  it("FAILS OPEN when config/growth does not exist", async () => {
    // Deploying these rules before the flag doc exists must not lock every
    // existing user out of creating a home. The safe direction for a growth
    // throttle, which is not the security boundary — membership is.
    await assertSucceeds(newHome(asNewcomer(), "home-nogate"))
  })

  it("lets anyone create a home while the gate is OFF", async () => {
    await setGate(false)
    await assertSucceeds(newHome(asNewcomer(), "home-gateoff"))
  })

  it("refuses home creation with the gate ON and no admission", async () => {
    await setGate(true)
    await assertFails(newHome(asNewcomer(), "home-blocked"))
  })

  it("allows it once the user has been admitted", async () => {
    await setGate(true)
    await admit(NEWCOMER)
    await assertSucceeds(newHome(asNewcomer(), "home-admitted"))
  })

  it("does not let one user's admission admit another", async () => {
    await setGate(true)
    await admit(OWNER)
    await assertFails(newHome(asNewcomer(), "home-someone-elses-admission"))
  })

  it("still requires createdBy to be the caller, admitted or not", async () => {
    // The gate is additive. It must not become a way around the ownership
    // anchor that tenant isolation depends on.
    await setGate(true)
    await admit(NEWCOMER)
    await assertFails(
      setDoc(doc(asNewcomer(), "homes/home-spoofed"), { name: "X", createdBy: OWNER, deletedAt: null }),
    )
  })

  it("nobody can self-admit", async () => {
    await setGate(true)
    await assertFails(setDoc(doc(asNewcomer(), `admissions/${NEWCOMER}`), { code: "MADEUP" }))
  })

  it("nobody can turn their own gate off", async () => {
    await setGate(true)
    await assertFails(setDoc(doc(asNewcomer(), "config/growth"), { inviteGateEnabled: false }))
  })

  it("invite codes are unreadable and unlistable by clients", async () => {
    // A readable code collection IS a code generator: any signed-in user could
    // list the valid codes and hand them out, and the gate is simply gone.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "inviteCodes/ABCD2345"), { uses: 0, maxUses: 5 })
    })
    await assertFails(getDoc(doc(asNewcomer(), "inviteCodes/ABCD2345")))
    await assertFails(getDocs(collection(asNewcomer(), "inviteCodes")))
    await assertFails(setDoc(doc(asNewcomer(), "inviteCodes/MINE1234"), { uses: 0, maxUses: 999 }))
  })

  it("a user can read their OWN admission but cannot enumerate admissions", async () => {
    await admit(NEWCOMER)
    await assertSucceeds(getDoc(doc(asNewcomer(), `admissions/${NEWCOMER}`)))
    await assertFails(getDoc(doc(asNewcomer(), `admissions/${OWNER}`)))
    await assertFails(getDocs(collection(asNewcomer(), "admissions")))
  })

  it("the gate never touches an EXISTING member's access to their home", async () => {
    // Turning the gate on must not lock out the people already using the app.
    await setGate(true)
    await assertSucceeds(getDoc(doc(asMember(), `homes/${HOME}`)))
    await assertSucceeds(setDoc(doc(asMember(), `homes/${HOME}/items/i-gate`), { displayName: "Kettle", deletedAt: null }))
  })
})
