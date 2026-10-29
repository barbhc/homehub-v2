# Legacy Storage migration — households' files into `homes/{homeId}/…`

**Status (2026-10-28):** the migration script, its emulator proof and the cutover
rules tests exist. **Nothing has been run against production** — no reads, no
writes, no rules deploy. The live `storage.rules` is unchanged and still lets
any signed-in account read a legacy object whose path it knows. Each production
step below needs the owner's approval, separately.

Audit: `HOMEHUB_PRODUCT_AUDIT_2026-10-28.md` §5 (high priority) and Package 1 of
`HOMEHUB_IMPLEMENTATION_HANDOFF_2026-10-28.md`. Earlier tracking:
`docs/launch-readiness.md` → "Storage: legacy objects are still un-scoped".

## 1. The problem, mapped from code

Since #94 (2026-08-18) every upload is keyed `homes/{homeId}/…` and reading it
needs a membership row in that home (`storage.rules:72-74`). Objects written
before that carry no home in their path, so the rules cannot check membership;
`storage.rules:123-125` lets any signed-in, non-anonymous account `get` them.

### Storage prefixes the app has ever written

| Shape | Written by | Era | Live rule |
|---|---|---|---|
| `{uid}/{itemId}/manual_{ts}.{ext}` | v1 `storageService.uploadManualPdf`; v2 before #94 | legacy | any signed-in read; owner-uid delete (`:127-129`) |
| `{itemId}/manual_{ts}.{ext}` | v1 when no uid was passed | legacy | any signed-in read |
| `photos/{uid}/{itemId}/photo.{ext}` | v1 `uploadItemPhoto`; v2 before #94 | legacy | any signed-in read |
| `photos/{itemId}/photo.{ext}` | v1 when no uid was passed | legacy | any signed-in read |
| `receipts/{itemUnitId}/{ts}-{name}.{ext}` | v1 + v2 before #94 `uploadReceiptImage` | legacy | any signed-in read |
| `images/{manualId}/page_{n}.jpg` | v1 + v2 before #94 `uploadDiagramImage` | legacy | any signed-in read |
| anything else in the v1 `Manuals` bucket | `scripts/import/30-storage.ts` copies the whole bucket, paths preserved | legacy | any signed-in read |
| `homes/{h}/manuals/{uid}/{itemId}/manual_{ts}.{ext}` | `storageService.ts:65` | current | members of `h` |
| `homes/{h}/photos/{uid}/{itemId}/photo.{ext}` | `storageService.ts:108` | current | members of `h` |
| `homes/{h}/receipts/{itemUnitId}/{ts}-{name}.{ext}` | `storageService.ts:190` | current | members of `h` |
| `homes/{h}/images/{manualId}/page_{n}.jpg` | v2 #94 → #229 (writer deleted in 597be47) | current | members of `h` |
| `zz-rulesprobe-legacy/…`, `homes/zz-rulesprobe…/…` | `scripts/smoke-storage-rules.mjs` (cleans up after itself) | probe | — |
| **`homes/{h}/legacy/{originalPath}`** | **this migration** | new | members of `h` read; no client write/delete |

### Firestore fields that hold a Storage path or URL

| Field | Document | Form | Written by | Read by |
|---|---|---|---|---|
| `photoPath` | `homes/{h}/items/{i}` | path | `storageService.ts:114`; v1 import renames `photo_storage_ref` (`scripts/import/20-firestore.ts:150`) | `itemService.ts:98` → `ItemPhoto.tsx:57`, `HeroCard.tsx:147` via `useStorageUrl` → `resolveStorageUrl` |
| `receiptPath` | `homes/{h}/items/{i}` | path | `HeroCard.tsx:267` via `itemService.ts:144`; v1 import renames `receipt_storage_path` | `itemService.ts:101` → `HeroCard.tsx:148` |
| `sourceRef` (`sourceType: "upload"`) | `homes/{h}/manuals/{m}` | path | `useManualManagement.ts:264`, `SmartAddItem.tsx:383` → `manualDocumentService.ts:201`; v1 import | client `resolveManualUrl` (`useManualManagement.ts:55-58`); server `manualSource.ts:32-38` → `storagePdf.ts:43` (parse, Ask, ingest, detect-doc-type) |
| `sourceRef` (`sourceType: "url"`) | `homes/{h}/manuals/{m}` | URL | linked manuals; v1 public URLs | `resolveManualUrl`; `proxyPolicy.ts:86`. v1 Supabase URLs are dead (`isDeadLegacyManualUrl`) |
| `metadata.diagram_image_urls[].url` | `…/manuals/{m}/chunks/{c}`, `homes/{h}/taskTemplates/{t}` | URL (often with a token) | v1 (Supabase public URLs); v2 `uploadDiagramImage` until #229 | **nothing today** — `useResolvedDiagramImages` has no caller |
| `completionPhotos[]` | `homes/{h}/taskInstances/{t}` | — | always `[]` (v1 and v2) | — |
| `avatarUrl` | `users/{uid}` | — | always `null` in v2; v1 never wrote it | — |
| any other v1 column | anywhere | ? | `20-firestore.ts` carries unknown v1 columns over, camelCased | — |

Because of the last row, the script does not rely on this table: it walks
**every string in every document** in the database and treats a string as a
reference when it is (a) a Firebase/GCS URL for this bucket, (b) an exact
name of an existing object, or (c) in one of the three declared path fields
above (so a dangling one is reported as missing rather than ignored).

Also outside Firestore: the client's `storageUrlCache` (localStorage) keeps
`path → token URL`. Migrated rows get a new path, so a new cache key; old
entries are unused, and keep working only while the original and its token do.

The e2e seed's two manuals (`scripts/seed-emulator.ts:339,374`) point at
legacy-shaped paths with no object behind them; the dry run reports them as
missing, and the cutover changes nothing for them.

## 2. How a file's household is decided — and where it goes

**Only by the documents that reference it.** If every reference to an object
sits under the same `homes/{homeId}/…` tree, the object is that home's. If two
homes reference it, or anything outside a home does, it is **ambiguous**: reported,
never copied. The object's name is never used to infer a home (v1 names carry a
uid or an item id; a uid can belong to several homes). Unreferenced objects are
reported and left alone.

Every resolved object is **copied** — never moved, never deleted — to

    homes/{homeId}/legacy/{originalPath}

One rule for every shape: nothing is inferred from the old layout, the original
is recoverable from the new name, and two originals cannot collide. Under the
live rules, members of that home can read it and no client can write or delete
it (no write clause matches `legacy/`). Each reference keeps its form: a path
becomes the new path; a URL keeps its host, bucket and query string, including
its download token — the copy carries the same custom metadata, so the token
works on it too (see §5).

## 3. The script

`scripts/ops/migrate-legacy-storage.ts` — rules in `storageLegacyMigration.ts`
(unit-tested), I/O in `storageLegacyMigrationRunner.ts`, guard in
`storageLegacyMigrationCli.ts`.

| Mode | What it does |
|---|---|
| *(default)* dry run | Lists object **metadata** and reads every document. Prints counts and bytes per category: objects (tenant vs legacy, by shape, how many carry a download token), references by field, token-bearing URLs, the plan per home, ambiguous / missing / conflicting / out-of-scope / protected / unreferenced objects, **foreign-bucket URLs** (a Storage URL naming another bucket — reported, never rewritten; a large count means the bucket name is wrong) and **unrecognised values** in the three declared path fields (gs://, an outside URL, junk — what the cutover would leave as it is). Never prints a stored value, URL, token or file content. `--list` adds document and object paths (tokens redacted) — **object paths can contain a receipt's original file name** (`receipts/{item}/{ts}-{name}`), so treat `--list` output as private; `--report <file>` writes the census as JSON (counts only). |
| `--apply --manifest <file>` | For each resolved object: write a `copy-intent` line (fsynced) → server-side copy (never overwriting; `ifGenerationMatch: 0` in production — the emulator ignores that precondition, so the script checks existence first) → verify size, MD5, CRC32C, content type, cache headers and custom metadata → `copy-done`. Then per document: `ref-intent` (old value, new value, per field) → one transaction that rewrites a field only if it still holds the planned old value → `ref-done`. A reference is rewritten only after its object's copy is verified. `updatedAt` is not touched. Ends with a verify pass. |
| `--rollback <file>` | Puts every field the manifest touched back to its previous value — only where it still holds the value the migration wrote. Copies stay. |
| `--verify <file>` | Re-reads: new values in place, copies present, originals present. |

**Resumable and idempotent.** An interrupted run is resumed by re-running with
the same manifest: a destination that already holds identical bytes is not
copied again; a field already holding its new value is not written again. A
second complete run plans nothing. **Skipped, never guessed:** ambiguous
objects, missing objects, a destination that exists with different bytes, a
field someone changed since the plan.

**The manifest is bound to one migration.** Its header records the project,
bucket and `--home` set; a run with a different one is refused before the
scan (use one manifest per home). A non-empty file that does not start with
a header is refused. An existing manifest is tightened to `0600` when opened.

**`--home` is checked first.** Unknown ids are refused; each home's name and
member count is printed before anything else happens. Production `--apply`
always needs `--home`; progress lines print every 25 copies / documents.
Exit code is non-zero whenever a copy failed, a field changed since the plan,
a reference does not hold its new value, or a copy or original is missing.

**Sonia's home is denied by default.** `PROTECTED_HOMES`
(`storageLegacyMigration.ts`) holds "My House" (`a3ba0e21…`). Its objects are
never scheduled — not even when `--home` names it, which is refused outright —
unless the run carries **both** `--include-home a3ba0e21-4bd2-481b-99b8-088d5a90c668`
and `--sonia-agreed`. Either flag alone is refused.

**The manifest is private.** It holds previous field values, which can be
token URLs; the script creates it `0600`. Keep it outside the repo and keep it
until cleanup — it is the rollback.

**Production guard.** Emulator unless `--project homehub-2068d
--i-have-owner-approval` are both given; any other non-`demo-` project is
refused; production also needs an explicit `--bucket`, no emulator env vars,
and `--home <homeId>` for `--apply`. The bucket must be
`homehub-2068d.appspot.com` or `homehub-2068d.firebasestorage.app` and must
exist (checked after init; the Storage emulator serves no bucket metadata, so
on the emulator the foreign-bucket count is the safeguard). With the pair, it is
still a dry run unless `--apply` is added. Credentials: ADC with
`GOOGLE_CLOUD_QUOTA_PROJECT=homehub-2068d`.

## 4. Evidence (emulator only)

- `npx vitest run scripts/ops/storageLegacyMigration.test.ts` — the rules: what
  counts as a reference, ownership, ambiguity, missing, conflicts, `--home`
  scoping, form-preserving rewrites, the census never containing a token, the
  manifest's torn-line handling, and the production guard.
- `npm run test:migration:emu` (`firebase/storage-migration.emu.test.ts`, Auth +
  Firestore + Storage emulators) — fixtures cover item photos, receipts, manual
  PDFs in both v1 shapes, diagram URLs with and without a token, a dead v1
  Supabase URL, a file referenced from two homes, a missing file, an
  unreferenced file and an already-migrated row. It proves: dry-run counts and
  bytes, and that a dry run changes nothing; a crash mid-copies and a crash
  mid-references both resume with no object copied twice (object generations
  unchanged); identical bytes and metadata; every reference moved and every
  original kept; a second apply changes nothing; **the app's own client
  services** (`getItemUnit`, `getManualsByItem`, `getChunksByManual`,
  `resolveManualUrl`, `resolveStorageUrl`), signed in as a member with
  `storage.rules` enforcing, fetch every migrated photo, receipt, manual and
  diagram byte-for-byte, and the server's `manualSource` accepts the new manual
  paths for their own home only; a member of another home and a former member
  are refused; rollback restores every reference and leaves a field changed
  after the migration alone. Guards: a manifest refuses a different `--home`
  set and a header-less file, and is tightened to `0600`; unknown `--home` ids
  are refused and known ones are named with their member count; Sonia's home is
  skipped even when named; gs:// and other-bucket values in declared fields are
  counted; a wrong bucket turns every URL into a visible foreign-bucket count;
  progress is reported for every copy and document.
- `npm run test:rules:emu` — the live rules: two-account isolation in both
  directions for every family, a former member losing read and write the moment
  the row goes, upload → `getDownloadURL` → plain fetch for each upload flow,
  read-only migrated copies, and a test that a download-token URL reads with no
  sign-in at all. The existing legacy-read test is unchanged.
- `firebase/storage.rules.post-migration.test.ts` — the **proposed** cutover
  rules (`firebase/storage.post-migration.rules`, not deployed): every legacy
  shape denied to members, outsiders and anonymous callers (read, write,
  delete, list); migrated copies readable by members only; every upload flow
  unchanged; former members refused; a token URL to a legacy original still
  works. A drift check fails if `storage.rules` changes and the proposal does
  not. `STORAGE_LEGACY_CUTOVER=1` points the suite at the live file — today
  that fails on the legacy-denied cases, as it should.

None of this proves anything about production: the deployed rules, the real
object inventory, the IAM grant or real tokens. Those are steps 1–2 below.

## 5. Token-bearing URLs

Every object uploaded through the client SDK gets a `firebaseStorageDownloadTokens`
value, and a download URL carrying it reads the object **with no sign-in and
without consulting the rules** (pinned by a rules test). So:

- The rule cutover does not revoke URLs already handed out. Anyone who holds a
  token URL to a legacy original keeps reading it until that token is removed
  or the original deleted.
- The migration copies custom metadata, so the copy carries the **same** token.
  That keeps stored token URLs (diagram renders, linked-manual `sourceRef`s
  that are Storage URLs, which the server fetches without auth) working after
  the rewrite — and it means a leaked token is as valid for the copy as for the
  original.

Options for the owner (none is implemented here):
1. **Leave tokens as they are** (the app's normal behaviour for every upload).
2. **Revoke on the originals at cleanup** — removing their token metadata kills
   old URLs without touching the copies.
3. **Rotate tokens on the copies** and rewrite stored token URLs to token-less
   ones (the client resolves those through `getDownloadURL`, which needs
   membership) — stronger, but the server paths that fetch Storage URLs without
   auth (`storagePdf.ts` for `sourceType: "url"`, `proxyPdf`) would need to
   switch to the Admin SDK first.

The dry run counts token-bearing URLs by field and legacy objects carrying a
token, so the size of each option is known before choosing.

## 6. Production steps — every one needs owner approval

| # | Step | Command / action | Approval |
|---|---|---|---|
| 0 | Confirm the **deployed** rules match the repo and the bucket name | Console → Storage → Rules (compare with `storage.rules`); the `gs://` name at the top of Storage | **needs owner approval** (read-only, production console) |
| 1 | **Dry run** (read-only: lists object metadata, one Firestore read per document) | `GOOGLE_CLOUD_QUOTA_PROJECT=homehub-2068d npx tsx scripts/ops/migrate-legacy-storage.ts --project homehub-2068d --i-have-owner-approval --bucket <bucket> --report ~/legacy-census.json --list` | **needs owner approval** |
| 2 | **Review** counts and decisions: per-home plan; ambiguous / missing objects; unreferenced objects (keep, migrate by hand, or delete later); token option (§5); the guest decision (§8); **"My House" (`a3ba0e21…`) is Sonia's home** — migrate it only with her agreement, and note the cutover makes any of its legacy files unreadable if it is not migrated (the script denies that home unless `--include-home a3ba0e21… --sonia-agreed`); **foreign-bucket and unrecognised counts** (what the cutover leaves alone) | owner reads the census | **owner decision** |
| 3 | **Backup** of the fields to be rewritten (the manifest is the field-level rollback; this is the belt) | `gcloud firestore export gs://<backup-bucket>/legacy-migration-<date> --collection-ids=items,manuals,chunks,taskTemplates --project homehub-2068d` | **needs owner approval** |
| 4 | **Apply, one home at a time** — SF Condo first | `… --project homehub-2068d --i-have-owner-approval --bucket <bucket> --apply --manifest ~/legacy-migration-sf-condo.jsonl --home c1d91d18-76d5-43cc-955d-ef73ba6f305f` (re-run the same line to resume) | **needs owner approval** (per home) |
| 5 | **Verify** | `… --verify ~/legacy-migration-sf-condo.jsonl`; re-run the dry run (that home: nothing left to copy); on the phone, open items with photos, receipts and manuals, and ask a question that uses a manual; `WEB_API_KEY=… npm run smoke:storage` (unchanged: 7/7) | **needs owner approval** |
| 5b | *If anything is wrong:* **rollback** | `… --rollback ~/legacy-migration-sf-condo.jsonl` (copies stay; originals were never touched) | **needs owner approval** |
| 6 | **Rule cutover** — only when the dry run shows nothing left that should be migrated | A separate PR: replace `storage.rules` with `firebase/storage.post-migration.rules` (minus its header), set `STORAGE_LEGACY_CUTOVER=1` for the cutover suite, retire the legacy-read cases in `storage.rules.test.ts`, change `smoke-storage-rules.mjs` case 2 to expect 403. Then `npx firebase-tools deploy --only storage --project homehub-2068d` and `npm run smoke:storage`. Rollback: redeploy the previous `storage.rules` (one command, seconds). | **needs owner approval** (PR + deploy) |
| 7 | **Token decision** (§5) | per the option chosen | **needs owner approval** |
| 8 | **Cleanup** of originals — destructive, not built in this PR | only after a retention period the owner sets, with the manifests archived | **needs owner approval** |

## 7. Known limits

- The dry run reads every document in the database (`listDocuments` +
  `listCollections`, so path-only parents are included). Fine at today's size;
  revisit if the database grows by orders of magnitude.
- A reference added between the dry run and the apply is picked up by the
  apply's own fresh plan; one added *during* an apply is picked up by re-running it.
- Dead v1 Supabase URLs are reported, not rewritten — there is no object to
  move. `30-storage.ts` preserved paths, so the same name may exist in this
  bucket; re-pointing them is a separate decision.
- `scripts/ops/prod-smoke.ts` step 6 still treats only the legacy shapes as
  "rule shapes" and so flags every `homes/…` manual path; it predates #94.

## 8. Role model — what `guest` can do today

**Short version: a guest is a full member.** No rule, Admin callable or screen
treats `guest` differently from `member`, except the badge colour. The only
role that changes anything is `owner`.

| Layer | What a guest can do | Evidence |
|---|---|---|
| Firestore rules | Read the home; edit its profile; full read/write on items, rooms, manuals + chunks, task templates and instances, notes, saved answers, shopping list, providers, house rules, conversations; append feedback. Cannot hard-delete the home, change roles or remove others. | `firestore.rules:5-10` (design note), `:23-26` (`isMember` checks existence only), `:129-136`, `:218-277`; owner-only at `:136`, `:178-188` |
| Firestore rules — invites | Create invites at `member` or `guest`, read and revoke the home's invites | `firestore.rules:201`, `:207-210`; `shared/home/roles.ts:29` |
| Storage rules | Read every file in the home; upload manuals and photos (own uid segment), receipts and diagram images | `storage.rules:66-69` (`isHomeMember` = row exists), `:73`, `:80-105` |
| Admin callables | Everything a member can, including the paid ones (manual scans, Ask, discuss, reminders, recall check, OCR) — each checks only that a membership row exists | e.g. `enqueueParse.ts:77-78`, `chatQuery.ts:254-255`, `discussTask.ts:216-217`, `checkRecalls.ts:114-115`; role is read only by `inviteActions.ts:65` (invite creator), `:186` and `:193-195` (removeMember: owner, last-owner guard) |
| UI | Sees "Guest" in an amber badge; sees and can use **Invite**, which mints a **member** invite; cannot remove others | `HomeMembersSection.tsx:34-52`, `:228-240`, `:159` (`createInvite` defaults to `member`, `inviteService.ts:91-95`); remove gated at `:102`, `:331`; `AcceptInvite.tsx:164` ("Joining as guest") |
| Where guests come from | No screen creates a guest invite. Guest rows exist only via the v1 import (it copies v1's role, `scripts/import/20-firestore.ts:122-131`) or an invite written outside the app (the rules allow it) | — |

Whether any production home has a guest row is **unknown** (not checked —
no production access in this work). `scripts/ops/scan-membership-anomalies.ts`
reads membership rows and could count roles, with approval.

**Options (owner decision; nothing is changed in this PR):**

1. **Keep guest as a full member and say so.** One line in Settings and on the
   accept screen ("Guests can see and change everything in this home, same as
   members"). Smallest change; needs a mock first (CLAUDE.md rule 7).
2. **Retire the label.** Treat existing guest rows as members, drop `guest`
   from the invite lists (`shared/home/roles.ts` + the rule literals). Removes a
   word that implies less access than it grants. Needs a small, approved data
   update.
3. **Make guest genuinely narrower** (e.g. read-only, no paid AI, no invites).
   Must be enforced in all four places at once: a role check on every write
   rule in `firestore.rules`, a cross-service role lookup on every
   `storage.rules` write, a role check in every membership-gated callable, and
   hidden edit controls across the UI — plus rules and callable tests for each.
   Days, not hours; worth it only for a real use-case (a house-sitter, a
   cleaner).

Until one is chosen, nothing in the app should describe guest as read-only.
