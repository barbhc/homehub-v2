# Codex review, app-only fixes

**Scope:** 16 findings from the 2026-11-21 Codex review (ids as in the review notes), app code only.
No change to `firebase/functions/`, the rules files, the native shell, `Settings.tsx` or `HomeSetup.tsx`.
Each finding was re-checked against today's `main` before anything was written.

## One line per finding

| Id | Fix |
|---|---|
| D4 | Snooze and its Undo decide inside one transaction: only an instance that is still open is written. A done one answers "That task was already done." |
| D5 | Every cadence editor (`applyCadence`, `updateTaskSchedule`, `saveItemTaskReview`) reads the template and each open occurrence through the transaction it writes in; a stale instance query starts the save over. |
| D6 | Unsent Dones stay on the device, keyed by account, across sign-out. Only that account's next sign-in sends them. No dialog. |
| D9 | `getPrimaryHome` skips a deleted or missing home and tries the next membership. |
| D10 | `updateTaskCareType` calls the existing `syncTemplateDenormToInstances` in the same batch. No second sync path. |
| F1 | `ParsePickupCard`: a failed draft read shows "Couldn't load what we found." with Try again. |
| F2 | Already handled by the new Home (`HomeLoadNote`). Verified, and pinned at the data layer with a test. |
| F3 | `registerNativePush` answers "on" only after APNs names the token and the token is stored. A failure is returned and shown. |
| F5 | The Tasks row's text is a real button (`aria-expanded`) on both trees, beside Mark done, never around it. |
| F6 | `lazyWithRetry` reloads only for a stale build (`isStaleChunkError`); anything else reaches the error screen and its Try again. |
| F7 | The Ask stream is aborted after 60 s with no data and fails with the existing Try again. |
| F8 | `CareBlock`: failed instance reads show "Couldn't load this item's due dates." with Try again. |
| F10 | Already handled: Warranties is a view of Items, whose load error has Try again. Verified. |
| S6 | AI answers never render an image. The alt text is shown in its place; links stay. |
| S1 | Investigate only. Written up, not built (needs bucket CORS and token revocation). |
| F9 | Investigate only. Written up, not built (native shell or service worker). |

## Edge cases for the data fixes

**D4, snooze**
1. Someone completes the task between the read and the write: the transaction re-runs, sees `done`, writes nothing, and the row leaves with "That task was already done."
2. Undo of a snooze after someone completed it: same answer, the completion stands.
3. Undo when the task is no longer snoozed (someone else already brought it back, or re-dated it): nothing is written and nothing is claimed.

**D5, cadence**
1. A completion lands after the instance query and before the commit: the occurrence was read through the transaction, so Firestore re-runs the save against the completed instance and its successor. The completed one is never written back to `scheduled`.
2. A completion lands between the query and the transactional read: the two disagree, the save starts over (up to 3 times), then fails with a plain message rather than guessing.
3. Two devices change the cadence of a task with nothing open: both read the template in their transaction, the second re-runs and finds the first one's occurrence, so only one is created.

**D6, Dones across sign-out**
1. Done offline, sign out, sign in as someone else: the other account never sees or sends it, and it stays on the device.
2. Then sign back in as the first account: it is sent as that account, on the day it was tapped.
3. Two members of one home each leave a Done for the same task on one device: entries are keyed by account as well as task, so neither overwrites the other.

## Done means

- One commit per finding, each with a unit test that fails without the fix.
- Every failure-path fix has a test that forces the read or write to fail and asserts the error text and Try again are on screen.
- D4 and D5 are tested with a completion landing mid-save, against the in-memory Firestore (which now models transactions).
- `npx tsc -b`, `npm run lint`, `npm test`, `npm run build` all pass at the end.
- Not verified here: emulator, e2e and on-device runs (another job holds the emulators).
