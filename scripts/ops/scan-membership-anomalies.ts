/**
 * scan-membership-anomalies — READ-ONLY. Run it against production BEFORE
 * deploying the firestore.rules that pin member uids, restrict invite roles and
 * make the growth gate fail closed. Those rules stop NEW bad writes; they do not
 * repair rows that already exist, and one of them changes behaviour the moment
 * it lands if config/growth is missing. This lists what to look at first.
 *
 *   1. Member docs whose `uid` ≠ their doc id — the planted-pointer shape. The
 *      victim's lookup finds the row; the home read is refused. Delete them.
 *   2. Member docs with NO `uid` — invisible to the membership lookup, and the
 *      new rules refuse any client update of them. Stamp uid = doc id.
 *   3. Owners per home — 0 owners (nobody can manage members; clients can no
 *      longer delete or add owner rows), unknown roles, and owners who are not
 *      the home's createdBy (a co-owner by invite — or an escalation).
 *   4. Pending invites (unaccepted, unexpired) with a privileged role, the
 *      creator's CURRENT role, and what accepting would now confer.
 *   5. config/growth — whether the fail-closed gate changes anything at deploy.
 *
 * It never writes. Env, same as scripts/parse-eval/graduation.ts:
 *   prod:     GOOGLE_APPLICATION_CREDENTIALS + FIREBASE_PROJECT_ID (required)
 *   emulator: FIRESTORE_EMULATOR_HOST (+ GCLOUD_PROJECT, default demo-homehub)
 *
 *   FIREBASE_PROJECT_ID=homehub-2068d npx tsx scripts/ops/scan-membership-anomalies.ts
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npx tsx scripts/ops/scan-membership-anomalies.ts
 *
 * Exit: 0 = nothing to act on · 1 = at least one ✖ line · 2 = the scan failed.
 * `?` lines are for a human to judge and do not fail the scan.
 */
import { initializeApp, applicationDefault, getApps } from "firebase-admin/app"
import { getFirestore, type DocumentSnapshot, type Timestamp } from "firebase-admin/firestore"
import { effectiveInviteRole, isHomeRole, isOpenInviteRole } from "../../shared/home/roles.js"
import { growthGateOn } from "../../shared/growth/gate.js"

const EMULATOR = process.env.FIRESTORE_EMULATOR_HOST
const PROJECT = EMULATOR
  ? process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || "demo-homehub"
  : process.env.FIREBASE_PROJECT_ID
if (!PROJECT) {
  // No silent default for production: a scan of a project that doesn't exist
  // would print "nothing found" and look like a pass.
  console.error("FIREBASE_PROJECT_ID is required outside the emulator (e.g. homehub-2068d).")
  process.exit(2)
}
if (getApps().length === 0) {
  initializeApp(EMULATOR ? { projectId: PROJECT } : { credential: applicationDefault(), projectId: PROJECT })
}
const db = getFirestore()

let actions = 0
let reviews = 0
const act = (msg: string) => { actions++; console.log(`   ✖ ${msg}`) }
const review = (msg: string) => { reviews++; console.log(`   ? ${msg}`) }
const ok = (msg: string) => console.log(`   ✓ ${msg}`)
const info = (msg: string) => console.log(`   · ${msg}`)

type Member = { path: string; homeId: string; docId: string; uid: unknown; role: unknown; isPrimary: unknown }

async function main(): Promise<void> {
  console.log("\n━━ membership anomaly scan ━━ (read-only)")
  console.log(EMULATOR ? `Target: EMULATOR ${EMULATOR} (project ${PROJECT})\n` : `Target: PRODUCTION project ${PROJECT}\n`)

  const memberSnap = await db.collectionGroup("members").get()
  const members: Member[] = memberSnap.docs.flatMap((d) => {
    const homeRef = d.ref.parent.parent
    // Only homes/{homeId}/members/{uid} — ignore any other "members" subcollection.
    if (!homeRef || homeRef.parent.id !== "homes") return []
    return [{ path: d.ref.path, homeId: homeRef.id, docId: d.id, uid: d.get("uid"), role: d.get("role"), isPrimary: d.get("isPrimary") }]
  })
  console.log(`Scanned ${members.length} member doc(s).\n`)

  // ── 1 + 2: the uid field ────────────────────────────────────────────────────
  console.log("1. member docs whose uid ≠ doc id (planted pointers — delete them)")
  const mismatched = members.filter((m) => m.uid != null && m.uid !== m.docId)
  if (mismatched.length === 0) ok("none")
  for (const m of mismatched) {
    act(`${m.path}  uid=${String(m.uid)}  role=${String(m.role)}  isPrimary=${String(m.isPrimary)}`)
  }

  console.log("\n2. member docs with no uid (invisible to the lookup; rules now refuse their updates — stamp uid = doc id)")
  const missingUid = members.filter((m) => m.uid == null)
  if (missingUid.length === 0) ok("none")
  for (const m of missingUid) act(`${m.path}  role=${String(m.role)}`)

  // ── 3: owners per home ──────────────────────────────────────────────────────
  console.log("\n3. owners per home")
  const byHome = new Map<string, Member[]>()
  for (const m of members) byHome.set(m.homeId, [...(byHome.get(m.homeId) ?? []), m])
  const homeIds = [...byHome.keys()].sort()
  const homeDocs = new Map<string, DocumentSnapshot>()
  if (homeIds.length > 0) {
    const snaps = await db.getAll(...homeIds.map((id) => db.doc(`homes/${id}`)))
    for (const s of snaps) homeDocs.set(s.id, s)
  }
  for (const homeId of homeIds) {
    const home = homeDocs.get(homeId)
    const rows = byHome.get(homeId) ?? []
    const label = `home ${homeId}${home?.exists ? ` "${String(home.get("name") ?? "")}"` : " (NO HOME DOC)"}${home?.get("deletedAt") != null ? " [soft-deleted]" : ""}`
    const owners = rows.filter((m) => m.role === "owner")
    const createdBy = home?.get("createdBy") as unknown
    for (const m of rows.filter((r) => !isHomeRole(r.role))) review(`${label}: ${m.path} has unknown role ${JSON.stringify(m.role)}`)
    if (owners.length === 0) {
      act(`${label}: 0 owners among ${rows.length} member(s) — nobody can manage its members`)
      continue
    }
    const strangers = createdBy == null ? [] : owners.filter((o) => o.docId !== createdBy)
    if (createdBy == null) {
      review(`${label}: ${owners.length} owner(s) [${owners.map((o) => o.docId).join(", ")}], no createdBy to check them against (pre-anchor or imported home)`)
    } else if (strangers.length > 0) {
      review(`${label}: owner(s) ${strangers.map((o) => o.docId).join(", ")} are not the creator (${String(createdBy)}) — a co-owner by invite, or an escalation?`)
    } else {
      ok(`${label}: ${owners.length} owner(s), the creator`)
    }
  }
  if (homeIds.length === 0) ok("no homes with members")

  // ── 4: pending privileged invites ───────────────────────────────────────────
  console.log("\n4. pending invites with a privileged role")
  const roleIn = new Map(members.map((m) => [`${m.homeId}/${m.docId}`, m.role]))
  const inviteSnap = await db.collectionGroup("invites").get()
  const now = Date.now()
  let pending = 0
  let pendingAdmin = 0
  let flagged = 0
  for (const d of inviteSnap.docs) {
    const homeRef = d.ref.parent.parent
    if (!homeRef || homeRef.parent.id !== "homes") continue
    const expiresAt = d.get("expiresAt") as Timestamp | undefined
    if (d.get("acceptedBy") || (expiresAt && expiresAt.toMillis() < now)) continue
    pending++
    const role = d.get("role") as unknown
    if (isOpenInviteRole(role)) continue
    const createdBy = d.get("createdBy") as unknown
    const creatorRole = typeof createdBy === "string" ? roleIn.get(`${homeRef.id}/${createdBy}`) : undefined
    const confers = effectiveInviteRole(role, creatorRole)
    if (role === "admin" && confers !== "owner") { pendingAdmin++; continue }
    flagged++
    const line = `${d.ref.path}  role=${JSON.stringify(role)}  createdBy=${String(createdBy)} (now: ${String(creatorRole ?? "not a member")})  → accepting now confers ${confers}`
    if (role === "owner" && creatorRole !== "owner") act(`${line} — written by a non-owner; revoke it`)
    else review(`${line} — expected?`)
  }
  if (flagged === 0) ok(`none among ${pending} pending invite(s)`)
  if (pendingAdmin > 0) info(`${pendingAdmin} pending "admin" invite(s) — the old client default; a label with no power, conferred only when the creator is an owner`)

  // ── 5: growth gate ──────────────────────────────────────────────────────────
  console.log("\n5. growth gate (config/growth)")
  const cfg = await db.doc("config/growth").get()
  const flag = cfg.get("inviteGateEnabled") as unknown
  const on = growthGateOn({ exists: cfg.exists, inviteGateEnabled: flag })
  if (!cfg.exists) {
    act("config/growth is MISSING. The old rules read that as gate OFF; the new rules read it as ON — after deploy, only admitted users can create a home. Decide first: `npx tsx scripts/ops/invite-codes.ts off` (or `on`).")
  } else if (typeof flag !== "boolean") {
    act(`config/growth.inviteGateEnabled is ${JSON.stringify(flag)}, not a boolean. The old rules read that as OFF; the new rules read it as ON. Set it explicitly with invite-codes.ts on|off.`)
  } else {
    ok(`inviteGateEnabled=${flag} → gate ${on ? "ON" : "OFF"}; the new rules read it the same way`)
  }

  console.log(`\n${actions} to act on (✖), ${reviews} to review (?).`)
  process.exitCode = actions > 0 ? 1 : 0
}

main().catch((e) => {
  console.error("\n✖ scan failed:", e instanceof Error ? e.message : e)
  process.exit(2)
})
