/**
 * migrate-legacy-storage — move Storage objects that predate the homes/{homeId}/…
 * re-key (2026-08-18) into their household's tenant subtree, and point every
 * Firestore reference at the copy. Plan, rules and production steps:
 * docs/storage-legacy-migration.md. The rules this follows are
 * storageLegacyMigration.ts (unit-tested); the I/O is storageLegacyMigrationRunner.ts
 * (proven against the emulators by firebase/storage-migration.emu.test.ts).
 *
 * MODES
 *   (default)                 DRY RUN. Read-only: object METADATA and Firestore
 *                             documents. Prints counts and bytes per category —
 *                             never a stored value, a URL, a token or file bytes.
 *   --apply --manifest <file> Copy each resolved object to
 *                             homes/{homeId}/legacy/{originalPath} (server-side,
 *                             never overwriting), verify size + hashes + metadata,
 *                             then rewrite each reference in a transaction. Every
 *                             step is written to the manifest BEFORE it runs, so a
 *                             re-run with the same manifest resumes. Originals are
 *                             NEVER deleted. Ambiguous / missing / conflicting
 *                             objects are reported and skipped.
 *   --rollback <file>         Restore every reference the manifest rewrote to its
 *                             previous value (only where it still holds the value
 *                             the migration wrote). Copies stay.
 *   --verify <file>           Re-read what a manifest changed: new values in place,
 *                             copies present, originals present.
 *
 * OPTIONS
 *   --home <homeId>           (repeatable) apply only to objects resolved to these
 *                             homes. REQUIRED with --apply outside the emulator.
 *                             Unknown ids are refused; each home's name and member
 *                             count is printed first. The manifest records the
 *                             --home set and refuses a run with a different one.
 *   --include-home <id> --sonia-agreed
 *                             PROTECTED homes (PROTECTED_HOMES: Sonia's "My House")
 *                             are never migrated — even when named by --home —
 *                             unless BOTH flags are given. Either alone is refused.
 *   --list                    also list ambiguous / missing / conflicting /
 *                             unrecognised items by document path and object path
 *                             (tokens redacted). Object paths can contain a
 *                             receipt's original FILE NAME — treat the output as private.
 *   --report <file>           write the census as JSON (counts and bytes only).
 *
 * TARGET — emulator by default, production only behind two explicit flags:
 *   Emulator: --project demo-homehub (default; any demo-* id). Connects to
 *     FIRESTORE_EMULATOR_HOST / FIREBASE_STORAGE_EMULATOR_HOST (defaults
 *     127.0.0.1:8080 / 127.0.0.1:9199). Bucket defaults to <project>.appspot.com.
 *   Production: ONLY `--project homehub-2068d --i-have-owner-approval --bucket <name>`
 *     (the bucket must be homehub-2068d.appspot.com or homehub-2068d.firebasestorage.app,
 *     and must exist),
 *     with no emulator env vars set. That still runs the DRY RUN; --apply must be
 *     added on top, together with --home. Any other project id is refused.
 *     Credentials: Application Default Credentials, with
 *     GOOGLE_CLOUD_QUOTA_PROJECT=homehub-2068d (ADC's own quota project has no billing).
 *   DO NOT run the production form without the owner's per-step approval
 *   (docs/storage-legacy-migration.md "Production steps").
 *
 *   npx tsx scripts/ops/migrate-legacy-storage.ts                                   # emulator dry run
 *   npx tsx scripts/ops/migrate-legacy-storage.ts --apply --manifest /tmp/m.jsonl  # emulator apply
 *   npx tsx scripts/ops/migrate-legacy-storage.ts --rollback /tmp/m.jsonl
 */
import { writeFileSync } from "node:fs"
import { applicationDefault, getApps, initializeApp } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"
import { getStorage } from "firebase-admin/storage"
import { checkManifestHeader, manifestHomes, manifestState, redact, summarize } from "./storageLegacyMigration.js"
import {
  applyExitCode,
  deniedProtectedHomes,
  formatListing,
  formatSummary,
  homeGate,
  parseArgs,
  progressLine,
  resolveTarget,
  type Args,
  type Target,
} from "./storageLegacyMigrationCli.js"
import { applyPlan, describeHomes, Manifest, planFromLive, rollback, verifyManifest } from "./storageLegacyMigrationRunner.js"

function die(msg: string): never {
  console.error(`\n✖ ${msg}\n`)
  process.exit(1)
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  let args: Args
  let target: Target
  let denied: Set<string>
  try {
    args = parseArgs(process.argv.slice(2))
    target = resolveTarget(args, process.env)
    denied = deniedProtectedHomes(args)
  } catch (e) {
    die(e instanceof Error ? e.message : String(e))
  }
  if (target.kind === "emulator") {
    process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080"
    process.env.FIREBASE_STORAGE_EMULATOR_HOST ??= "127.0.0.1:9199"
    if (getApps().length === 0) initializeApp({ projectId: target.project, storageBucket: target.bucket })
  } else if (getApps().length === 0) {
    initializeApp({ credential: applicationDefault(), projectId: target.project, storageBucket: target.bucket })
  }
  const db = getFirestore()
  const bucket = getStorage().bucket(target.bucket)
  const label =
    target.kind === "emulator"
      ? `emulator ${target.project} (Firestore ${process.env.FIRESTORE_EMULATOR_HOST}, Storage ${process.env.FIREBASE_STORAGE_EMULATOR_HOST}) bucket ${target.bucket}`
      : `PRODUCTION ${target.project} bucket ${target.bucket}`
  console.log(`\nmigrate-legacy-storage → ${label}`)
  // A misspelt or wrong bucket does not fail on its own — it finds nothing and
  // reports every URL as foreign. In production, fail here instead. (The
  // Storage emulator serves no bucket metadata — exists() is always false
  // there — so the emulator target relies on the foreign-bucket count.)
  if (target.kind === "production") {
    const [bucketExists] = await bucket.exists()
    if (!bucketExists) die(`Bucket ${target.bucket} does not exist in ${target.project}.`)
  }

  if (args.rollback) {
    const res = await rollback(db, new Manifest(args.rollback))
    console.log(`\nROLLBACK: ${res.docs} document(s) visited · ${res.restored} field(s) restored · ${res.already} already at their previous value · ${res.conflicts.length} changed since (left alone)`)
    for (const c of res.conflicts) console.log(`  changed since migration, NOT restored: ${c.docPath} ${JSON.stringify(c.fieldPath)}`)
    console.log("Copies under homes/{homeId}/legacy/ were left in place.\n")
    process.exit(res.conflicts.length > 0 ? 2 : 0)
  }
  if (args.verify) {
    const res = await verifyManifest(db, bucket, new Manifest(args.verify))
    console.log(`\nVERIFY: ${res.refsPointingAtNew}/${res.refsChecked} reference(s) hold their new value · ${res.destinationsMissing.length} copy(ies) missing · ${res.originalsMissing.length} original(s) missing`)
    process.exit(applyExitCode({ copyFailed: [], fieldConflicts: [] }, res))
  }

  if (args.homes.length > 0) {
    try {
      const lines = homeGate(await describeHomes(db, args.homes))
      console.log(`\n${args.apply ? "About to migrate" : "Scoped to"}:`)
      for (const line of lines) console.log(line)
    } catch (e) {
      die(e instanceof Error ? e.message : String(e))
    }
  }
  // Refuse a wrong or foreign manifest BEFORE the (long) scan, not after it.
  let manifest: Manifest | null = null
  if (args.apply) {
    try {
      manifest = new Manifest(args.manifest!)
      checkManifestHeader(manifestState(manifest.entries).header, { project: target.project, bucket: target.bucket, homes: manifestHomes(args.homes) }, manifest.path)
    } catch (e) {
      die(e instanceof Error ? e.message : String(e))
    }
  }
  const homeFilter = args.homes.length > 0 ? new Set(args.homes) : null
  const { plan, scannedDocs } = await planFromLive(db, bucket, homeFilter, denied)
  const summary = summarize(plan)
  console.log(`\n${args.apply ? "PLAN" : "DRY RUN (read-only)"} — ${scannedDocs} document(s) scanned, ${plan.objects.length} object(s) listed\n`)
  for (const line of formatSummary(summary)) console.log(line)
  if (args.list) {
    console.log("")
    for (const line of formatListing(plan)) console.log(line)
  }
  if (args.report) {
    writeFileSync(args.report, `${JSON.stringify({ target: label, scannedDocs, summary }, null, 2)}\n`)
    console.log(`\nCensus written to ${args.report} (counts and bytes only).`)
  }
  if (!manifest) {
    console.log("\nNothing was changed. Re-run with --apply --manifest <file> to migrate.\n")
    return
  }

  const res = await applyPlan(db, bucket, plan, manifest, { project: target.project, homes: manifestHomes(args.homes) }, {
    onProgress: (p) => {
      const line = progressLine(p)
      if (line) console.log(line)
    },
  })
  console.log(`\nAPPLY: copied ${res.copied} · already present ${res.copyAlreadyPresent} · copy failures ${res.copyFailed.length}`)
  console.log(`       ${res.fieldsWritten} field(s) rewritten in ${res.docsUpdated} document(s) · ${res.fieldsAlready} already done · ${res.fieldConflicts.length} changed since the plan (left alone) · ${res.skippedRefsForFailedCopies} reference(s) held back by a failed copy`)
  for (const f of res.copyFailed) console.log(`  copy failed: ${redact(f.src)} — ${f.reason}`)
  for (const c of res.fieldConflicts) console.log(`  changed since the plan, NOT rewritten: ${c.docPath} ${JSON.stringify(c.fieldPath)}`)
  const v = await verifyManifest(db, bucket, manifest)
  console.log(`VERIFY: ${v.refsPointingAtNew}/${v.refsChecked} reference(s) hold their new value · ${v.destinationsMissing.length} copy(ies) missing · ${v.originalsMissing.length} original(s) missing`)
  console.log(`Manifest: ${manifest.path} (keep it — it is the rollback; it holds previous values, so treat it as private).\n`)
  process.exit(applyExitCode(res, v))
}

main().catch((e) => {
  console.error("\n✖ migrate-legacy-storage crashed:", e instanceof Error ? redact(e.message) : e)
  process.exit(1)
})
