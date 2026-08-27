# The design-QA loop

How design feedback moves from the owner's eye to merged code, written after
round 18 (2026-08-27), when a few hours of live pair-QA produced good findings
slowly. Homehub first; generalize once it has survived a few rounds here.

## What the slow version got wrong — measured, not vibes

One afternoon of the old loop, itemised:

1. **Almost every design note was about a hand-drawn mockup of an existing
   screen** — wrong weights, wrong font, icon size, spacing. The drawing was a
   proxy, and judging the proxy taught us nothing about the product.
2. **The proxy lied about the one thing it was asked.** The mockup's phone
   (358px content, 11px type) said the scan-card copy fit; the real component
   wrapped at 375 AND 390. Two full cycles spent on fiction.
3. **One finding per cycle.** Each observation triggered a complete
   mockup → code → verify → deploy round before the next observation. Six
   sequential cycles; a 20-minute QA pass would have found all six up front.
4. **Feedback lived in chat**, so decisions, backlog items and fixes were
   interleaved and nothing was addressable later.

## The loop

### 1. Split every screen question by whether the screen exists

| The screen… | The surface | Why |
|---|---|---|
| exists | **`npm run shots` gallery** — the real component, real widths | Judging real pixels; nothing to mistranscribe |
| doesn't exist yet | **Mockup artifact** | There is nothing real to capture; drawings are for proposals |

A mockup of an existing screen is the anti-pattern that caused #1 and #2.
Never redraw what can be captured.

### 2. The harness (existing screens)

- `/__preview` (dev builds only) renders any registered component state by
  URL: `src/dev/previewScenarios.tsx` is the registry. States that are hard to
  reach by clicking — "lookup found two specs", "manual awaiting review" — are
  one entry each.
- `npm run shots` (dev server on `PW_WEB_PORT`, emulators up) captures every
  scenario at **375 / 390 / 430** and builds `design-shots/gallery.html`.
- The gallery is published as ONE artifact, updated in place. Owner comments
  inline on the shot; Claude reads the threads, fixes, re-shoots, republishes,
  replies in-thread and resolves.
- **A design change lands in the registry in the same PR** when it adds a
  state worth judging. A state nobody can see is a state nobody reviews.

### 3. Cadence: batch by default, blockers jump

- The owner QAs uninterrupted and leaves comments (gallery, mockup, or chat).
- Claude triages the whole batch: proposed fix + cost per item, in one table.
- The owner sorts each item: **now** (this branch) / **backlog** / **reject**.
- One build cycle for everything marked now; one verification; one redeploy.
- Exception: anything that blocks further testing is fixed immediately.

### 4. Findings that aren't fixed now go ONE place

`BACKLOG.md`, with the report date and the screen. Not chat scrollback, not a
comment thread, not memory. A finding with no backlog row and no fix is lost.

### 5. Copy fit is CI's job, not review's

Any line that must hold one line beside a fixed element gets a fit test
(`e2e/emu/scan-fit.spec.ts` is the pattern: measure the rendered line at
375/390/430, fail on wrap). The next person to lengthen the sentence hears it
from CI, not from a phone screenshot.

## Roles

| | Owner | Claude |
|---|---|---|
| Finds issues | ✓ (by using it) | ✓ (by screenshot review) |
| Decides priority + approach | ✓ | proposes |
| Judges fit/spacing claims | on real pixels only | measures, never asserts from a drawing |
| Merges QA-gated PRs | ✓ | never without her word |

## Invariants carried over from round 18

- Draft PR per QA round; the standing merge authorization is suspended for it.
- Verify deploys by grepping content, never by status code.
- Mock (or capture) before building — a visible change the owner first meets
  as a diff is a process failure, whoever it inconveniences.
