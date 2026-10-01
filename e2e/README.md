# E2E harness

Playwright suites that drive the real app against the **Firebase Emulator Suite**
(project `demo-homehub` — never a real project) with a **deterministic seed**: one
test user and its home, "E2E Test Home" (`homes/e2e-home`), written by
`scripts/seed-emulator.ts`.

## Run it

```bash
npm run emu            # terminal 1: the emulator suite (demo-homehub); the specs use auth, firestore, storage
npm run emu:clear && FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 npm run seed:emu
npx playwright test --config playwright.emu.config.ts      # one suite (see below)
npm run test:e2e:all:emu   # what CI runs: all four suites in one emulator boot, reseeding between them
```

Each emulator config starts its own `npm run dev:emu` on `WEB_PORT` (5273 —
deliberately not Vite's 5173; `PW_WEB_PORT` overrides) and refuses to reuse a
server already on that port. `auth.setup.ts` signs the seeded user into the Auth
emulator once and saves the session to `e2e/.auth/user.json`; the suites reuse it.

Clear and reseed before every suite: specs in one run share the seeded state,
and a reseed alone does not remove what a previous run created.

## Suites

| Config | Specs | In CI |
|---|---|---|
| `playwright.config.ts` · project `smoke` | `smoke/boot.spec.ts` — landing, sign-in card, auth gate; no emulators | yes (`checks` job) |
| `playwright.emu.config.ts` | `emu/*.spec.ts` — seeded service-layer round trips | yes |
| `playwright.a11y.config.ts` | `a11y/` — axe WCAG A/AA at desktop and mobile | yes |
| `playwright.device.config.ts` | `device/` — layout across viewports | yes |
| `playwright.journey.config.ts` | `journey/` — the core user journeys with step screenshots (`docs/user-journeys.md`) | yes |
| `playwright.visual.config.ts` | `visual/pages.spec.ts` — full-page snapshots at desktop + mobile | no |

Not in CI: `flows/` (older behavioural guards, stale selectors), `legacy/`
(pre-redesign specs, ignored — see `legacy/README.md`), `prototype/` (opt-in
reference capture), and `smoke/coldstart.spec.ts` (CI runs `smoke/boot.spec.ts`
by name).

## Why it's deterministic

- The seed computes every due date relative to `SEED_TODAY` (`e2e/seed-config.ts`).
- The fixture (`e2e/fixtures.ts`) pins the browser clock to that same date and
  kills animations, so "overdue / due soon / this week" render identically every
  run.

Change `SEED_TODAY` in one place and reseed; the clock follows.

## Visual baselines

Baselines live under `e2e/__screenshots__/<project>/…` and are browser/OS
sensitive (see `playwright.visual.config.ts`): never commit pixels baked on a
local machine. `npm run test:e2e:visual:update` re-bakes against the seeded
emulator.
