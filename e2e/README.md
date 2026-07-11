# E2E + visual + a11y harness

Playwright suite that audits the redesign the way the manual screenshot loop did
— but automatically, deterministically, and in one place. It drives the real app
against a **seeded throwaway test user**, captures **visual snapshots** of every
page (desktop + mobile), runs **accessibility** scans, and asserts the
**redesign behaviours** (the audit fixes) so they can't silently regress.

## One-time setup

1. **Install browsers** (first run only):
   ```bash
   npx playwright install --with-deps chromium
   ```
2. **Create `.env.test`** from the template and fill it in:
   ```bash
   cp .env.test.example .env.test
   ```
   You can point it at your **dev** Supabase project — the seed is isolated to a
   throwaway user + a home named "E2E Test Home" and never touches other data.
   The `SUPABASE_SERVICE_ROLE_KEY` is only used by the seed script (Settings →
   API → service_role); it is gitignored and never reaches the browser.

## Run it

```bash
npm run seed:test     # create/reset the test user + deterministic data
npm run test:e2e      # boot dev server, log in, run all specs (desktop + mobile)
npm run test:e2e:report   # open the HTML report (snapshots, diffs, traces)
```

Run a slice:
```bash
npx playwright test e2e/flows          # just the behavioural regression guards
npx playwright test e2e/visual --project=chromium   # desktop visual only
npx playwright test e2e/a11y           # accessibility only
```

## Visual baselines

First run (or after an intentional UI change) generates/updates the committed
baselines:
```bash
npm run test:e2e:update
```
Review the new PNGs under `e2e/__screenshots__/<project>/…` before committing —
that review IS the "is this the intended look?" gate. Subsequent runs fail if a
page drifts beyond tolerance (`maxDiffPixelRatio: 0.02`), and the report shows a
pixel diff.

### Prototype as the reference
The committed design prototype (`design/Homehub Desktop.html`) is the source of
truth for *what correct looks like*. Capture it for side-by-side review:
```bash
CAPTURE_PROTOTYPE=1 npx playwright test e2e/prototype --project=chromium
# → e2e/prototype-reference/desktop-prototype.png
```
This is a **reference**, not a hard gate — a hand-built prototype never
pixel-matches a real app. The hard gate is app-vs-approved-snapshot; the
prototype is what you (and the agent) judge a new baseline against.

## Why it's deterministic

- The seed computes every due-date relative to `SEED_TODAY` (`e2e/seed-config.ts`).
- The Playwright fixture (`e2e/fixtures.ts`) pins the browser clock to that same
  date, so "overdue / due soon / this week" render identically every run.
- The test user is forced to **power** interface level so the full desktop nav
  (Clean / Warranties / Providers) is always present, and the product tour +
  onboarding are suppressed so nothing overlays the screenshots.

Change `SEED_TODAY` in one place and re-seed; the clock follows automatically.

## Layout

```
e2e/
  seed-config.ts          shared anchor: SEED_TODAY, test identity, viewport
  auth.setup.ts           logs in once → e2e/.auth/user.json (storage state)
  fixtures.ts             clock freeze + motion kill (extends `test`)
  visual/pages.spec.ts    full-page snapshots of every surface (×2 viewports)
  a11y/a11y.spec.ts       axe-core WCAG scan, gates critical/serious
  flows/redesign-regressions.spec.ts   guards the audit fixes (data-binding,
                                       landing, providers, ask citations)
  prototype/reference.spec.ts          opt-in prototype reference capture
  *.spec.ts               pre-existing smoke specs (navigation, dashboard, …)
scripts/seed-test-data.ts deterministic seed (service-role, idempotent)
```

## CI gate

`.github/workflows/e2e.yml` runs on PRs to `main` (and pushes to `main`): it
installs Playwright, builds the app, **seeds** the throwaway test home, runs the
full suite against a `vite preview` build, and uploads the HTML report +
`test-results/` as artifacts.

**To turn it on:**

1. Add these repo secrets (Settings → Secrets and variables → Actions):
   | Secret | Value |
   |---|---|
   | `TEST_SUPABASE_URL` | your test/dev project URL |
   | `TEST_SUPABASE_ANON_KEY` | its publishable anon key |
   | `TEST_SUPABASE_SERVICE_ROLE_KEY` | service_role key (seed only) |
   | `TEST_USER_EMAIL` / `TEST_USER_PASSWORD` | optional |
2. **Bootstrap the visual baselines once** (none are committed yet, so the visual
   specs would otherwise fail "no snapshot"). Either run locally —
   ```bash
   npm run seed:test && npm run test:e2e:update
   git add e2e/__screenshots__ && git commit -m "test(e2e): visual baselines"
   ```
   — or trigger the workflow manually (Actions → E2E → Run workflow →
   *update baselines* ✓) and commit the `updated-visual-baselines` artifact.
3. Make **E2E** a required status check (Settings → Branches → `main`).

Until baselines are committed, the **a11y** and **flows** specs are still
meaningful gates; the **visual** specs go green once baselines land.
