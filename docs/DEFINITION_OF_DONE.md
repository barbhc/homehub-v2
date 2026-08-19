# Homehub v2 — Definition of Done + cutover runbook (Phases 6–7)

The code migration is complete: every service runs on Firebase, the Supabase shim
is deleted, all 12 edge functions are ported, and the suites are green
(vitest 127 · functions 60 · desktop visual 10/10 · emu e2e 17–18). What remains
is **owner-only** work that needs real production credentials. Do it in this order.

---

## 0. Prerequisites (Firebase console, one-time)

- [ ] Firebase project on the **Blaze** plan, with a **budget alert** set the same
      session (the one unmet Phase-1 gate).
- [ ] Enable **Auth** (Email/Password + Email link), **Firestore**, **Storage**,
      **Cloud Functions**, **Cloud Tasks**, **Cloud Scheduler**.
- [ ] Put the real project id in `.firebaserc` and the `VITE_FIREBASE_*` values in
      the deploy env (Vercel project env vars).

## 1. Deploy the backend

```bash
firebase deploy --only firestore:rules,firestore:indexes,storage,functions
```

- [ ] Confirm all functions deployed: `firebase functions:list`.
- [ ] Secrets set (via `firebase functions:secrets:set`): `ANTHROPIC_API_KEY`,
      `GOOGLE_VISION_API_KEY`, `BRAVE_SEARCH_API_KEY` — **already added by owner**.
      Verify with `firebase functions:secrets:access <NAME>`.
- [ ] Firestore composite indexes finished building (console → Firestore → Indexes).

## 2. Push notifications (FCM) config

- [ ] Generate a **Web Push certificate** (console → Cloud Messaging) and set
      `VITE_FIREBASE_VAPID_KEY` in the deploy env.
- [ ] Edit `public/firebase-messaging-sw.js` — replace the placeholder config with
      the real `VITE_FIREBASE_*` values (client-safe; the file isn't Vite-processed).
- [ ] After the app is live, verify a real push: **Settings → enable notifications →
      "Send test push"** on desktop AND the iOS PWA (there's no FCM emulator — this
      is the Phase-4 gate). Native iOS also needs the FCM SDK wired at app-build time.

## 3. Import production data (Phase 6)

Follow `scripts/import/README.md`. Summary:

```bash
# dry run (writes nothing) — review the census
npx tsx scripts/import/run-all.ts
# apply
CONFIRM=IMPORT npx tsx scripts/import/run-all.ts
```

- [ ] `00-preflight` census matches what you expect from v1.
- [ ] `10-auth` — users imported (uid preserved; they reset password on first login).
- [ ] `20-firestore` — doc counts per collection look right.
- [ ] `30-storage` — manual PDFs + item photos copied (paths preserved).

## 4. Re-parse manuals (Phase 6, recommended)

Imported chunks/tasks came from the OLD v1 parser. Regenerate with the v2 worker:

```bash
FIREBASE_WEB_API_KEY=<key> OWNER_UID=<uid> CONFIRM=IMPORT \
  npx tsx scripts/import/40-reparse.ts
```

- [ ] All ~19 primary manuals reach `done` (retry any failures via **Settings →
      Rescan all**).

## 5. Functional verification (the "done" checklist)

Sign in as yourself and confirm each end-to-end on prod data:

- [ ] **Home** feed shows today's/overdue tasks; the calm "Focus" default + "All · N"
      work (Fix A); "Start here" banner appears only for a genuinely overdue essential.
- [ ] **Inventory** lists all items with photos; item detail shows specs, warranty,
      care tasks, and the manual PDF renders (cross-origin PDFs via `proxyPdf`).
- [ ] **Smart Add** creates an item; OCR (nameplate/receipt) and product-lookup
      populate fields; a manual upload parses to review → commit.
- [ ] **Ask/chat** streams an answer with manual citations (SSE); web-search toggle
      works when Brave is enabled.
- [ ] **Maintenance/Clean** surfaces; complete a task → next occurrence appears.
- [ ] **Warranties**, **Providers**, **Settings** (rooms, members, profile) load.
- [ ] **Recalls** check on an item; **care notes** import-from-URL + suggest.
- [ ] Daily push arrives (or the scheduled function logs a send).

## 6. Visual regression (Fix E tail)

- [ ] Re-bake the **mobile** baselines in CI or on a dev machine (the sandbox
      couldn't launch the mobile browser): `npm run test:e2e:visual:update`, commit
      the updated `e2e/__screenshots__/mobile/**`.
- [ ] Wire the visual project into CI (or record a deliberate deferral). Desktop
      baselines are already re-baked + green.

## 7. Apple Sign-In + domain cutover (Phase 7)

- [ ] Apple: create the Services ID + configure the Apple provider in Firebase Auth;
      set `VITE_APPLE_SIGNIN_ENABLED=true`. Reset-email action URL → `/reset-password`.
- [ ] Point the production domain at the v2 deployment; verify auth redirect/allowed
      domains include it.
- [ ] Decommission the v1 Supabase project only AFTER a few days of green prod + a
      final data spot-check (keep it as a rollback path until then).

---

## Rollback

Until step 7's decommission, v1 Supabase is untouched (the import is read-only on
the source). If prod misbehaves, repoint the domain back to v1 while you fix
forward — no data is lost because nothing wrote to v1.
