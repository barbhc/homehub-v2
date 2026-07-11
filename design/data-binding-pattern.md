# The recurring bug: don't flatten the dataset — bind to the curated array

Read this before fixing any "list," "spec," or "guide" surface. The same defect has now appeared on **three** desktop pages, and will keep recurring until the class of bug is fixed, not the symptoms.

## The pattern
Each of these surfaces is designed to show a **short, curated set** of records. The build keeps populating them by **flattening the entire underlying cleaning/manual dataset** — every per-item sub-step, every extracted manual paragraph — into the surface. Result: lists of 30–40 micro-rows, spec cards full of manual prose, pages that scroll for thousands of pixels, and layouts that blow out.

## Where it has shown up
| Surface | Should render | Was rendering | Correct source |
|---|---|---|---|
| Home → Deep-clean guides | ~4 curated guides | 30+ cleaning sub-steps | `HH_GUIDES` |
| Item → Specs | short key→value pairs | full manual paragraphs | `ex.specs` (`itemExtras(id)`) |
| Tasks → This week | ~8–12 recurring tasks | 35 cleaning micro-steps | `HH_TASKS`/`HH_TASKS_ENGAGED` + `HH_UPKEEP` |

## The rule
- **Bind each surface to its named, curated data array** (above). Render that array as-is.
- **Do NOT** derive these surfaces by enumerating every cleaning step or every manual section in the dataset.
- Granular cleaning sub-steps live **inside a guide** (when the user opens it), never as top-level tasks/guides/specs.
- Long manual prose lives in the **manual viewer** / "From your manual" snippets, never in Specs or as a task.
- If a curated array is the wrong length on screen (e.g. dozens of rows), that's the tell you've bound to the raw dataset instead of the curated one — stop and re-check the source.

## Quick self-check before shipping any list/spec/guide
1. How many rows render? If it's far more than the prototype shows, you're flattening.
2. Is each row a meaningful, user-facing unit (a real task / a real spec / a real guide) — or a micro-step / a sentence of manual text?
3. Does the data source match the named array in the spec component, or is it `dataset.flatMap(...)` over everything?

Fixing this once, as a shared data-binding fix, resolves the Home, Item, and Tasks pages together.
