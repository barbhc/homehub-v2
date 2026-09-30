/**
 * migrate-whole-home-faq — copy each whole-home saved Ask answer into a House note.
 *
 * Answers saved from Ask with "Home (not item-specific)" (`chatFaqs` with no
 * itemUnitId) were listed only by the Care Guide page (/faq), which the
 * dead-code sweep deleted (audit 2026-09-29, D5); the Save dialog no longer
 * offers that choice. This copies each such answer into the home's House notes
 * (`careNotes`, scope "home") — where Items → House notes shows it and Ask
 * reads it — as the question on the first line and the answer beneath. The rule
 * (what moves, what the note says) is wholeHomeFaqMigration.ts, unit-tested.
 *
 * SAFETY
 *   · Emulator by DEFAULT. Production only with BOTH --prod and --project=<id>,
 *     and never while an emulator env var is set.
 *   · Without --home it only SURVEYS: which homes hold whole-home answers, and
 *     how many. Read-only, and no answer text is printed.
 *   · --home <homeId> (repeatable) is the unit of work. DRY RUN by default: each
 *     answer and the note it would become. --apply writes.
 *   · --apply only ever CREATES `homes/{homeId}/careNotes/faq-<faqId>` — a
 *     create that fails if the doc exists, so an existing note is never
 *     overwritten and a second run writes nothing. Each note carries
 *     source "faq-migration", faqId and migratedAt. The source answer is NEVER
 *     deleted or modified. Item-scoped answers are not touched or listed.
 *
 *   Emulator (demo-homehub @ 127.0.0.1:8080 unless FIRESTORE_EMULATOR_HOST says otherwise):
 *     npx tsx scripts/ops/migrate-whole-home-faq.ts                        # survey
 *     npx tsx scripts/ops/migrate-whole-home-faq.ts --home e2e-home        # dry run
 *     npx tsx scripts/ops/migrate-whole-home-faq.ts --home e2e-home --apply
 *   Production — owner/gatekeeper only, via Application Default Credentials
 *   (`gcloud auth application-default login`; ADC's own quota project has no
 *   billing, so name the app's):
 *     GOOGLE_CLOUD_QUOTA_PROJECT=homehub-2068d npx tsx scripts/ops/migrate-whole-home-faq.ts --prod --project=homehub-2068d
 *     … --prod --project=homehub-2068d --home <homeId>             # dry run
 *     … --prod --project=homehub-2068d --home <homeId> --apply
 */
import { applicationDefault, getApps, initializeApp } from "firebase-admin/app"
import { FieldValue, getFirestore, Timestamp, type Firestore } from "firebase-admin/firestore"
import { isWholeHomeFaq, noteDocFor, planMigration, type FaqFacts, type PlanRow } from "./wholeHomeFaqMigration.js"

const SCRIPT = "scripts/ops/migrate-whole-home-faq.ts"
/** gRPC ALREADY_EXISTS — `create()` on a doc that is there. */
const ALREADY_EXISTS = 6

function die(msg: string): never {
  console.error(`\n✖ ${msg}\n`)
  process.exit(1)
}

// ── arguments ────────────────────────────────────────────────────────────────

interface Args {
  homes: string[]
  apply: boolean
  prod: boolean
  project: string | null
}

function parseArgs(argv: string[]): Args {
  const out: Args = { homes: [], apply: false, prod: false, project: null }
  let dryRun = false
  const args = [...argv]
  while (args.length > 0) {
    const arg = args.shift()!
    const eq = arg.indexOf("=")
    const flag = eq === -1 ? arg : arg.slice(0, eq)
    const inline = eq === -1 ? undefined : arg.slice(eq + 1)
    const take = (): string => {
      const v = inline ?? args.shift()
      if (!v || v.startsWith("--")) die(`${flag} needs a value.`)
      return v
    }
    if (flag === "--home") out.homes.push(take())
    else if (flag === "--project") out.project = take()
    else if (flag === "--prod") out.prod = true
    else if (flag === "--apply") out.apply = true
    else if (flag === "--dry-run") dryRun = true
    else if (flag === "--") continue // separator some runners pass through
    else die(`Unknown argument ${JSON.stringify(arg)}. Usage: [--prod --project=<id>] [--home <homeId> ...] [--dry-run | --apply]`)
  }
  if (out.apply && dryRun) die("--apply and --dry-run together is ambiguous; pick one.")
  if (out.apply && out.homes.length === 0) {
    die("--apply needs --home <homeId>. Survey first (no flags), then migrate one home at a time.")
  }
  return out
}

// ── target ───────────────────────────────────────────────────────────────────

function connect(args: Args): { label: string } {
  if (args.prod) {
    if (!args.project) die("--prod needs --project=<id> as well (both, on purpose).")
    if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST) {
      die("--prod with emulator env vars set. Unset FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST first.")
    }
    if (getApps().length === 0) initializeApp({ credential: applicationDefault(), projectId: args.project })
    return { label: `PRODUCTION (${args.project})` }
  }
  if (args.project && args.project !== "demo-homehub") {
    die(`Without --prod this script only talks to the emulator (demo-homehub), not ${args.project}.`)
  }
  process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080"
  if (getApps().length === 0) initializeApp({ projectId: "demo-homehub" })
  return { label: `emulator (demo-homehub @ ${process.env.FIRESTORE_EMULATOR_HOST})` }
}

// ── survey: which homes hold whole-home answers (counts only) ────────────────

async function survey(db: Firestore): Promise<void> {
  const snap = await db.collectionGroup("chatFaqs").get()
  const byHome = new Map<string, { wholeHome: number; item: number }>()
  for (const d of snap.docs) {
    const home = d.ref.parent.parent
    if (!home || home.parent.id !== "homes") continue
    const entry = byHome.get(home.id) ?? { wholeHome: 0, item: 0 }
    if (isWholeHomeFaq(d.get("itemUnitId"))) entry.wholeHome++
    else entry.item++
    byHome.set(home.id, entry)
  }
  const withWholeHome = [...byHome.entries()].filter(([, c]) => c.wholeHome > 0).sort(([a], [b]) => a.localeCompare(b))
  console.log(`\nSURVEY (read-only) — ${snap.size} saved answers across ${byHome.size} home(s)`)
  if (withWholeHome.length === 0) {
    console.log("  No home holds a whole-home saved answer. Nothing to migrate.\n")
    return
  }
  for (const [homeId, c] of withWholeHome) {
    const name = (await db.doc(`homes/${homeId}`).get()).get("name") ?? ""
    console.log(`  ${homeId}  "${name}"   ${c.wholeHome} whole-home · ${c.item} on items (untouched)`)
  }
  console.log(`\nNext: re-run with --home <homeId> for a dry run of one home, then add --apply.\n`)
}

// ── one home ─────────────────────────────────────────────────────────────────

const oneLine = (v: unknown, max = 70): string => {
  const s = (typeof v === "string" ? v : "").replace(/\s+/g, " ").trim()
  return s.length > max ? `${s.slice(0, max - 1)}…` : s
}

async function migrateHome(db: Firestore, homeId: string, apply: boolean): Promise<{ failed: number }> {
  const home = await db.doc(`homes/${homeId}`).get()
  if (!home.exists) die(`homes/${homeId} does not exist on this target.`)
  console.log(`\nHome ${homeId} "${home.get("name") ?? ""}"`)

  const faqSnap = await db.collection(`homes/${homeId}/chatFaqs`).get()
  const facts: FaqFacts[] = faqSnap.docs.map((d) => ({
    id: d.id,
    itemUnitId: d.get("itemUnitId"),
    question: d.get("question"),
    answer: d.get("answer"),
  }))
  const byId = new Map(faqSnap.docs.map((d) => [d.id, d]))

  // Only the notes this migration could have written — never the whole store.
  const candidates = planMigration(facts, new Set())
  const noteRefs = candidates
    .filter((r): r is Exclude<PlanRow, { action: "skip-empty" }> => r.action !== "skip-empty")
    .map((r) => db.doc(`homes/${homeId}/careNotes/${r.noteId}`))
  const existing = new Set(
    (noteRefs.length > 0 ? await db.getAll(...noteRefs) : []).filter((s) => s.exists).map((s) => s.id),
  )
  const plan = planMigration(facts, existing)

  console.log(`  ${faqSnap.size} saved answer(s): ${plan.length} whole-home, ${faqSnap.size - plan.length} on items (untouched)`)
  let created = 0
  let already = 0
  let skipped = 0
  let failed = 0
  for (const row of plan) {
    const q = oneLine(byId.get(row.faqId)?.get("question"))
    if (row.action === "skip-empty") {
      skipped++
      console.log(`  ${row.faqId}  (no text)   skipped — nothing to write`)
      continue
    }
    if (row.action === "already-migrated") {
      already++
      console.log(`  ${row.faqId}  "${q}"   → careNotes/${row.noteId}   already migrated`)
      continue
    }
    if (!apply) {
      created++
      console.log(`  ${row.faqId}  "${q}"   → careNotes/${row.noteId}   would create`)
      continue
    }
    const savedAt = byId.get(row.faqId)?.get("createdAt")
    const when = savedAt instanceof Timestamp ? savedAt : FieldValue.serverTimestamp()
    try {
      await db
        .doc(`homes/${homeId}/careNotes/${row.noteId}`)
        .create(noteDocFor(row, { createdAt: when, updatedAt: when, migratedAt: FieldValue.serverTimestamp() }))
      created++
      console.log(`  ${row.faqId}  "${q}"   → careNotes/${row.noteId}   created`)
    } catch (e) {
      if ((e as { code?: number }).code === ALREADY_EXISTS) {
        already++
        console.log(`  ${row.faqId}  "${q}"   → careNotes/${row.noteId}   already migrated (created meanwhile)`)
        continue
      }
      failed++
      console.error(`  ${row.faqId}  "${q}"   ✖ NOT written: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  console.log(
    `  Totals: ${created} ${apply ? "created" : "would be created"} · ${already} already migrated · ` +
      `${skipped} skipped (no text)${apply ? ` · ${failed} failed` : ""}`,
  )
  return { failed }
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const target = connect(args)
  const db = getFirestore()
  const mode = args.homes.length === 0 ? "SURVEY" : args.apply ? "APPLY (writing)" : "DRY RUN (no writes; --apply to write)"
  console.log(`\n${SCRIPT} — ${mode}`)
  console.log(`Target: ${target.label}`)

  if (args.homes.length === 0) return survey(db)

  let failed = 0
  for (const homeId of args.homes) failed += (await migrateHome(db, homeId, args.apply)).failed
  console.log(
    args.apply
      ? "\nApplied. Source answers are untouched.\n"
      : "\nDry run only. Re-run with --apply to create the notes above.\n",
  )
  if (failed > 0) process.exit(1)
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
