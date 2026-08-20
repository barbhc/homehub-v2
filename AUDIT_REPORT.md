# App Audit Report: Homehub v2

**Date**: 2026-08-19
**Auditor**: Claude App Audit
**Version**: v1 of the v2-app audit (the prior 7.7/10 report covered the retired Supabase app)
**Context**: Pre-beta gate — ~10 testers in 1–2 days. Key flow: new account → add home → add items → useful tasks. Multi-home (Sonia). Deploys pre-approved; prod smoke with throwaway accounts authorized.

## Executive Summary

Homehub v2 is in genuinely strong shape for a friends-scale beta, and the single most important sentence in this report is: **the key flow was proven end-to-end in production during this audit, as a brand-new user** — account created, home created, a Levoit Core 300 identified correctly by the live resolver, its manual found (junk hosts filtered, the wrong-variant warning firing), parsed, reviewed, and **3 relevant tasks committed to the schedule**. The throwaway account was deleted afterward.

The audit's headline catch was a dead end on exactly that flow: attaching a manual from the item page parsed successfully into a draft that **no UI ever surfaced** — the page kept saying "no manual yet" while 7 tasks sat unreachable. That, plus the discovery that a single-home user had no path to add a second home (Sonia's exact setup order), were both fixed, verified in production, and deployed during the audit (#119). The recurring disease this week — code merged but not deployed — was also closed wholesale: all 26 functions, the gate rules, and hosting now match main, verified against deployed bundles and live behavior, not exit codes.

What remains is polish and process, not blockers. The one thing to decide before invites: whether the invite gate should be ON (codes exist for none today; it currently fails open by design).

**Overall Score: 7.6 / 10** (weighted; security and stability weighted up per context)

## Scorecard

| Dimension | Score | Trend | Summary |
|-----------|-------|-------|---------|
| Usability | 7/10 | — | Key flow completes; tour hijacks it mid-task; in-flight parse invisible from item page |
| Design | 8/10 | — | Cohesive token system, calm tiers, teaching empty states, 4-viewport suite |
| Innovation | 8/10 | — | Manual-grounded tasks + preview-first + suggest-never-assume enforced deep |
| Competitiveness | 7/10 | — | Differentiated vs Centriq/HomeZada on grounding; not re-researched this round |
| Code Quality | 8/10 | — | 686 tests green; 3 console.log / 1 `any` / 1 TODO; a few 1,000+ line pages |
| Stability | 7/10 | — | Preview-first protects data; Sentry live; CI billing-blocked = no merge net |
| Security & Privacy | 8/10 | — | Tenant gate proven live 4/4; SSRF hop-guard; keys rotated; 6 moderate CVEs open |
| Extensibility | 8/10 | — | Module pattern, shared/, SYSTEM.md regenerated from deployed reality |
| Affordability | 8/10 | — | App-wide monthly ceiling **verified accounting live**; refunds on failure |
| Speed | 7/10 | — | 625ms web boot (measured prior); photo URL cache; 584K firebase chunk |

## Automated Scan Results

- **Build**: pass (6.3–9.6s) · **Functions tsc**: clean · **Tests**: 686 passed, 6 skipped
- **npm audit**: 0 critical / 0 high / **6 moderate** / 0 low (9 highs cleared in #108)
- **Hygiene**: 3 `console.log`, 1 `: any`, 1 TODO — exceptional
- **Oversized files**: Settings.tsx 1520, FaqPage 1167, DeepClean 1112, IdentifyStep 1222
- **Bundle**: 19MB total assets; entry ~436K, firebase chunk 584K; routes lazy-split
- **localStorage**: 13 keys enumerated — device prefs, caches, deep-link parking; **no tokens, no PII**
- **Secrets**: none in client code; the compromised `sk-ant-…Qv` key rotated, revoked, misnamed secret deleted (today)
- **Sentry**: DSN live in the served entry (verified by key prefix; DSNs are write-only by design), release-stamped source maps

## What This Audit Changed (all verified against deployed artifacts or live behavior)

| Action | Proof |
|---|---|
| Deployed all 26 functions from main | `chargeAiQuota`/`monthlyCeiling` in `dist/index.js` of the deployed source |
| `redeemInviteCode` created (was never deployed) | create operation + bundle check |
| Firestore rules with the growth-gate clause released | deploy + fail-open confirmed by live sign-up |
| Hosting released twice (main, then #119) | live entry hash + behavior |
| **Fixed: parse drafts invisible from item-page attach** (#119) | prod: card appeared, review → 3 tasks committed, draft cleared |
| **Fixed: single-home users had no "Add a home" door** (#119) | Sonia's setup order now possible from the empty state |
| Storage tenant smoke | 4/4 pass against prod (member/legacy/non-member/anon) |
| App-wide spend ceiling | `aiSpendGlobal/2026-08` = 4 calls / 32 units, per-function breakdown |
| productLookup end-to-end | live Brave → "Levoit Core 300 · Air purifier", explicit apply |
| Throwaway cleanup | home recursively deleted; auth user removed; guarded by email pattern |

## Detailed Findings (abridged — evidence inline)

### Usability — 7/10
**Strengths**: two-lane add; per-step truthful headers; identity proposed never applied; manual-first with beta-labelled search; mismatch warning ("This manual is for the Core 300S — you entered Core 300"); category/room pickers symmetric; teaching empty states.

| # | Finding | Severity | Evidence |
|---|---|---|---|
| 1 | Feature tour hijacks the item page mid-first-task, describing the dashboard ("This is your dashboard… 1 of 5") | Major | Fired the moment a new user tapped **Find the manual** during the prod smoke |
| 2 | Item-page manual attach shows no on-page state while parsing (dialog says "reading", page still says "no manual yet" until done) | Minor→Major for first-run | Observed live; post-#119 the *finished* state surfaces, the *in-flight* state still doesn't |
| 3 | "What's new — Smarter categories" banner shown to a brand-new account | Minor | First screen after onboarding |

### Security & Data Privacy — 8/10
**Strengths**: deny-by-default rules with membership isolation **proven live**; growth gate fails open by explicit design comment; `fetchGuarded` validates every redirect hop; unauthenticated `healthCheck` retired; quota = per-user daily + global monthly + refunds; Storage IAM prerequisite documented in-file after the #102 incident.
**Findings**: 6 moderate CVEs (transitive, no high); no App Check on callables (fine at this scale, revisit before public); prompts necessarily carry manual text to Anthropic — no user PII observed in prompt paths.

### Stability — 7/10
**Strengths**: preview-first means a failed parse can't corrupt a home; failure-path tests (#104); e2e suite revived (#112); Sentry with sourcemapped releases; household export exists.
**Findings**: CI has never run green (GitHub billing block) — every merge relies on local gates; the pickup dead-end class (fixed) argues for an e2e that walks *item-page* attach, not only the wizard path.

### Affordability — 8/10
Measured spend during the full smoke: 4 charged calls / 32 units (~$0.60 dominated by parse). Ceiling configurable via `AI_MONTHLY_UNIT_CEILING`; worst case for 10 testers ≈ 50 items·week ≈ **$30–40/mo** — comfortably fine.

## Improvement Backlog (curate before it becomes the plan)

| Priority | Item | Dimension | Severity | Effort | Impact |
|---|---|---|---|---|---|
| **P0 — before invites** | Decide invite gate ON/OFF. If ON: mint codes + write `config/growth`. Recommendation: **OFF** for TestFlight friends (TestFlight is the gate) | Security | — | S | High |
| **P0 — before invites** | Suppress/retarget the feature tour so it never fires over a non-dashboard page or mid-task | Usability | Major | S | High |
| P1 | On-page "reading the manual…" state for item-page attach (extend #119's data-keyed card to active parses) | Usability | Major | S–M | High |
| P1 | Hide "What's new" from accounts newer than the feature | Usability | Minor | S | Med |
| P1 | e2e: item-page manual attach → review → tasks (the path the audit caught) | Stability | Major | M | High |
| P2 | Unblock GitHub Actions billing so CI gates merges again | Stability | Major | S (external) | High |
| P2 | Clear 6 moderate CVEs | Security | Minor | S | Med |
| P2 | Prune 3 stale squash-merged worktrees + 2 `.claude/worktrees` leftovers | Code Quality | Minor | S | Low |
| P3 | Split Settings.tsx / IdentifyStep.tsx monoliths | Code Quality | Minor | M | Med |
| P3 | Persist download URL on item docs at upload (kills the first-view photo resolve) | Speed | Minor | M | Low |
| P3 | Refresh competitive landscape (not re-researched this round) | Competitiveness | — | M | Med |

## Not Covered This Round
Device-native retests (push-permission flow, cross-home push tap on a physical phone — still owed from #81); Apple Sign-In path (email/password path proven; Apple button present but not exercised — needs a real Apple ID); competitive re-research.

## Methodology
Automated scans (build, tsc, vitest, npm audit, hygiene greps, localStorage/PII enumeration, bundle sizing); prod-vs-main drift audit across hosting/functions/rules verified by downloading deployed source archives; live production walk of the key flow at 375px as a throwaway account (created → exercised → deleted), including the multi-home switcher and the storage tenant smoke; unmerged-work sweep across all git worktrees. Reference docs: `~/Projects/dashboard/checklists/fleet-review.md`, `docs/launch-readiness.md`.
