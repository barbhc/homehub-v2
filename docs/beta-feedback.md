# Beta feedback log

Running triage of TestFlight feedback. Appended by the scheduled routine
(`.claude/` cron) and by hand; newest first.

Pull it manually any time:

```bash
ASC_KEY_ID=86YGW9ASWY ASC_ISSUER_ID=94e74136-1682-4b9a-912b-668a5de478a7 \
ASC_APP_ID=6794043154 node scripts/ops/testflight-feedback.mjs --new
```

`--new` reports only items not seen before and then records them, so nothing is
reported twice. `--peek` shows new items without marking them seen — use it when
you only want a look.

Severity: **S1** data loss / privacy / cannot use the app · **S2** core flow
broken or badly misleading · **S3** confusing but workable · **S4** cosmetic.

---

## 2026-08-15 — round 3 (owner + second tester)

**Headline: one S1 data bug (the "22 tasks due today" alert) fixed at the
source, in prod data, and in the push counter; four UX proposals from this
round's triage built and shipped together.**

| # | Report / proposal | Severity | Status |
|---|---|---|---|
| 1 | Owner's lock screen: "You have 22 tasks due today" | **S1** | ✅ Fixed 3 ways: `commitDraft` seeded every parsed task due on its creation day → first due is now one cadence out (`addCadence`, seasonal tasks anchor to their season); `commitManualDraft` + `parseWorker` redeployed. The 7 flooded SF-Condo instances re-dated in prod (verified 200s). `sendPushDaily` also counted raw open instances while Home filters item-scoped cleaning — both now share `shared/tasks/agendaEligibility`; deployed |
| 2 | Parse looked like it failed when leaving the wizard mid-parse | S2 | ✅ Built — "Continue in background" on the progress step + item-page pickup card (live stage → "N tasks found — Review" → error), gated on a handoff flag so old manuals never banner |
| 3 | No way to create a room, or change an item's room on mobile | S3 | ✅ Built — tappable room pill → RoomPickerDialog (pick or create); "+ New room…" in the wizard RoomSelector and the desktop edit dialog |
| 4 | Label photo silently became the item's picture; no library option | S3 | ✅ Built — "From library" lane (native photo picker / no-capture input) + "Use as the item's photo?" consent chips, default off |
| 5 | Finding the manual is a dead end when the in-app search misses | S3 | ✅ Built — "Search the web yourself →" pre-filled with brand + model in FindManualCard's dead-end states and the item page's add-manual dialog |
| 6 | Owner: app takes ~3s to load | S3 | ⬜ Open — awaiting Settings → Boot diagnostics numbers from the device before touching anything |
| 7 | Buttons cut off near screen edges (safe area) | S4 | ⬜ Open — needs the exact screens to reproduce |
| 8 | Suggestion icons unclear; lookup provenance (wrong wattage, "Amazon" titles) | S4 | ⬜ Open — provenance labeling proposal not yet commissioned |

## 2026-08-14 — second tester, round 2 (6 reports)

**Headline: all six were already fixed in `main` before this triage.** Every
report predates the commit that addresses it — the tester is on a stale
TestFlight build (last two fix rounds, PR #53 and PR #56, hadn't reached him).
**One action for the owner: cut a fresh TestFlight build from current `main`.**

| # | Report | Severity | Status |
|---|---|---|---|
| 1 | "Still getting this message when I try to use the camera" (red camera error) | S3 | ✅ Fixed (PR #56) — same as #4; sent 4 min before that fix merged |
| 2 | "My name appeared in Home Members only after switching tabs and back" | S3 | ✅ Fixed (PR #53) — members list now refetches on save |
| 3 | "Let me add my name right here instead of scrolling to the bottom of Settings; it also didn't update immediately" | S3 | ✅ Fixed (PR #53) — inline name field added to the member row; saves and reloads in place |
| 4 | "Took the photo, then this message popped up" (camera error after a successful shot) | S3 | ✅ Fixed (PR #56) — the photo-picker fallback no longer shows a red error; only a real permission denial surfaces a message |
| 5 | "I accidentally deleted a task in the Later section — can you restore it?" | S2 | ✅ Not deleted; explained + fixed (PR #53). He *snoozed* the Dishwasher filter task (alive, snoozed to Aug 20, due Sep 1). The row vanished silently with no undo, so it *felt* like data loss. Snooze/complete now show a receipt with Undo |
| 6 | "Tapped the Search field, the app zoomed in and wouldn't go back" | S2 | ✅ Fixed (PR #53) — the Items search input was 15px; iOS auto-zooms any focused input under 16px and a Capacitor shell has no way to zoom back out. All touch inputs floored at 16px |

**What made them look like bugs:**
- **#5** looked like S1 data loss but nothing was lost — a snooze with no visible
  result and no undo is a destructive action *from where the user sits*, whatever
  the database did. Verified against prod: exactly one task changed that minute,
  and it was snoozed, not deleted.
- **#1/#4** the camera fallback *worked* (he got his photo) — we were just
  announcing our internal reroute to the photo picker as a red error.
- **#2/#3** the round-1 name fix saved the name but never refetched the list, and
  pointed the user at a field buried at the bottom of Settings.

## 2026-08-12 — first outside tester (9 reports)

| # | Report | Severity | Status |
|---|---|---|---|
| 1 | "The app greeted me as Barb" | S2 | ✅ Fixed — owner's name was hardcoded in both Home headers (PR #50) |
| 2 | "Other people show as unknown" | S3 | ✅ Fixed — `users/{uid}.fullName` was never written; now seeded from the auth provider (PR #50) |
| 3 | "Blank Home Screen when I first logged in" | S2 | ✅ Fixed — skeleton now explains itself after 6s (PR #50) |
| 4 | "I had a list of tasks on my brand new account" | S3 | ✅ Explained — he is a legitimate admin of SF Condo. Home now names the home (PR #50) |
| 5 | "There were tasks here on my task list" | S3 | ✅ Same as #4 |
| 6 | "I have items I didn't add on my items tab" | S3 | ✅ Same as #4 |
| 7 | "How did I become a home member with my new account?" | S3 | ✅ Same as #4 |
| 8 | "The dark theme colors are off" | S4 | ⬜ Open |
| 9 | "Formatting on the box is off — text and light green boxes too close to the edges of the gray box" | S4 | ⬜ Open |

**Verified during triage:** prod holds exactly 3 homes and 2 accounts, none
created during his session. Nothing leaked; the public link is safe. The scare
came from correct behaviour being indistinguishable from a breach — which is
why #4–#7 were treated as a real (UX) bug rather than dismissed.
