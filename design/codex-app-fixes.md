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
| F2 | Already handled by the new Home (`HomeLoadNote`, and `failed` from `fetchExtras`). Verified; both layers already have tests. |
| F3 | `registerNativePush` answers "on" only after APNs names the token and the token is stored. A failure is returned and shown. |
| F5 | The Tasks row's text is a real button (`aria-expanded`) on both trees, beside Mark done, never around it. |
| F6 | `lazyWithRetry` reloads only when the server confirms the build was replaced (`probeBuild`; the error text alone cannot tell offline from stale). Otherwise the route shows "Couldn't load this page" with Try again. |
| F7 | The Ask stream is aborted after 60 s with no data and fails with the existing Try again. |
| F8 | `CareBlock`: failed instance reads show "Couldn't load this item's due dates." with Try again. |
| F10 | Already handled: Warranties is a view of Items, whose load error has Try again. Verified, and pinned for `?view=warranties`. |
| S6 | AI answers never render an image. The alt text is shown in its place; links stay. |
| S1 | Investigated, not built. See "Not built" below. |
| F9 | Investigated, not built. See "Not built" below. |

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

## Not built, and what each would take

**S1, storage links outlive membership.** Photos, receipts and manual PDFs are shown through Firebase download-token URLs (`getDownloadURL`). A token URL is a bearer link: it skips Storage rules, never expires, is the same for everyone who ever asked, and the app also keeps it in `localStorage` (`storageUrlCache`, up to 200). So a removed member keeps working links. The app-side half of a fix is contained (read bytes with `getBlob` under the member's sign-in, show them through `blob:` URLs, cache nothing that outlives the session; the CSP already allows `blob:` images), but it cannot be proven or shipped from app code alone:

1. `getBlob`/`getBytes` are cross-origin requests with an auth header, so the bucket needs a CORS policy naming the app's origins (hosting, the preview channels, the iOS shell). Without it every photo and manual fails to load. That is bucket configuration, not code.
2. Existing tokens stay valid until each object's token is revoked (Admin SDK or console, per object). Without that step the leak is unchanged for everything already uploaded.
3. The in-app manual viewer loads an uploaded PDF by handing its token URL to the `proxyPdf` function (`pdfProxySource`). That path would have to read by object path, checking the caller's membership, which is functions work. (The parse worker already reads with the Admin SDK and is unaffected.)
4. Legacy objects outside `homes/{homeId}/` are readable by any signed-in user under today's `storage.rules` (finding S2), so auth-only reads do not protect them until they are migrated.

Smallest safe order: set bucket CORS, ship the `getBlob` reader behind it, move the viewer's PDF path, then revoke tokens. Cost to weigh: photos would no longer be cached by the browser across launches unless the app keeps its own cache.

**F9, first start with no signal.** The iOS app is a shell that loads the live site, and this repo has no native project. On a first launch with no signal the WebView has nothing to show, and none of this app's code has run, so nothing here can draw a message. Two real options, both the owner's call:

1. Native shell (the v1 repo's `ios/`): bundle a small offline page and point Capacitor's `server.errorPath` at it ("You're offline. Homehub needs a connection the first time." with Try again). Small, needs an App Store build, and covers the true first launch.
2. A service worker that caches the app shell. It makes every later offline launch open, but cannot help the first one (it installs on the first successful load), and it changes how deploys reach phones (the stale-build problem F6 touches). That is an offline-support architecture decision, so it was not started.

Option 1 is the only one that fixes the finding as written.

## Done means

- One commit per finding, each with a unit test that fails without the fix.
- Every failure-path fix has a test that forces the read or write to fail and asserts the error text and Try again are on screen.
- D4 and D5 are tested with a completion landing mid-save, against the in-memory Firestore (which now models transactions).
- `npx tsc -b`, `npm run lint`, `npm test`, `npm run build` all pass at the end.
- Not verified here: emulator, e2e and on-device runs (another job holds the emulators).
