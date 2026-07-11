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
