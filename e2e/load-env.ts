/**
 * Loads `.env.test` into process.env for LOCAL runs, if one exists — optional:
 * nothing requires it, and CI never has one.
 *
 * The Playwright runner and the `vite` dev server it spawns do NOT auto-load
 * it, and it is where a local run overrides TEST_USER_EMAIL / TEST_USER_PASSWORD
 * (seed-config falls back to the seeded defaults) or points PLAYWRIGHT_BASE_URL
 * at a deployed preview. (It once carried the Supabase keys for v1's seed
 * script; that script and its `.env.test.example` were deleted 2026-09-30.)
 *
 * Imported FIRST in playwright.config.ts so these values exist before
 * seed-config's constants evaluate and before the dev server inherits the env.
 * Existing env vars (CI job env) always take precedence — the file never
 * overrides them.
 */
import fs from "node:fs"
import path from "node:path"

const file = path.resolve(process.cwd(), ".env.test")
if (fs.existsSync(file)) {
  for (const raw of fs.readFileSync(file, "utf8").split("\n")) {
    const line = raw.trim()
    if (!line || line.startsWith("#")) continue
    const eq = line.indexOf("=")
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    let val = line.slice(eq + 1).trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    if (!(key in process.env)) process.env[key] = val
  }
}
