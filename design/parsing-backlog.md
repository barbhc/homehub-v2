# Manual-parse → Care — backlog

Tracking what's intentionally **not** built after the round-2 redesign (slices 1–5
+ review fixes + the preview/save parity pass). The shipped surfaces are complete
and green; these are the known follow-ups.

## Functional follow-ups

- **Warranty on the preview→review→save path.** `parse-manual` (auto-parse-on-add
  for primary manuals + rescan) persists the structured warranty fields
  (`warranty_exclusions` / `registration_required` / `contact`). The
  preview→review→save path (reference manuals, and explicit "Parse" on an unparsed
  manual) does **not** — `preview-manual` deliberately skips warranty extraction,
  and `save-parsed-manual` doesn't write it. Primary manuals (the usual warranty
  source) are covered; reference/edge-case manuals won't populate warranty until
  this is mirrored. `applies_to` (variant) and supplies **are** now closed on both
  paths (round-2 follow-up).
- **Rescan bypasses "Sort it right."** Rescanning a primary manual auto-commits;
  the parse-review screen only appears on the parse/reference path. Decide whether
  rescan should also route through review.

## Deferred from the design review (§4) — confirm before building

- **Q4 — `symptom_tags` troubleshoot flow.** Data is produced (canonical tags on
  tasks); the Fix-it entry point that consumes them isn't built.
- **Q3 — `content_level` broad use.** Only the critical-safety callout uses it; no
  other surfacing yet.
- **Q8 — `manufactured_year` in Specs** ("~N years old"). Column populated by the
  parser; not surfaced.
- **Q10 — `table_data`.** Captured to chunk metadata; no table renderer.
- **Q2 — explicit "Pro" field.** The Pro pill is still a `risk_level` + keyword
  heuristic; no `requires_pro` / `hazard_class` field on the parser.

## Smaller follow-ups

- **Q13 — stabilize `external_key`.** It's title-based, so renaming a task between
  rescans resets its completion history. Stabilize the key (and consider a
  "changed since last scan" affordance).
- **Soft-deleted `supply_item` not filtered** in the "You'll need" chip read. Only
  bites if a catalog item is soft-deleted after it's linked to a task (not in any
  current flow); add a `deleted_at` guard to the embed if that flow appears.
- **Variant picker needs ≥2 tagged variants** to appear. If a manual tags only one
  side (e.g. "gas" steps, electric left untagged), the picker won't show — depends
  on parser tagging quality.
- **Per-task `confidence` is review-only**, never persisted (no `task_template`
  column). Fine today; revisit if we want post-commit "needs review" surfacing.

## Test infrastructure

- **Visual baselines are Linux-runner-baked.** Any real UI change needs the
  `e2e.yml` `update_baselines` workflow re-run. The `freeze()` height-stability
  settle fixed the observed full-page snapshot flakiness, but it's a heuristic — if
  a data-heavy page ever has genuinely per-run-variable content, mask that region.
