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
