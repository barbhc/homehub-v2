# Phase 6 — production data import (v1 Supabase → v2 Firebase)

One-time migration of the live Homehub v1 data into the v2 Firebase backend.
Everything here runs on **your machine** (it needs prod credentials that never
touch the repo or a session). Scripts are **dry-run by default** — they read v1
and report what they'd write, and only apply when you pass `CONFIRM=IMPORT`.

## What it moves

| Script | Moves | Notes |
|---|---|---|
| `00-preflight.ts` | nothing (read-only) | connectivity + source row census + target check |
| `10-auth.ts` | Supabase Auth users → Firebase Auth | **preserves uid**; no passwords (see below) |
| `20-firestore.ts` | all ~20 data tables → Firestore | preserves v1 UUIDs as doc ids; inlines schedule + supplies; stamps the §5 denorm set |
| `30-storage.ts` | Supabase `Manuals` bucket → Cloud Storage | preserves object paths (manuals + `photos/` + receipts) |
| `40-reparse.ts` | re-extracts primary manuals with the v2 worker | optional quality pass; needs functions deployed |
| `run-all.ts` | orchestrates 00 → 10 → 20 → 30 | 40 is separate/optional |

**Idempotent:** deterministic doc ids (v1 UUIDs / uids) mean re-running overwrites
rather than duplicating. Safe to re-run after fixing an error.

## Prerequisites

1. **Deploy the v2 backend first** (rules/indexes/functions/storage):
   ```bash
   firebase deploy --only firestore:rules,firestore:indexes,storage,functions
   ```
2. A **service-account JSON** for the v2 project with Firestore + Auth + Storage
   admin. Download from Firebase console → Project settings → Service accounts.

## Environment

```bash
# Source (v1 Supabase)
export SUPABASE_URL="https://<ref>.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="<service-role key>"

# Target (v2 Firebase)
export GOOGLE_APPLICATION_CREDENTIALS="/abs/path/to/serviceAccount.json"   # use the FULL path, not ~
export FIREBASE_PROJECT_ID="homehub-2068d"
# Storage bucket: projects created after ~late-2024 use <project>.firebasestorage.app,
# older ones use <project>.appspot.com. Confirm the exact name in Firebase console →
# Storage (the gs:// name at the top) and use it WITHOUT the gs:// prefix.
export FIREBASE_STORAGE_BUCKET="homehub-2068d.firebasestorage.app"

# Re-parse only (40)
export FIREBASE_WEB_API_KEY="<web api key>"     # console → Project settings → General
export OWNER_UID="<your firebase uid>"          # a member of every home (usually you)
```

## Run

```bash
# 1. Dry run — reports counts, writes nothing.
npx tsx scripts/import/run-all.ts

# 2. Review the census. When it looks right, apply:
CONFIRM=IMPORT npx tsx scripts/import/run-all.ts

# 3. (optional) Re-parse manuals with the v2 worker:
CONFIRM=IMPORT npx tsx scripts/import/40-reparse.ts
```

Run steps individually the same way (`npx tsx scripts/import/20-firestore.ts`).

## Passwords

The Supabase JS admin API doesn't expose password hashes, so `10-auth.ts`
recreates each user with their **uid + verified email but no password**. On first
sign-in they use **"forgot password"** or the **magic-link** flow (both live in
the v2 auth module). For a personal/small home this is a one-time reset.

*To preserve passwords instead:* export the bcrypt hashes with DB access
(`select id, email, encrypted_password from auth.users`) and swap `createUser`
for `auth().importUsers([{ uid, email, passwordHash }], { hash: { algorithm: "BCRYPT" } })`.
Supabase stores standard bcrypt, which Firebase imports natively.

## Schema-drift safety

The transforms are column-driven: unknown v1 columns are carried over camelCased
rather than dropped, and missing aux tables are skipped with a warning. If your
v1 schema renamed a column the model doc lists, adjust the per-table `renames`/
`dates` in the relevant `mapRow(...)` call in `20-firestore.ts`. Always confirm
the dry-run census matches the source before applying.

## After import

See `docs/DEFINITION_OF_DONE.md` for the verification checklist and the domain
cutover steps (Phase 7).
