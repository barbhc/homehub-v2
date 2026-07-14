# Homehub v2 — Session Handoff (2026-07-14)

Purpose: hand this work off from the **cloud Claude Code session** (which cannot push to
`barbhc/homehub-v2` and delivers via git bundles) to a **local Claude Code session on the
owner's Mac**, so the next session can push directly and run deploys itself with zero bundle
friction. Read this top to bottom before starting Wave 1.

---

## 0. TL;DR for the next session

- **Where things stand:** all code migration + Wave 1 (fix prod sign-in + security hardening)
  is **committed and verified on the emulator**. Nothing is deployed yet from Wave 1.
- **What to do first:** confirm the repo is at commit `5cc6f04`, then execute the **Wave 1
  runbook in §4** in the exact order given (ordering is load-bearing — see §5 gotchas).
- **Authoritative plan:** `~/.claude/plans/modular-baking-meadow.md` (full status assessment +
  Waves 1–4). This doc is the pointer + the "why the workflow changed" note; the plan is the detail.
- **Owner Firebase/Homehub account:** app data belongs to `bcworkrelated@gmail.com` (owner of
  "SF Condo", 25 items). `barb.chang@gmail.com` is Claude's contact email, not the app owner.

---

## 1. Why we're switching to a local session

The cloud sandbox this work was done in has git/GitHub access scoped to `barbhc/homehub` (v1)
**only** — it has no push access to `barbhc/homehub-v2`. Every change therefore had to leave the
sandbox as a `git bundle` that the owner downloaded and pushed by hand. That, plus the fact that
`firebase deploy` / import scripts / prod-smoke all had to be hand-run by the owner with the
sandbox guiding blind, is what made launch-day debugging slow.

**Running Claude Code locally on the Mac fixes both problems:**
- Edits happen in the local clone and `git push origin main` goes direct — no bundles.
- The local session can run `firebase deploy`, `npx tsx scripts/ops/*.ts`, the import scripts,
  and `prod-smoke.ts` itself using the owner's logged-in `firebase-tools` — no deploy handoff.
- The owner only does genuinely human-gated console steps (VAPID key, Apple Services ID, DNS,
  budget alert), which no automation can do anyway.

Trade-off: a local session is tied to the Mac being on and can't work unattended in the
background the way the cloud container can. For driving deploys interactively, that's fine.

---

## 2. Current repo state (verified 2026-07-14)

- Branch `main`, HEAD = **`5cc6f04`** — "Wave 1: fix prod sign-in (missing CG index) + error
  surfacing + hardening". Working tree clean.
- Recent history:
  - `5cc6f04` Wave 1 (this handoff's subject)
  - `73903fa` Firestore-safe nested arrays (import + parse worker)
  - `9b12ba9` import: real v1 primary-key columns + fail-loud guard
  - `300e76b` purge last Supabase leftovers
- **First thing the local session should do:** `git fetch origin && git log --oneline origin/main -1`
  and confirm `origin/main` is at `5cc6f04`. If the owner already pushed the Wave 1 bundle,
  it will be. If not, the Wave 1 bundle needs pulling/pushing first (this is the last bundle).

---

## 3. What's done vs. pending (summary — full detail in the plan)

### Done & verified (emulator)
- **Code migration 100%**: every service on Firebase; Supabase shim deleted; all 12 v1 edge
  functions ported + fixture-tested; parse-legacy retired; FCM client code in place; redesign
  fixes A–E landed (mobile visual baselines still pending — Wave 4).
- **Backend deployed previously**: 22 functions live (us-central1), rules + composite indexes +
  storage rules deployed, secrets set (ANTHROPIC / GOOGLE_VISION / BRAVE), Cloud Tasks queue +
  2 cron jobs provisioned.
- **Hosting live** at homehub-2068d.web.app.
- **Data imported**: 7 auth users (uids preserved), 1,498 Firestore docs, 117 storage objects in
  bucket `homehub-2068d.firebasestorage.app`.
- **Wave 1 code committed** (`5cc6f04`) and verified: vitest 157, rules 34, functions 63,
  emu e2e 18/18. **Not yet deployed.**

### Broken in prod until Wave 1 deploys
1. **Sign-in lands on onboarding instead of "SF Condo".** Root cause: missing COLLECTION_GROUP
   index on `members.uid`. The emulator does NOT enforce indexes, so every e2e passed while prod
   throws FAILED_PRECONDITION. **This is the #1 fix and the whole reason Wave 1 exists.**
2. Blank page after creating a home; duplicate-home trap (minted a stray empty "SF Condo");
   "Verifying your link…" dead-end on password reset. All fixed in `5cc6f04`, all pending deploy.

### Security posture (anonymous sign-in is temporarily ON, owner-accepted)
Wave 1 hardening (in `5cc6f04`, pending deploy) gates 7 anonymously-drainable functions behind
`requireAnyMembership`, locks down storage.rules to per-prefix uid-scoped writes, and closes
users-collection enumeration. The anon quota-defeat hole is only *fully* closed by Wave 4's
"disable anonymous provider" step.

### Not yet done
Push (VAPID unset + SW placeholder config), reset-email action URL, budget alert confirmation,
live functional verification, re-parse of manuals, Apple Sign-In, custom domain cutover, mobile
visual baselines + CI, v1 Supabase retirement, nodejs22 runtime bump. → Waves 2–4 in the plan.

---

## 4. Wave 1 runbook (run in THIS order)

From the repo root on the Mac, with `firebase-tools` logged in to the right project:

```bash
# 0. Confirm state
git fetch origin && git log --oneline -1        # must show 5cc6f04
grep firebasestorage.app .env                   # bucket preflight — MUST be homehub-2068d.firebasestorage.app

# 1. Clean up stray/test homes BEFORE anyone signs in post-fix (see gotcha §5a)
npx tsx scripts/ops/cleanup-homes.ts            # DRY RUN — review the manifest it prints
CONFIRM=CLEANUP npx tsx scripts/ops/cleanup-homes.ts

# 2. Deploy the index FIRST and wait for it to build (see gotcha §5b)
firebase deploy --only firestore:indexes
npx tsx scripts/ops/prod-smoke.ts               # retries members.uid query until index is Enabled

# 3. Only after prod-smoke's index check is green, deploy the rest
npm run build                                    # tsc -b && vite build — must pass
firebase deploy --only firestore:rules,storage,functions,hosting
npx tsx scripts/ops/prod-smoke.ts               # full green expected
```

Then UI verification (owner, in a browser):
- Sign in → lands on **SF Condo with 25 items** (no onboarding, no blank page).
- Deep-link refresh (reload on an inner page) works.
- Upload a manual PDF, a photo, a receipt; open a PDF.
- One AI action (product lookup) succeeds.
- Visit `/reset-password` with no params → shows the **error card**, not a stuck spinner.

---

## 5. Load-bearing gotchas (do NOT reorder around these)

**a. Cleanup must run BEFORE the owner signs in post-fix.** `createHome` stamps `isPrimary:true`;
the stray empty "SF Condo" the owner accidentally minted has `isPrimary:true` while the imported
real memberships do not. Once the index fix lands, `getPrimaryHome` would pick the *stray* empty
home and hijack sign-in. `cleanup-homes.ts` deletes the strays AND stamps `isPrimary:true` on the
real SF Condo membership for `OWNER_EMAIL` (default `bcworkrelated@gmail.com`).

**b. Index deploy must be confirmed built (prod-smoke) BEFORE the functions deploy.** The new
`requireAnyMembership` gate uses the *same* `members.uid` collectionGroup index. Deploying
functions before the index finishes building would brick 7 callables during the build window.

**c. The emulator does NOT enforce Firestore indexes.** This is the single fact behind the whole
launch incident. `scripts/ops/prod-smoke.ts` and `src/test/indexCoverage.test.ts` (a static guard
that fails if any `collectionGroup(...)` query in the repo lacks a matching COLLECTION_GROUP index
in `firestore.indexes.json`) are the compensating controls. Keep both green.

**d. A fieldOverride REPLACES automatic single-field indexing.** Each override in
`firestore.indexes.json` re-lists COLLECTION-scope ASC/DESC/CONTAINS plus COLLECTION_GROUP ASC on
purpose — not decorative.

**e. Never re-run `scripts/import/20-firestore.ts`** — it resurrects the deleted test homes. Only
`40-reparse.ts` is safe to re-run (Wave 3).

**f. Real storage bucket is `homehub-2068d.firebasestorage.app`** (the `.appspot.com` variant does
not exist). If `.env` had the wrong value at hosting build time, all media 404s — the §4 preflight
catches this.

---

## 6. After Wave 1 — the remaining waves (see plan for detail)

- **Wave 2** — console config + live verification: VAPID key + real config into
  `public/firebase-messaging-sw.js`, reset-email action URL, budget alert, full DoD §5 functional
  walkthrough on prod data, push device test. One hosting redeploy.
- **Wave 3** — re-parse manuals (functions already carry the parseCore nested-array fix; dry-run
  `40-reparse.ts`, review count ~26, then `CONFIRM=IMPORT`).
- **Wave 4** — custom domain cutover → Apple Sign-In → invite flow (`getInviteDetails` callable) →
  mobile visual baselines + CI visual job → **disable anonymous provider** → v1 Supabase
  retirement → nodejs22 runtime bump (before 2026-10-30).

---

## 7. Pointers

- **Plan (authoritative):** `~/.claude/plans/modular-baking-meadow.md`
- **Migration ledger:** `MIGRATION_STATUS.md`
- **Definition of Done / verification checklist:** `docs/DEFINITION_OF_DONE.md`
- **Ops scripts:** `scripts/ops/cleanup-homes.ts`, `scripts/ops/prod-smoke.ts`
- **Import scripts:** `scripts/import/` (00-preflight → 40-reparse)
- **The root-cause query:** `src/modules/home/services/homeService.ts` (`myMemberships()`,
  collectionGroup `members.uid`).
