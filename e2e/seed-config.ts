/**
 * Single source of truth for E2E test identity and the frozen "today".
 *
 * Imported by BOTH the seed script (`scripts/seed-test-data.ts`) and the
 * Playwright specs/config, so the seeded task due-dates and the browser clock
 * can never drift apart — that shared anchor is what makes the agenda /
 * overdue / "this week" math deterministic and the screenshots stable.
 */

/** Frozen "today" for the whole suite. Seed dates are computed relative to this,
 *  and the Playwright clock is pinned to it (see `e2e/fixtures.ts`). */
export const SEED_TODAY = "2026-06-23"

/** Throwaway test user + its isolated home (created/reset by the seed script). */
export const TEST_HOME_NAME = "E2E Test Home"
export const DEFAULT_TEST_EMAIL = "e2e@homehub.test"
export const DEFAULT_TEST_PASSWORD = "E2eTest!2026"

/** Resolved from env when present & non-empty (CI passes unset secrets as ""),
 *  else the deterministic defaults. `||` (not `??`) so "" also falls back. */
export const TEST_EMAIL = process.env.TEST_USER_EMAIL || DEFAULT_TEST_EMAIL
export const TEST_PASSWORD = process.env.TEST_USER_PASSWORD || DEFAULT_TEST_PASSWORD

/** Desktop viewport — wide enough to trigger the redesign's `lg:` desktop
 *  layouts (DesktopHome et al.) and frame the 1180px centered content. */
export const DESKTOP_VIEWPORT = { width: 1440, height: 900 }

/** Returns a YYYY-MM-DD string offset by `days` from `from` (default SEED_TODAY). */
export function dayOffset(days: number, from: string = SEED_TODAY): string {
  const d = new Date(`${from}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * Web-server port for the EMULATOR-BACKED Playwright configs.
 *
 * Deliberately NOT 5173. Vite's default is 5173, so that is the port a human's
 * `npm run dev` — or a forgotten `vite preview` serving a PRODUCTION bundle —
 * is already sitting on. Combined with `reuseExistingServer`, sharing the port
 * meant a suite silently adopted whatever was there: on 2026-08-27 the journey
 * walks ran against production auth for a whole evening and signed real
 * accounts up, because a stale prod preview owned 5173.
 *
 * `--strictPort` on the webServer command plus `reuseExistingServer: false`
 * means a collision here is now a loud startup failure, not a silent redirect
 * onto someone else's backend.
 *
 * PW_WEB_PORT still overrides, for running two suites side by side.
 */
export const WEB_PORT = Number(process.env.PW_WEB_PORT || 5273)

/**
 * The project id an emulator-backed run MUST be talking to.
 *
 * Deliberately a literal rather than an import of `DEMO_PROJECT_ID` from
 * src/integrations/firebase/app.ts: that module calls `initializeApp()` at load
 * and reads `import.meta.env`, so pulling it into a Playwright config or spec
 * would boot a Firebase app inside node. The value is pinned in firebase.json,
 * the npm scripts and that module; if it ever changes, it changes in all of them.
 */
export const EMULATOR_PROJECT_ID = "demo-homehub"
