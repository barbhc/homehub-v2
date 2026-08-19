/**
 * Mint, list and revoke invite codes; turn the growth gate on and off.
 *
 * Admin SDK only — inviteCodes/ and config/growth are closed to every client,
 * so this script is the whole management surface. Deliberately a script rather
 * than an admin UI: an admin UI is a thing to secure, and this gate is expected
 * to be switched off within a few weeks.
 *
 *   npx tsx scripts/ops/invite-codes.ts on          # turn the gate ON
 *   npx tsx scripts/ops/invite-codes.ts off         # turn it OFF (no deploy)
 *   npx tsx scripts/ops/invite-codes.ts status
 *   npx tsx scripts/ops/invite-codes.ts mint 5 --uses=1 --days=30 --note="round 1"
 *   npx tsx scripts/ops/invite-codes.ts list
 *   npx tsx scripts/ops/invite-codes.ts revoke ABCD2345
 *
 * Env: GOOGLE_APPLICATION_CREDENTIALS + FIREBASE_PROJECT_ID (same as the other
 * ops scripts), or FIRESTORE_EMULATOR_HOST + GCLOUD_PROJECT for a dry run.
 */
import { db as firestore } from "../import/lib/target.js"
import { generateCode, normalizeCode } from "../../shared/growth/inviteCode.js"

const db = firestore()
const [cmd, ...rest] = process.argv.slice(2)
const flag = (k: string, d?: string) => rest.find((a) => a.startsWith(`--${k}=`))?.split("=")[1] ?? d

async function setGate(on: boolean) {
  await db.doc("config/growth").set({ inviteGateEnabled: on, updatedAt: new Date() }, { merge: true })
  console.log(
    on
      ? "Gate ON — a new user now needs a code before they can create a home.\n" +
        "Existing users are unaffected: they already have one."
      : "Gate OFF — anyone who signs up can create a home.\n" +
        "Existing codes and admissions are left in place, so turning it back on resumes where it left off.",
  )
}

async function status() {
  const cfg = await db.doc("config/growth").get()
  const on = cfg.exists && cfg.get("inviteGateEnabled") === true
  const codes = await db.collection("inviteCodes").get()
  const admissions = await db.collection("admissions").get()
  const live = codes.docs.filter((d: FirebaseFirestore.QueryDocumentSnapshot) => {
    const exp = d.get("expiresAt")
    const max = d.get("maxUses") ?? 1
    return !d.get("disabled") && (d.get("uses") ?? 0) < max && (!exp || exp > Date.now())
  })
  console.log(`gate:        ${on ? "ON" : "OFF"}`)
  console.log(`codes:       ${codes.size} total, ${live.length} still usable`)
  console.log(`admitted:    ${admissions.size} users`)
  if (!on && admissions.size > 0) {
    console.log(`\nNote: the gate is off, so those ${admissions.size} admissions are not doing anything right now.`)
  }
}

async function mint(n: number) {
  const maxUses = Number(flag("uses", "1"))
  const days = flag("days")
  const note = flag("note", "")
  const expiresAt = days ? Date.now() + Number(days) * 86_400_000 : null
  if (!Number.isInteger(maxUses) || maxUses < 1) throw new Error("--uses must be a positive integer")

  const made: string[] = []
  for (let i = 0; i < n; i++) {
    // Retry on collision rather than trusting 28^8: a duplicate would silently
    // overwrite a live code's use count and let it be redeemed again.
    let code = generateCode()
    for (let tries = 0; tries < 5; tries++) {
      const existing = await db.doc(`inviteCodes/${code}`).get()
      if (!existing.exists) break
      code = generateCode()
    }
    await db.doc(`inviteCodes/${code}`).create({
      uses: 0,
      maxUses,
      expiresAt,
      disabled: false,
      note,
      createdAt: new Date(),
    })
    made.push(code)
  }
  console.log(made.join("\n"))
  console.log(
    `\n${made.length} code(s), ${maxUses} use(s) each` +
      (expiresAt ? `, expiring ${new Date(expiresAt).toDateString()}` : ", no expiry") +
      (note ? `, note "${note}"` : ""),
  )
}

async function list() {
  const snap = await db.collection("inviteCodes").orderBy("createdAt", "desc").get()
  if (snap.empty) return console.log("no codes yet — `mint 5` to make some")
  for (const d of snap.docs) {
    const exp = d.get("expiresAt")
    const state = d.get("disabled")
      ? "revoked"
      : exp && exp <= Date.now()
        ? "expired"
        : (d.get("uses") ?? 0) >= (d.get("maxUses") ?? 1)
          ? "used up"
          : "live"
    console.log(
      `${d.id}  ${String(state).padEnd(8)} ${d.get("uses") ?? 0}/${d.get("maxUses") ?? 1}` +
        `${exp ? `  until ${new Date(exp).toDateString()}` : ""}` +
        `${d.get("note") ? `  ${d.get("note")}` : ""}`,
    )
  }
}

async function revoke(raw: string) {
  const code = normalizeCode(raw)
  const ref = db.doc(`inviteCodes/${code}`)
  if (!(await ref.get()).exists) throw new Error(`no such code: ${code}`)
  // Disabled, not deleted: `uses` and `note` are the only record of who was let
  // in with what, and deleting also frees the string to be minted again.
  await ref.set({ disabled: true, revokedAt: new Date() }, { merge: true })
  console.log(`${code} revoked. Anyone already admitted with it stays admitted.`)
}

const run = async () => {
  switch (cmd) {
    case "on": return setGate(true)
    case "off": return setGate(false)
    case "status": return status()
    case "mint": return mint(Number(rest[0] ?? 1))
    case "list": return list()
    case "revoke": return revoke(rest[0] ?? "")
    default:
      console.error("usage: on | off | status | mint <n> [--uses=1] [--days=30] [--note=…] | list | revoke <code>")
      process.exit(2)
  }
}
run().then(() => process.exit(0)).catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
