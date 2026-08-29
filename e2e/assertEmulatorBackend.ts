import { expect, type Browser, type Page } from "@playwright/test"
import { EMULATOR_PROJECT_ID } from "./seed-config"

/**
 * Refuse to run an emulator-backed suite against anything but the emulator.
 *
 * On 2026-08-27 the journey walks ran for an evening against PRODUCTION: a
 * stale `vite preview` owned port 5173, `reuseExistingServer` adopted it, and
 * because J1 signs UP rather than in, every run created a real account and a
 * real home that had to be deleted by hand. Nothing in the suite noticed —
 * four walks simply timed out on the sign-in screen and read as flake.
 *
 * The port and reuse fixes (see WEB_PORT in ./seed-config) stop that specific
 * path. This is the backstop for the next one, and it checks the only thing
 * that actually matters: which backend the RUNNING PAGE booted against.
 *
 * `__HH_BACKEND_PROJECT__` is set dev-only in src/integrations/firebase/app.ts,
 * so undefined means "this is a production build" — which is a failure here,
 * not an inconclusive result. Both branches are hostile on purpose.
 */
export async function assertEmulatorBackend(page: Page): Promise<void> {
  await page.goto("/")
  const project = await page.waitForFunction(
    () => (window as unknown as Record<string, unknown>).__HH_BACKEND_PROJECT__ ?? null,
    undefined,
    { timeout: 15_000 },
  )
    .then((handle) => handle.jsonValue() as Promise<string | null>)
    .catch(() => null)

  expect(
    project,
    `E2E suites must run against the Firebase emulator, but the page at ${page.url()} ` +
      `booted against ${project === null ? "a PRODUCTION build (no dev beacon)" : `project "${project}"`}. ` +
      `Something other than \`npm run dev:emu\` is serving this port. Stop it, or set PW_WEB_PORT ` +
      `to a free port. Refusing to run: these walks write, and one of them signs up.`,
  ).toBe(EMULATOR_PROJECT_ID)
}

/** `beforeAll` flavour — takes the worker's browser, since `page` is per-test. */
export async function assertEmulatorBackendVia(browser: Browser): Promise<void> {
  const page = await browser.newPage()
  try {
    await assertEmulatorBackend(page)
  } finally {
    await page.close()
  }
}
