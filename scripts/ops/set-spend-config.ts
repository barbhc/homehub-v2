/**
 * set-spend-config — read and write the AI spend caps (`config/spend`).
 *
 * The caps are a Firestore document read inside every quota charge
 * (shared/quota/policy.ts has the full story): changing one is a document
 * write, not a deploy, and `monthlyCeilingUnits: 0` stops every paid AI call
 * in the app on its next request. No client can read or write the document
 * (firestore.rules), so this script — Admin SDK — is the whole management
 * surface.
 *
 * TARGET — the local emulator unless told otherwise:
 *   default   FIRESTORE_EMULATOR_HOST (127.0.0.1:8080) + FIREBASE_AUTH_EMULATOR_HOST
 *             (127.0.0.1:9099), project demo-homehub
 *   --prod --project=homehub-2068d
 *             production, via Application Default Credentials
 *             (`gcloud auth application-default login`). Both flags are
 *             required, and the emulator env vars must be unset.
 *
 * COMMANDS
 *   show                      print the document and what each charge will use
 *   apply [flags]             write the full document (the plan's numbers by default):
 *       --monthly=1500 --daily=50 --scans=50
 *       --owner-email=bcworkrelated@gmail.com --owner-daily=1000   (the owner's uid is
 *            looked up by email here, never hard-coded in functions code)
 *       --override=<uid>:<units>   (repeatable) another per-user daily limit
 *       --no-owner                 skip the owner lookup (e.g. an emulator without that account)
 *       --replace-overrides        drop overrides not named in this run (default: keep them)
 *   ceiling <units>           set only monthlyCeilingUnits (0 = kill switch)
 *   kill                      monthlyCeilingUnits: 0 — every paid AI call refuses with the
 *                             calm "monthly AI budget" message; scans park and resume later
 *   --dry-run                 with any write command: print, write nothing
 *
 *   npx tsx scripts/ops/set-spend-config.ts show
 *   npx tsx scripts/ops/set-spend-config.ts apply --dry-run
 *   npx tsx scripts/ops/set-spend-config.ts apply --prod --project=homehub-2068d
 *   npx tsx scripts/ops/set-spend-config.ts kill --prod --project=homehub-2068d
 *   npx tsx scripts/ops/set-spend-config.ts ceiling 1500 --prod --project=homehub-2068d
 */
import { applicationDefault, getApps, initializeApp } from "firebase-admin/app"
import { getAuth } from "firebase-admin/auth"
import { FieldValue, getFirestore } from "firebase-admin/firestore"
import {
  DEFAULT_SPEND_CONFIG,
  MAX_SINGLE_CALL_UNITS,
  effectiveMonthlyCeiling,
  parseSpendConfig,
  type SpendConfig,
} from "../../shared/quota/policy.js"

const DOC = "config/spend"
const DEFAULT_OWNER_EMAIL = "bcworkrelated@gmail.com"
const OWNER_DAILY = 1000

const args = process.argv.slice(2)
const cmd = args.find((a) => !a.startsWith("--")) ?? "show"
const positional = args.filter((a) => !a.startsWith("--")).slice(1)
const flag = (k: string): string | undefined => args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3)
const has = (k: string): boolean => args.includes(`--${k}`)
const all = (k: string): string[] => args.filter((a) => a.startsWith(`--${k}=`)).map((a) => a.slice(k.length + 3))

function fail(message: string): never {
  console.error(`\n✖ ${message}\n`)
  process.exit(1)
}

/** A non-negative whole number, or a clear refusal — never a guess. */
function count(name: string, raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback
  if (!/^\d+$/.test(raw)) fail(`${name} must be a whole number of units, got ${JSON.stringify(raw)}`)
  const n = Number(raw)
  if (!Number.isSafeInteger(n)) fail(`${name} is too large`)
  return n
}

function connect() {
  const prod = has("prod")
  const project = flag("project")
  if (prod) {
    if (!project) fail("--prod needs --project=<id> as well (both, on purpose).")
    if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST) {
      fail("--prod with emulator env vars set. Unset FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST first.")
    }
    if (getApps().length === 0) initializeApp({ credential: applicationDefault(), projectId: project })
    return { label: `PRODUCTION (${project})`, prod: true }
  }
  if (project && project !== "demo-homehub") fail(`Without --prod this script only talks to the emulator (demo-homehub), not ${project}.`)
  process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080"
  process.env.FIREBASE_AUTH_EMULATOR_HOST ??= "127.0.0.1:9099"
  if (getApps().length === 0) initializeApp({ projectId: "demo-homehub" })
  return { label: `emulator (demo-homehub @ ${process.env.FIRESTORE_EMULATOR_HOST})`, prod: false }
}

function describe(config: SpendConfig): string {
  const lines = [
    `  monthlyCeilingUnits  ${config.monthlyCeilingUnits}${config.monthlyCeilingUnits === 0 ? "   ← KILL SWITCH ON: every paid AI call refuses" : ""}`,
    `  dailyUnitsDefault    ${config.dailyUnitsDefault}`,
    `  scansPerDay          ${config.scansPerDay}`,
    `  dailyUnitsOverrides  ${Object.keys(config.dailyUnitsOverrides).length === 0 ? "(none)" : ""}`,
    ...Object.entries(config.dailyUnitsOverrides).map(([uid, n]) => `      ${uid}  ${n}`),
  ]
  const env = process.env.AI_MONTHLY_UNIT_CEILING
  lines.push(
    `  effective ceiling    ${effectiveMonthlyCeiling(config)}${env ? ` (AI_MONTHLY_UNIT_CEILING=${env} in THIS shell — the deployed functions read their own env)` : ""}`,
  )
  return lines.join("\n")
}

/** Numbers that would refuse the dearest single call (an Ask turn with two
 *  manuals attached) every time — legal, but almost certainly not meant. */
function warnings(config: SpendConfig): string[] {
  const out: string[] = []
  const small = (n: number) => n > 0 && n < MAX_SINGLE_CALL_UNITS
  if (small(config.monthlyCeilingUnits)) out.push(`monthlyCeilingUnits ${config.monthlyCeilingUnits} is below one ${MAX_SINGLE_CALL_UNITS}-unit call`)
  if (small(config.dailyUnitsDefault)) out.push(`dailyUnitsDefault ${config.dailyUnitsDefault} is below one ${MAX_SINGLE_CALL_UNITS}-unit call`)
  for (const [uid, n] of Object.entries(config.dailyUnitsOverrides)) {
    if (small(n)) out.push(`override for ${uid} (${n}) is below one ${MAX_SINGLE_CALL_UNITS}-unit call`)
  }
  return out
}

async function main(): Promise<void> {
  const target = connect()
  const db = getFirestore()
  const ref = db.doc(DOC)
  const dryRun = has("dry-run")
  const snap = await ref.get()
  const current = parseSpendConfig(snap.exists ? snap.data() : undefined)

  console.log(`\n━━ ${DOC} — ${target.label} ━━\n`)
  console.log(snap.exists ? "Now:" : "Now: (no document — every charge uses the code defaults)")
  console.log(describe(current.config))
  if (current.problems.length > 0) console.log(`\n  ⚠ ${current.problems.join("\n  ⚠ ")}`)

  if (cmd === "show") return

  let next: SpendConfig
  let write: Record<string, unknown>
  let merge = false
  if (cmd === "kill" || cmd === "ceiling") {
    const ceiling = cmd === "kill" ? 0 : count("ceiling", positional[0], Number.NaN)
    if (!Number.isInteger(ceiling)) fail("ceiling needs a number: `ceiling 1500` (or `kill` for 0).")
    next = { ...current.config, monthlyCeilingUnits: ceiling }
    write = { monthlyCeilingUnits: ceiling, updatedAt: FieldValue.serverTimestamp() }
    merge = true
  } else if (cmd === "apply") {
    const overrides: Record<string, number> = has("replace-overrides") ? {} : { ...current.config.dailyUnitsOverrides }
    if (!has("no-owner")) {
      const email = flag("owner-email") ?? DEFAULT_OWNER_EMAIL
      const owner = await getAuth()
        .getUserByEmail(email)
        .catch((e: unknown) => fail(`No account for ${email} on ${target.label} (${e instanceof Error ? e.message : e}). Pass --no-owner or --owner-email=.`))
      overrides[owner.uid] = count("--owner-daily", flag("owner-daily"), OWNER_DAILY)
      console.log(`\nOwner: ${email} → ${owner.uid}`)
    }
    for (const o of all("override")) {
      const [uid, units] = o.split(":")
      if (!uid || units === undefined) fail(`--override must be <uid>:<units>, got ${JSON.stringify(o)}`)
      overrides[uid] = count(`--override for ${uid}`, units, 0)
    }
    next = {
      monthlyCeilingUnits: count("--monthly", flag("monthly"), DEFAULT_SPEND_CONFIG.monthlyCeilingUnits),
      dailyUnitsDefault: count("--daily", flag("daily"), DEFAULT_SPEND_CONFIG.dailyUnitsDefault),
      scansPerDay: count("--scans", flag("scans"), DEFAULT_SPEND_CONFIG.scansPerDay),
      dailyUnitsOverrides: overrides,
    }
    write = { ...next, updatedAt: FieldValue.serverTimestamp() }
  } else {
    fail(`Unknown command ${JSON.stringify(cmd)}. Use show | apply | ceiling <n> | kill.`)
  }

  // Validate with the SAME parser every charge uses: a document it would
  // complain about is never written.
  const check = parseSpendConfig(next)
  if (check.problems.length > 0) fail(`Refusing to write — ${check.problems.join("; ")}`)
  const warn = warnings(next)

  console.log(`\nAfter:`)
  console.log(describe(next))
  if (warn.length > 0) console.log(`\n  ⚠ ${warn.join("\n  ⚠ ")}`)

  if (dryRun) {
    console.log("\n(dry run — nothing written)\n")
    return
  }
  await ref.set(write, { merge })
  const readBack = parseSpendConfig((await ref.get()).data())
  console.log(`\n✔ Written. Read back: ceiling ${readBack.config.monthlyCeilingUnits}, default ${readBack.config.dailyUnitsDefault}/day, ${Object.keys(readBack.config.dailyUnitsOverrides).length} override(s), ${readBack.config.scansPerDay} scans/day.`)
  console.log("  Takes effect on the next paid call — no deploy.\n")
}

main().catch((e: unknown) => {
  console.error(e)
  process.exit(1)
})
