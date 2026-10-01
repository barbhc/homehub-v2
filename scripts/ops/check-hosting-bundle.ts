/**
 * check-hosting-bundle — the hosting deploy's guard against shipping the app's
 * built-in TEST Firebase settings (HH-162). The rule lives in
 * hostingBundleCheck.ts; this file only reads the env and dist/ and reports.
 *
 * It runs as firebase.json's hosting predeploy hook, through
 * `npm run build:hosting`:
 *   1. `check-hosting-bundle.ts --env`  — before the build: refuse when the
 *      settings Vite will inline do not name the project being deployed.
 *   2. `npm run build`
 *   3. `check-hosting-bundle.ts`        — after the build: refuse when dist/
 *      does not embed that project's config, or carries the demo config.
 * A non-zero exit makes `firebase deploy` stop before anything is uploaded.
 *
 * The target project comes from GCLOUD_PROJECT (set by the Firebase CLI for
 * hooks), else .firebaserc's default.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { loadEnv } from "vite"
import { checkHostingBundle, checkHostingEnv, expectedProjectFrom, type BuiltFile, type CheckResult } from "./hostingBundleCheck.js"

const root = process.cwd()
const stage = process.argv.includes("--env") ? "env" : "bundle"

function fail(lines: string[]): never {
  console.error(`\n✖ Hosting deploy stopped (${stage} check):`)
  for (const line of lines) console.error(`  · ${line}`)
  console.error("")
  process.exit(1)
}

if (!existsSync(join(root, "firebase.json"))) fail([`Run from the project root (no firebase.json in ${root}).`])

const rcPath = join(root, ".firebaserc")
const firebaserc: unknown = existsSync(rcPath) ? JSON.parse(readFileSync(rcPath, "utf8")) : null
const expected = expectedProjectFrom(process.env, firebaserc)
if (!expected) fail(["No target project: GCLOUD_PROJECT is unset and .firebaserc has no default."])

let outcome: CheckResult
if (stage === "env") {
  // Exactly what `vite build` will inline: the mode's .env files plus VITE_* from the shell.
  outcome = checkHostingEnv(loadEnv("production", root, "VITE_"), expected)
} else {
  const dist = join(root, "dist")
  const files: BuiltFile[] = []
  if (existsSync(join(dist, "index.html"))) files.push({ path: "index.html", text: readFileSync(join(dist, "index.html"), "utf8") })
  const assets = join(dist, "assets")
  if (existsSync(assets)) {
    for (const name of readdirSync(assets)) {
      if (name.endsWith(".js")) files.push({ path: `assets/${name}`, text: readFileSync(join(assets, name), "utf8") })
    }
  }
  outcome = checkHostingBundle(files, expected)
}

if (!outcome.ok) fail(outcome.problems)
console.log(`✓ Hosting ${stage} check passed for ${expected}.`)
