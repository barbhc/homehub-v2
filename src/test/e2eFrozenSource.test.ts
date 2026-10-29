import { describe, it, expect } from "vitest"
import { readdirSync, readFileSync } from "node:fs"

/**
 * Every emulator browser suite's web server runs with no HMR and no file
 * watching, so an edit to the working tree mid-run cannot hot-swap or reload
 * what the page has already loaded.
 *
 * Why this is pinned: the 2026-10-28 audit's add-item flake (Back → Add the
 * manual → "Pick up where you left off", green when rerun alone) has a
 * reproduced cause in the dev server hot-swapping a module mid-test: editing
 * HomeProvider during a run remounted the wizard onto its resume screen, and
 * editing firebase/app.ts reloaded the page onto it. A new Playwright config that forgets the env
 * brings that back silently, so this reads every config that boots the
 * emulator dev server and fails if one does not pass it.
 */
// Paths are relative to the repo root — vitest's cwd, as in csp.test.ts.
const read = (f: string): string => readFileSync(f, "utf8")

describe("browser suites run without HMR or file watching", () => {
  const configs = (readdirSync(".") as string[]).filter((f: string) => /^playwright\..*config\.ts$/.test(f))
  const emulatorConfigs: string[] = configs.filter((f: string) => read(f).includes("dev:emu"))

  it("finds the emulator configs it is meant to guard", () => {
    // emu, a11y, device, journey, visual — if this drops, the filter broke.
    expect(emulatorConfigs.length).toBeGreaterThanOrEqual(5)
  })

  it.each(emulatorConfigs)("%s passes E2E_WEB_SERVER_ENV to its web server", (f: string) => {
    expect(read(f)).toMatch(/env:\s*E2E_WEB_SERVER_ENV/)
  })

  it("the env flag is the one vite.config.ts reads, and it turns HMR and watching off", () => {
    expect(read("e2e/seed-config.ts")).toMatch(/E2E_WEB_SERVER_ENV\s*=\s*\{\s*HH_E2E_FROZEN_SOURCE:\s*"1"\s*\}/)
    const vite = read("vite.config.ts")
    expect(vite).toMatch(/process\.env\.HH_E2E_FROZEN_SOURCE === '1'\s*\?\s*\{\s*server:\s*\{\s*hmr:\s*false,\s*watch:\s*null\s*\}\s*\}/)
  })
})
