# Deploying Homehub v2 to Firebase

Owner runbook. Do this once to stand up the project, then the per-change deploys are
one-liners. **The `shared/parse` packaging problem is already solved** — `firebase.json`
predeploy runs `npm run bundle` (esbuild), which inlines the repo-root shared code into the
functions bundle. You don't do anything special for it.

Everything server-side pins `region: us-central1`.

---

## 0. One-time prerequisites
```bash
npm install -g firebase-tools     # or: npx firebase-tools ...
firebase login                    # opens a browser; use the project's Google account
node -v                           # must be 20.x (functions runtime)
```

## 1. Create the Firebase project (console, ~5 min)
In https://console.firebase.google.com:
1. **Add project** → name it (e.g. `homehub-v2`). Note the **Project ID** (e.g. `homehub-v2-4a1b`).
2. **Upgrade to the Blaze plan** (Cloud Tasks, Scheduler, and 2nd-gen Functions require it).
   In the SAME sitting, set a **budget alert**: Google Cloud console → Billing → Budgets & alerts
   → create a budget (e.g. $25/mo, alert at 50/90/100%). Don't skip this.
3. **Enable the products:**
   - **Authentication** → Sign-in method → enable **Email/Password** and (under it) **Email link**.
     (Apple stays off until the Services ID is configured — Phase 5/7.)
   - **Firestore Database** → Create database → **production mode**, region `us-central` (or nam5).
   - **Storage** → Get started (same region). The bucket must be named `Manuals`-compatible per
     app conventions — actually the app uses the DEFAULT bucket with `manuals/` + `photos/` path
     prefixes, so just accept the default bucket.
   - Cloud Tasks / Cloud Scheduler APIs auto-enable on the first functions deploy that uses them.

## 2. Point the repo at your project
Edit **`.firebaserc`** — replace the placeholder:
```json
{ "projects": { "default": "homehub-v2-4a1b" } }   // ← your real Project ID
```

## 3. Client env config
Firebase console → **Project settings** (gear) → **General** → scroll to **Your apps** → add a
**Web app** (`</>`) if none exists → copy the config values into **`.env`** (copy from `.env.example`):
```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=homehub-v2-4a1b.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=homehub-v2-4a1b
VITE_FIREBASE_STORAGE_BUCKET=homehub-v2-4a1b.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_USE_EMULATORS=false
```
These are client-safe (not secrets).

## 4. Server secrets
The parse worker needs the Anthropic key (more keys join as the callable ports land):
```bash
firebase functions:secrets:set ANTHROPIC_API_KEY      # paste the key when prompted
# later, when their functions land:
# firebase functions:secrets:set BRAVE_SEARCH_API_KEY
```

## 5. Deploy — rules, indexes, then functions
```bash
# from the repo root
firebase deploy --only firestore:rules,firestore:indexes,storage
firebase deploy --only functions
```
- The functions deploy **auto-runs `npm run bundle`** (typecheck + esbuild) via predeploy — no
  manual build step.
- The **first** functions deploy provisions the **Cloud Tasks queue** for `parseWorker` and the
  **Cloud Scheduler jobs** for `rollForwardNeverStarted` (30 5 * * *) and `sendPushDaily` (0 15 * * *).
  If prompted to enable the Cloud Tasks / Scheduler APIs, say yes.

Deployed functions: `healthCheck`, `enqueueParse`, `parseWorker`, `rollForwardNeverStarted`,
`sendTestPush`, `sendPushDaily`.

## 6. Verify the deploy
```bash
firebase functions:list                                  # all 6 present, region us-central1
# healthCheck round-trip (from a signed-in client, or):
gcloud scheduler jobs list --project homehub-v2-4a1b     # the 2 cron jobs exist
gcloud tasks queues list --project homehub-v2-4a1b       # the parseWorker queue exists
```
Then, from the app (or a small script) call `healthCheck` — it returns `{ ok: true }`.

## 7. (Optional) Host the frontend on Firebase Hosting
```bash
npm run build          # tsc -b && vite build → dist/
firebase deploy --only hosting
```
`firebase.json` already has the SPA rewrite (`** → /index.html`) and serves `dist/`.

## 8. Push notifications (device verification — do this once)
FCM has no emulator, so verify on a real device after deploy:
1. Register a device token from the app (Phase 4 client FCM wiring writes to
   `users/{uid}/private/fcmTokens`).
2. Call `sendTestPush` → expect the "Push notifications are working 🎉" banner on
   **desktop Chrome AND the iOS PWA** (add-to-home-screen). iOS web push needs the installed PWA.

---

## Per-change deploys (after setup)
```bash
firebase deploy --only functions                              # code changes to functions
firebase deploy --only firestore:rules                        # rules only
firebase deploy --only firestore:indexes                      # new composite indexes
firebase deploy --only hosting                                # frontend (after npm run build)
```

## Never test against prod
Local dev uses the Emulator Suite — `npm run emu` then `npm run dev:emu` / `npm run seed:emu`.
The rules + worker + rollForward test suites (`npm run test:rules:emu`, `npm run test:worker:emu`)
run entirely on emulators. Do not point tests at the real project.
