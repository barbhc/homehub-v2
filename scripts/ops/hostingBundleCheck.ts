/**
 * Pure half of scripts/ops/check-hosting-bundle.ts — the guard that keeps a
 * website build carrying the app's built-in TEST Firebase settings off
 * production. No filesystem here: the CLI reads the env and the built files and
 * hands in plain values, so the rule is unit-tested on its own
 * (hostingBundleCheck.test.ts).
 *
 * WHY (HH-162, 2026-09-30): src/integrations/firebase/app.ts falls back to a
 * demo config (apiKey "demo-api-key", project "demo-homehub") whenever the
 * VITE_FIREBASE_* settings are missing at build time — on purpose, so CI and the
 * emulator suites need no secrets — and `vite build` says nothing about it. Five
 * hosting deploys made from a checkout with no production .env shipped that
 * demo config: every sign-in failed with auth/api-key-not-valid for 14.5 hours,
 * and the post-deploy check (served files byte-identical to the build) could
 * not notice, because it compared the bundle with itself.
 *
 * Two checks, both run by the hosting predeploy hook (firebase.json →
 * `npm run build:hosting`):
 *   checkHostingEnv    — BEFORE the build: the settings Vite will inline name
 *                        the project being deployed, with a real-looking web
 *                        key, and emulator mode is off. Fails fast with a
 *                        message that says what is missing.
 *   checkHostingBundle — AFTER the build: what will actually be uploaded embeds
 *                        that project's config and carries no demo config.
 *                        This is the authoritative one — it checks the
 *                        artifact, not the inputs.
 */

export const DEMO_API_KEY = "demo-api-key"
export const DEMO_PROJECT_ID = "demo-homehub"

/** A Firebase web API key: "AIza" + 35 URL-safe characters. */
const WEB_API_KEY = /^AIza[0-9A-Za-z_-]{35}$/
const EMBEDDED_WEB_API_KEY = /apiKey:"AIza[0-9A-Za-z_-]{35}"/

export interface CheckResult {
  ok: boolean
  problems: string[]
}

const result = (problems: string[]): CheckResult => ({ ok: problems.length === 0, problems })

/**
 * The project this deploy targets: the Firebase CLI sets GCLOUD_PROJECT for
 * predeploy hooks; a manual `npm run build:hosting` falls back to .firebaserc's
 * default. Null when neither names one — the caller must refuse, not guess.
 */
export function expectedProjectFrom(
  env: Record<string, string | undefined>,
  firebaserc: unknown,
): string | null {
  const fromCli = env.GCLOUD_PROJECT?.trim()
  if (fromCli) return fromCli
  const projects = (firebaserc as { projects?: unknown } | null)?.projects
  const fallback = (projects as { default?: unknown } | undefined)?.default
  return typeof fallback === "string" && fallback.trim() ? fallback.trim() : null
}

/** `env` = what Vite will inline for a production build (loadEnv + process.env). */
export function checkHostingEnv(env: Record<string, string | undefined>, expectedProject: string): CheckResult {
  const problems: string[] = []
  const project = env.VITE_FIREBASE_PROJECT_ID
  if (!project) {
    problems.push(
      "VITE_FIREBASE_PROJECT_ID is not set. This checkout has no production .env, so the build would " +
        "use the built-in test settings and every sign-in would fail. Copy the production .env in first.",
    )
  } else if (project !== expectedProject) {
    problems.push(`VITE_FIREBASE_PROJECT_ID is "${project}", but this deploy targets "${expectedProject}".`)
  }
  const key = env.VITE_FIREBASE_API_KEY
  if (!key) problems.push("VITE_FIREBASE_API_KEY is not set.")
  else if (!WEB_API_KEY.test(key)) problems.push("VITE_FIREBASE_API_KEY does not look like a Firebase web key (AIza…).")
  if (!env.VITE_FIREBASE_AUTH_DOMAIN) problems.push("VITE_FIREBASE_AUTH_DOMAIN is not set.")
  if (env.VITE_USE_EMULATORS === "true") {
    problems.push("VITE_USE_EMULATORS is \"true\": an emulator build talks to localhost and cannot be deployed.")
  }
  return result(problems)
}

export interface BuiltFile {
  /** Path relative to dist/, e.g. "index.html" or "assets/index-AbC123.js". */
  path: string
  text: string
}

/** `files` = dist/index.html plus every .js under dist/assets. */
export function checkHostingBundle(files: BuiltFile[], expectedProject: string): CheckResult {
  const problems: string[] = []
  const html = files.find((f) => f.path === "index.html")
  const scripts = files.filter((f) => f.path.endsWith(".js"))

  if (!html) {
    problems.push("dist/index.html is missing: nothing was built.")
  } else {
    const entries = [...html.text.matchAll(/<script\b[^>]*\bsrc="\/?(assets\/[^"]+\.js)"/g)].map((m) => m[1])
    if (entries.length === 0) problems.push("dist/index.html loads no script.")
    for (const entry of entries) {
      if (!scripts.some((s) => s.path === entry)) problems.push(`dist/index.html loads ${entry}, which is not in dist/.`)
    }
  }
  if (scripts.length === 0) problems.push("dist/assets holds no scripts.")

  // The demo config as a minified build really emits it (2026-10-01, no .env):
  //   const xu="demo-homehub",Cl={apiKey:"demo-api-key",authDomain:`${xu}.firebaseapp.com`,projectId:xu,…}
  // — the project id is hoisted into a variable, so match either quoted literal
  // anywhere. A production build contains neither string (verified: 0 hits).
  for (const s of scripts) {
    if (s.text.includes(`"${DEMO_API_KEY}"`) || s.text.includes(`"${DEMO_PROJECT_ID}"`)) {
      problems.push(`${s.path} carries the built-in test Firebase settings (${DEMO_API_KEY} / ${DEMO_PROJECT_ID}).`)
    }
  }

  // A production build inlines the VITE_FIREBASE_* values as string literals in
  // the config object: `apiKey:"AIza…",authDomain:"…",projectId:"homehub-2068d",…`.
  // This depends on that minified shape; if a refactor or a minifier change
  // alters it, the check refuses loudly (it never passes silently) — update the
  // pattern and the fixtures in hostingBundleCheck.test.ts together.
  const configured = scripts.filter((s) => s.text.includes(`projectId:"${expectedProject}"`))
  if (configured.length === 0) {
    problems.push(`No script embeds projectId "${expectedProject}": the build did not pick up the production settings.`)
  } else if (!configured.some((s) => EMBEDDED_WEB_API_KEY.test(s.text))) {
    problems.push(`The embedded "${expectedProject}" config has no Firebase web key (apiKey:"AIza…").`)
  }
  return result(problems)
}
