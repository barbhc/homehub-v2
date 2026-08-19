# Invite gate — the growth throttle

A cap on how fast strangers arrive. It is three things at once, which is why it
is worth the small amount of machinery:

- a **growth** throttle — you meet your first users a handful at a time;
- a **cost** throttle — every new account can spend 50 AI units a day, so the
  number of accounts is the number that multiplies the bill;
- an **abuse** throttle — a leaked link is worth nothing without a code.

## ⚠️ Rules do not deploy themselves

The gate lives in `firestore.rules`. **Merging is not deploying** — Hosting
auto-deploys on merge, rules never have. PR #102 found the live rules 19 days
stale, which meant PR #94's tenant-isolation fix had never actually been live.

So after this merges:

```bash
firebase deploy --only firestore:rules --project homehub-2068d
```

Until that runs, `invite-codes.ts on` flips a flag that nothing reads, and the
gate is off no matter what the flag says. Confirm with the deployed-rules check
in `docs/launch-readiness.md` rather than assuming.

## Turning it on and off

**No deploy, no code change** — that was a requirement, and it is a single
Firestore field:

```bash
npx tsx scripts/ops/invite-codes.ts on      # gate ON
npx tsx scripts/ops/invite-codes.ts off     # gate OFF
npx tsx scripts/ops/invite-codes.ts status
```

Turning it off leaves the codes and admissions in place, so turning it back on
resumes exactly where it left off.

## Handing out codes

```bash
npx tsx scripts/ops/invite-codes.ts mint 5 --uses=1 --days=30 --note="round 1"
npx tsx scripts/ops/invite-codes.ts list
npx tsx scripts/ops/invite-codes.ts revoke ACDE2345
```

Codes avoid the glyphs people mistype (`O/0`, `I/1/L`, `S/5`, `B/8` — one side of
each pair is dropped), and are compared case- and punctuation-insensitively, so
`homehub-2026` and `HOMEHUB2026` are the same code. A code read off one phone
gets typed into another; anything else turns the gate into a support queue.

A code with **no `maxUses`** is single-use, not unlimited. That is the safe
reading of a field somebody forgot to set.

## Where it is actually enforced — and why not at sign-up

**At home creation, in `firestore.rules`.** Not at sign-up, because sign-up is
Firebase Auth talking to Google with a **public** API key: any client-side check
there is a suggestion, and anyone can call the Auth REST endpoint directly.

Creating a home is the first thing that costs anything and the precondition for
everything else — every paid Cloud Function already requires membership in a home
(`requireAnyMembership`). So one rule on `homes` create gates the whole app:

```
no code → no admission → no home → no membership → no paid calls, and no data
```

A gated account can still exist in Firebase Auth. It just cannot do anything or
cost anything.

## The pieces

| Path | Who writes it | What it is |
|---|---|---|
| `config/growth` | Admin SDK only | `{ inviteGateEnabled: boolean }` — the flag |
| `inviteCodes/{CODE}` | Admin SDK only | uses, maxUses, expiresAt, disabled, note |
| `admissions/{uid}` | `redeemInviteCode` only | proof this user was let in |

`inviteCodes` is **unreadable and unlistable by every client**. A readable code
collection is a code generator: any signed-in user could list the valid codes and
hand them out, and the gate would be gone.

`admissions/{uid}` is self-readable so the client can tell "already admitted"
from "needs a code" without a round trip — but only the callable writes it, so
admission cannot be self-granted.

## Deliberate decisions worth not re-litigating

**It fails OPEN when `config/growth` is missing.** Deploying the rules before the
flag doc exists must not lock every existing user out of creating a home. That is
safe because this is a *throttle*, not the security boundary — tenant isolation
is membership, and it is untouched — and no client can write or delete
`config/growth` to force the open state.

**Redeeming twice consumes one use, not two.** A user who taps twice, or
reinstalls, would otherwise burn the second use of a code that only had one and
then be unable to get in with the code they were legitimately given.

**"Expired", "revoked" and "never existed" all produce the same message.**
Confirming that a code *exists* but is expired turns guessing into a two-step
oracle, and the person reading it can do nothing differently either way.
"Used up" is the one case that gets its own message, because it *is* actionable:
ask whoever shared it for another.

**Existing users are never affected.** Turning the gate on gates *new home
creation*. Everyone already in a home keeps full access — there is a rules test
asserting exactly that, because the failure it prevents is locking out your
entire existing user base with one flag flip.

## Turning it off for good

When the ring widens and the gate stops earning its keep:

1. `npx tsx scripts/ops/invite-codes.ts off`
2. Watch spend for a week (`aiSpendGlobal/{yyyy-mm}`) before deleting anything.
3. Only then consider removing the rule, the callable and this document — and if
   you do, delete `config/growth` **last**, since its absence is what makes the
   rules fail open.
