/**
 * run-all — orchestrates the data-path import in order: preflight → auth →
 * firestore → storage. Re-parse (40) is intentionally SEPARATE (it needs the
 * functions deployed and is optional) — run it after verifying the app.
 *
 * Honors CONFIRM=IMPORT (passed through to each step). Dry run:
 *   npx tsx scripts/import/run-all.ts
 * Apply:
 *   CONFIRM=IMPORT npx tsx scripts/import/run-all.ts
 */
import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const here = dirname(fileURLToPath(import.meta.url))
const steps = ["00-preflight.ts", "10-auth.ts", "20-firestore.ts", "30-storage.ts"]

for (const step of steps) {
  console.log(`\n=== ${step} ===`)
  try {
    execFileSync("npx", ["tsx", join(here, step)], { stdio: "inherit", env: process.env })
  } catch {
    console.error(`\n✖ ${step} failed — stopping. Fix the error and re-run run-all (it is idempotent).`)
    process.exit(1)
  }
}

console.log(`
✓ Data + storage import complete.

Next:
  1. Open the app, sign in (use "forgot password" once — passwords weren't copied),
     and spot-check Home / Inventory / a manual PDF renders.
  2. Re-parse manuals with the v2 worker (optional, recommended):
       FIREBASE_WEB_API_KEY=<key> OWNER_UID=<uid> CONFIRM=IMPORT \\
         npx tsx scripts/import/40-reparse.ts
     (or per-manual in the app: Settings → Rescan all)
  3. Work through docs/DEFINITION_OF_DONE before the domain cutover.
`)
