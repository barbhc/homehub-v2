# Account after the list

Approved 2026-11-20 (mock: https://claude.ai/artifact/PBDvYh7MXrHZzibneCCRUH, v2).
Supersedes the sign-up-first order in `design/first-minute-onboarding.md` and the
invite-code gate on step 1.

## The change

Today: Landing → Create account → Zip (+ invite code) → Area → List → Home.
Now: Landing → Zip → Area → List → **Keep your list** → Home.

- "Get started" (landing hero and closing card) opens `/onboarding/first` with no account.
- Zip, area and list run entirely on the device: the zip table ships with the app,
  the list is computed locally. Nothing is written to Firestore before sign-in.
- "Add N tasks" (or "Not now") with no account opens the **Keep your list** sheet:
  Continue with Apple, or Continue with email (email + password, no name field;
  "Already have an account? Sign in" switches the form).
- After sign-in the home, its profile (zip, area, home type, answers) and the picked
  tasks are saved together, then Home.
- The invite code is gone from the client. `config/growth.inviteGateEnabled` is set to
  `false` in production before this ships (missing doc = ON, so it must be written).
  The rules gate and `redeemInviteCode` stay deployed but dormant; removing them needs
  a rules + functions deploy (follow-up, owner approval).
- Household invites (`/invite/:token`) are a different thing and are unchanged.

## Data model

One localStorage draft, `homehub:firstMinuteDraft` (versioned, schema-checked on read):

| Field | Meaning |
|---|---|
| `profile` | The profile fields the steps would have written (zip, climate, freeze_risk, climate_source, area, home_type, completed_at) |
| `step` | Where the person is, so a reload (Apple's redirect) returns there |
| `list` | The list screen's choices (answers, checks, removals, corrections, month) |
| `pending` | What they asked to save while signed out: `{ kind: "add", keys, due }` or `{ kind: "keep" }` |
| `createdHomeId`, `addedKeys` | Progress of a save that failed half way, so Try again never makes a second home or a duplicate task |

The draft is cleared after a successful save. A signed-in person with no home (an
account made at /signup, or a home that was deleted) walks the same flow and saves
on tap, with no sheet.

## Edge cases

1. **Apple redirect** (web fallback, native shell without the plugin): the page
   reloads. The draft brings back the step, the list choices and `pending`; when auth
   resolves with `pending` set, the save runs by itself.
2. **The account already has a home** (someone signed in with an existing account):
   no second home is created. The sheet asks "Add these N tasks to <home>?" — Add, or
   Don't add. Its own profile answers are never overwritten. "Not now" just goes Home.
3. **The save fails half way**: the home was created but the profile or a task write
   failed. The sheet stays open with the error; Try again reuses `createdHomeId` and
   skips `addedKeys`.

## Failure modes

- Membership lookup fails → stop, say we couldn't check the account, never create.
- Home create refused (gate somehow on, rules) → "Couldn't create your home" error in
  the sheet, nothing saved.
- localStorage unavailable (private mode) → the flow still works in memory; only the
  redirect resume is lost (logged).

## Done means

- J1 journey walks Landing → zip → area → list → Add → sheet → email sign-up → Home.
- Unit: draft round-trip, commit (new home, existing home, partial failure + retry),
  sheet failure path shows an error, never success.
- Build, lint, design check, all four emulator suites green; adversarial review.
