/**
 * graduation — maintainer report of cross-home feedback patterns that have
 * "graduated" (the same generalizable correction recurs across ≥ N homes) into
 * parse-improvement candidates.
 *
 * READ-ONLY. It NEVER edits the shared prompt or the corpus. Each candidate is a
 * PROMPT to a human: add/strengthen a golden in scripts/parse-eval and tune
 * shared/parse/parsePrompt.ts, then run the goldens harness (non-negotiable #5)
 * and review the diff BEFORE any deploy.
 *
 * Uses the same Admin SDK target as the ops scripts (prod via
 * GOOGLE_APPLICATION_CREDENTIALS + FIREBASE_PROJECT_ID, or the emulator via
 * FIRESTORE_EMULATOR_HOST). Mirrors the graduateFeedback scheduled function.
 *
 *   npx tsx scripts/parse-eval/graduation.ts
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 GCLOUD_PROJECT=demo-homehub npx tsx scripts/parse-eval/graduation.ts
 *   npx tsx scripts/parse-eval/graduation.ts -- --emit            # write candidate stubs to ./candidates/
 *   npx tsx scripts/parse-eval/graduation.ts -- --threshold=2
 */
import { writeFileSync, mkdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { initializeApp, applicationDefault, getApps } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"
import {
  aggregateGraduation, GRADUATION_THRESHOLD,
  type GraduationRow, type FeedbackPattern,
} from "../../shared/tasks/graduation.js"

// Read-only, so (unlike the write-import target) it may point at the emulator.
// Emulator: FIRESTORE_EMULATOR_HOST is honored automatically (no creds). Prod:
// applicationDefault() reads GOOGLE_APPLICATION_CREDENTIALS.
if (getApps().length === 0) {
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || "demo-homehub"
  initializeApp(process.env.FIRESTORE_EMULATOR_HOST ? { projectId } : { credential: applicationDefault(), projectId })
}
const db = getFirestore()

const HERE = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const EMIT = args.includes("--emit")
const thresholdArg = args.find((a) => a.startsWith("--threshold="))
const THRESHOLD = thresholdArg ? Number(thresholdArg.split("=")[1]) : GRADUATION_THRESHOLD

function iso(v: unknown): string {
  if (v && typeof (v as { toDate?: unknown }).toDate === "function") return (v as { toDate: () => Date }).toDate().toISOString()
  return typeof v === "string" ? v : ""
}

async function main(): Promise<void> {
  const snap = await db.collectionGroup("taskFeedback").get()
  const rows: GraduationRow[] = []
  for (const d of snap.docs) {
    if (d.get("deletedAt") != null) continue
    const homeId = d.ref.parent.parent?.id
    const patternKey = (d.get("patternKey") ?? null) as string | null
    const pattern = d.get("pattern") as FeedbackPattern | undefined
    if (!homeId || !patternKey || !pattern) continue
    rows.push({ homeId, patternKey, pattern, title: d.get("title") ?? "", createdAt: iso(d.get("createdAt")) })
  }

  const candidates = aggregateGraduation(rows, THRESHOLD)
  console.log(`\nScanned ${rows.length} graduatable feedback events across homes.`)
  console.log(`Graduation threshold: ${THRESHOLD} distinct homes.\n`)

  if (candidates.length === 0) {
    console.log("No patterns have graduated yet — a pattern needs the same generalizable feedback from multiple homes.\n")
    return
  }

  console.log(`${candidates.length} candidate pattern(s):\n`)
  for (const c of candidates) {
    console.log(`● ${c.patternKey}`)
    console.log(`  homes: ${c.homeCount}  ·  events: ${c.feedbackCount}  ·  ${c.firstSeen.slice(0, 10)} → ${c.lastSeen.slice(0, 10)}`)
    console.log(`  examples: ${c.exampleTitles.join(" · ") || "—"}`)
    console.log(`  → ${c.suggestion}\n`)
  }

  console.log("Next: add/strengthen a golden in scripts/parse-eval, tune shared/parse/parsePrompt.ts,")
  console.log("then run `npx vite-node scripts/parse-eval/run.ts` and review the diff BEFORE any deploy.")
  console.log("(Feedback never edits the prompt directly — the goldens gate does.)\n")

  if (EMIT) {
    const dir = join(HERE, "candidates")
    mkdirSync(dir, { recursive: true })
    for (const c of candidates) {
      const id = c.patternKey.replace(/[^a-zA-Z0-9]+/g, "_")
      const stub = {
        patternKey: c.patternKey,
        pattern: c.pattern,
        homeCount: c.homeCount,
        exampleTitles: c.exampleTitles,
        suggestion: c.suggestion,
        // Fill in and fold into the corpus + a golden assertion by hand:
        proposedAssertion: "TODO: which golden manual + what should the parser (not) emit here?",
        status: "new",
      }
      writeFileSync(join(dir, `${id}.json`), JSON.stringify(stub, null, 2) + "\n")
    }
    console.log(`Wrote ${candidates.length} candidate stub(s) to scripts/parse-eval/candidates/ — review + fold into the corpus manually.\n`)
  }
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e)
  process.exit(1)
})
