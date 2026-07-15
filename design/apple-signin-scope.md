# Scope — "Continue with Apple" sign-in (v2 · Firebase)

**Status: the code is wired and gated behind a flag.** `signInWithApple()` in
`AuthProvider` uses Firebase `OAuthProvider("apple.com")` + `signInWithPopup`;
`SignInForm` shows a live Apple button when `VITE_APPLE_SIGNIN_ENABLED === "true"`,
otherwise a disabled "coming soon" stub. **No further code changes needed** — do
the Apple + Firebase config below, then flip the flag and redeploy.

> ⚠️ This supersedes the old v1 version of this doc, which described **Supabase**
> providers + a `…supabase.co/auth/v1/callback` return URL + Vercel envs. v2 is
> **Firebase** — ignore any Supabase/Vercel instructions.

## No custom domain required

Configure Apple against the default Firebase auth domain
`homehub-2068d.firebaseapp.com`. A custom domain (when you get one) is for
**Hosting only** — keep auth on `firebaseapp.com` and Apple Sign-In needs no
rework. (Only if you later adopt the custom domain *for auth* would you add it to
the Services ID return URLs.)

## 1. Code — DONE (gated by a flag)

- `AuthProvider.signInWithApple()` → `signInWithPopup(auth, new OAuthProvider("apple.com"))`
  (popup, not redirect — avoids third-party-storage partitioning when the auth
  domain isn't same-origin). Behind `VITE_APPLE_SIGNIN_ENABLED`.
- **Turn on after config:** set `VITE_APPLE_SIGNIN_ENABLED=true` in `.env`, run
  `npm run build`, `firebase deploy --only hosting`.

## 2. Apple Developer portal (account owner)

1. **App ID** with the *Sign in with Apple* capability.
2. **Services ID** (this is the OAuth `client_id`, e.g. `app.homehub.web`):
   - Enable *Sign in with Apple*, click *Configure*.
   - **Domains and Subdomains:** `homehub-2068d.firebaseapp.com`
   - **Return URLs:** `https://homehub-2068d.firebaseapp.com/__/auth/handler`
   - Register them, then **Continue → Save**. That's it — **no
     `apple-developer-domain-association.txt` / `.well-known` file is needed** for
     the OAuth web sign-in flow Firebase uses. (That association file is only for
     *"Sign in with Apple for Email Communication"* — Apple's private email relay,
     a separate, optional feature we're not using.)
3. **Sign in with Apple key (.p8):** a key is *team-level*, so if you already
   made one (e.g. for another app on the same team) **reuse it**. Note the
   **Key ID** and your **Team ID** (10 chars).

## 3. Firebase console (account owner)

Firebase console → **Authentication → Sign-in method → Apple → Enable**:
- **Services ID** = the ID from step 2.2 (`app.homehub.web`).
- **OAuth code flow configuration:** Apple **Team ID**, **Key ID**, and the
  **.p8 private key** contents. Firebase mints AND auto-rotates the Apple OAuth
  client secret itself — **no manual 6-month JWT rotation** to manage (unlike the
  old Supabase path).
- Confirm the handler URL Firebase shows matches what you put in the Services ID
  return URL: `https://homehub-2068d.firebaseapp.com/__/auth/handler`.
- **Authentication → Settings → Authorized domains:** ensure
  `homehub-2068d.web.app` and `homehub-2068d.firebaseapp.com` are listed
  (usually there by default).

## 4. Me (code/hosting), once you finish steps 2–3

- Flip `VITE_APPLE_SIGNIN_ENABLED=true`, rebuild, redeploy hosting.
- Verify the "Continue with Apple" button goes live (no more "coming soon").

## 5. Gotchas

- **Private email relay:** many users hide their email → you get a
  `@privaterelay.appleid.com` address. Treat it as their account email.
- **Name only on first auth:** Apple returns the name only on the *first*
  authorization — capture it then if you want to store it.
- **App Store rule (future native):** if any other third-party login is offered,
  the App Store *requires* Sign in with Apple. Native iOS would use the Apple
  sheet + `signInWithCredential`, not the web popup.
