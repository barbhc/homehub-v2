# Homehub v2 — project notes for Claude

Firebase-native parallel rebuild of Homehub (v1: `barbhc/homehub`, React 19 + Vite 7 + Supabase —
kept running untouched until the Phase 7 switch). **The plan is law:** read
`docs/homehub-v2-implementation-plan.md` (phases, gates, invariants) with
`docs/homehub-v2-rebuild-plan.md` as background. Track progress in `MIGRATION_STATUS.md`.

## Stack
React 19 + Vite 7 + Tailwind 4 (UI tree ported from v1 — **recreate zero screens**) ·
Firebase: Auth, Firestore, Storage, Functions 2nd gen (Node 20), Cloud Tasks, Cloud Scheduler ·
Hosting: Firebase Hosting (default per plan; owner may revisit before cutover).

## Commands
```bash
npm run dev          # plain vite (shim boots with inert stubs, no env needed)
npm run emu          # Firebase Emulator Suite (demo-homehub — no real project needed)
npm run dev:emu      # vite with VITE_USE_EMULATORS=true (run `npm run emu` first)
npm run seed:emu     # deterministic emulator seed (auth now; Firestore lands Phase 2)
npm run build        # tsc -b && vite build  ← the gate; never just tsc --noEmit
npm test             # vitest (incl. shared/parse suite — 104 tests)
npx playwright test e2e/smoke/boot.spec.ts --project=smoke   # Phase 1 boot smoke
```

## Layout
- `src/integrations/firebase/` — app/auth/firestore/storage/functions (+ emulator hookup)
- `src/integrations/types.ts` — **hand-curated** types, same exported names as v1. Never generate.
- `src/integrations/shim/client.ts` — TEMPORARY Supabase-shaped stub keeping v1 services compiling.
  Phase 5 removes it service-by-service; gate = zero imports of `@/integrations/shim`.
- `shared/parse/` — parsePrompt.ts + parseCore.ts, ported VERBATIM from v1
  `supabase/functions/_shared/`. Any drift from v1 is a review-blocker until v1 is archived.
- `firebase/functions/` — Functions workspace (health check now; parse worker in Phase 3)
- `firestore.rules` / `storage.rules` — DENY-ALL placeholders until Phase 2

## Non-negotiables (full list + rationale in the implementation plan)
1. One matcher: `titleSimilarity`/`TITLE_MATCH_THRESHOLD` imported from `shared/parse/parseCore`.
2. Extraction = forced tool call (`EXTRACTION_TOOL`) + `samplingParamsFor(model)` — always.
3. `planTaskReconciliation` stays pure; never delete completion-bearing tasks.
4. Never commit breadcrumb/`_error` drafts.
5. Prompt changes go through `scripts/parse-eval/run.ts` (unpiped) vs goldens BEFORE deploy.
6. Calm tiers — never alarmist red (Essential clay `#C2410C` / Recommended teal / Optional slate).
7. **Never test against a real Firebase project — the emulators exist for a reason.**
8. `isAllowedUrl`-style SSRF guard on any server-side fetch of user URLs.

## Gotchas
- Playwright is pinned to v1's version (baseline comparability). Visual baselines are
  CI-runner-baked; re-bake via workflow, never commit local-platform pixels.
- The e2e `chromium`/`mobile` projects need auth + seeded data (Phase 2/3 wires them to
  emulators); until then only the `smoke` project runs in CI.
- Capacitor deps remain temporarily (3 `src/lib/native*` importers) — replaced by FCM in Phase 4.
- Functions deploy needs the OWNER's Firebase project (`.firebaserc` placeholder) — Blaze +
  budget alert first, per plan Phase 1 item 2.
