/**
 * Loads `.env.test` into process.env for LOCAL runs.
 *
 * The seed script gets it via `tsx --env-file`, but the Playwright runner and
 * the `vite` dev server it spawns do NOT auto-load it — so without this, local
 * runs have no VITE_SUPABASE_* (app can't reach Supabase) and no
 * TEST_USER_PASSWORD (login uses the wrong default) and auth.setup fails.
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
