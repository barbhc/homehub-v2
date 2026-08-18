# Scope: make the add-item wizard preview-first

**Status: BUILT and deployed — PR #77 (2026-08-17).** Option A, as recommended.
Net −527 lines. Kept as the record of why, and of the one coupling that had to
be handled (the pickup card, below — it was real).

Verified against the emulator with the real callable: a manual carrying a
previewDraft has 0 task templates, `commitManualDraft` creates them, and the
draft is cleared afterwards so it cannot reappear.

## Why this exists

Every path that turns a manual into tasks now previews first and commits only
what the user accepts — **except the add-item wizard**, which commits the parse
and then reviews the live rows. Two testers hit the review-after-commit model
without knowing it, and the sweep left it as the last inconsistency.

It is not currently broken. The wizard *does* show a review. The problems are
narrower than "it commits early":

1. **Abandonment writes.** Close the wizard during review and the tasks stay,
   unreviewed. That is the exact shape of "these items just appeared."
2. **No parser feedback.** `ParseReviewStep` has no `TaskReviewFeedback` block
   and records nothing — so corrections made in the app's *highest-volume*
   review surface never reach the graduation loop. The item-page sheet captures
   them; the wizard does not.
3. **Two review UIs to maintain.** 666 lines (`ParseReviewStep`, live rows) and
   787 lines (`TaskReviewSheet`, preview rows) that do the same job. Every
   review fix so far has had to be made twice or has silently landed in one.

## The options

| | A. Point the wizard at `TaskReviewSheet` | B. Convert `ParseReviewStep` to preview data | C. Leave it |
|---|---|---|---|
| Review UIs afterwards | 1 | 2 | 2 |
| Wizard gains feedback capture | yes | only if also built | no |
| Abandonment writes nothing | yes | yes | no |
| Wizard's 4-bucket UI | replaced by the 2-step sheet | kept | kept |
| Rough effort | **1–1.5 days** | 2–3 days | 0 |

**Recommendation: A.** B keeps a second review implementation alive, which is
the thing that keeps costing us. The wizard's bucket UI is not obviously better
than the sheet's two-step flow — the sheet is the newer design and is what the
item page already uses, so A also makes the two entry points feel like one app.

## What A actually changes

- `SmartAddItem.runParseAfterManualUpload` → `mode: "preview"`, then render
  `TaskReviewSheet` with the draft instead of fetching committed rows.
- Commit on save via the existing `commitManualDraft` callable (already used by
  the item page; no new server work).
- Delete `ParseReviewStep.tsx` (666 lines) and its live-mutation imports
  (`archiveTaskTemplate`, `updateTaskCareType`, `updateTaskSchedule`,
  `archiveChunk`) **if** nothing else uses them — check first, they are
  legitimate item-page operations.
- Wire `onFeedback` → `recordParseFeedback` so wizard corrections finally reach
  the graduation loop.

## What breaks and must be handled

**The parse pickup card is the real coupling.** `ParsePickupCard` currently
offers "N tasks found — Review", and its button (`ReviewItemTasksButton` →
`loadItemTasksForReview`) loads **committed** tasks. Under preview-first an
abandoned wizard parse has none, so that button would open an empty review.

Fix: when the manual has a `previewDraft` and no committed tasks, the pickup
card must open `TaskReviewSheet` on the draft instead. This is the piece to get
right — it is the same "left the wizard mid-parse" case the card was built for.

Also:
- **Draft lifecycle.** `previewDraft` currently lingers after commit. Decide
  whether the commit clears it; an abandoned draft should probably expire rather
  than reappear months later.
- **Session resume.** `wizardSession` already normalises `parsing`/`review` →
  `manual` on resume, so a resumed session re-parses. Confirm that still reads
  sensibly when the first parse produced an uncommitted draft.
- **Wizard progress/stepper.** `parseFlowCompleted` and the `completedSteps`
  logic key off the review step; both need to move to "saved the review".

## Test plan

- Emulator: parse → review → save → tasks exist with correct first-due dates.
- Emulator: parse → **abandon** → item has zero tasks and the pickup card opens
  the draft rather than an empty review.
- Feedback: a cadence change in the wizard review produces a `review_save`
  feedback row (it produces none today).
- Regression: item-page add-manual and rescan paths unchanged.

## Honest read

This is cleanup with a real but bounded payoff: one review surface instead of
two, feedback from the busiest review point, and no writes on abandonment.
It is **not** urgent — no open bug report depends on it. Worth doing before the
next round of review-UI changes, so the next fix only has to be made once.
