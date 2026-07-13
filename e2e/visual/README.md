# Visual regression suite (Fix E)

Full-page snapshots of every redesign surface at desktop + mobile viewports,
captured against the **seeded Firestore/Auth emulator** (so pages show real v2
data, not an empty skeleton).

```bash
npm run test:e2e:visual:emu       # compare against baselines
npm run test:e2e:visual:update    # re-bake baselines (intentional UI change)
```

Config: `playwright.visual.config.ts` (emulator web server + auth setup + the
`chromium` and `mobile` projects). Baselines live in
`e2e/__screenshots__/<project>/visual/pages.spec.ts/`.

## Baseline status

- **`chromium` (desktop 1440px): re-baked post-fix-A and verified** (suite green
  in compare mode). `home`, `tasks`, and `settings` changed materially (Fix A's
  calm surfacing); the other six render within the 2% pixel tolerance of the
  prior baselines and were left as-is.
- **`mobile` (iPhone 14): NOT yet re-baked — still the v1 copies.** The
  mobile-emulated Chromium process could not launch in the migration sandbox
  (desktop Chromium launches fine; the iPhone device profile crashes on start —
  a container/root limitation, not an app issue). Re-bake these in CI or a normal
  dev machine: `npm run test:e2e:visual:update`, then commit the updated
  `e2e/__screenshots__/mobile/**` PNGs.

## CI

The visual project is **not yet wired into CI** (deferred to Phase 7 with the
mobile re-bake). Baselines are browser/OS-sensitive; CI must run the same pinned
Playwright Chromium on Linux, or re-bake on first adoption so the comparison
browser matches.
