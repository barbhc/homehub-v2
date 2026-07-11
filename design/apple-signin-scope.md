# Scope — "Continue with Apple" sign-in

**Status: the code is wired** (`signInWithApple` in `AuthProvider`, button in
`SignInForm`). It's gated behind a feature flag so it stays a disabled "coming
soon" button until the Apple/Supabase config below is done — then you flip the
flag and it goes live. No further code changes needed.

## 1. Code — DONE (gated by a flag)

Implemented:
- `AuthProvider.signInWithApple()` → `supabase.auth.signInWithOAuth({ provider: "apple", options: { redirectTo: \`${window.location.origin}/\` } })`. `supabase-js` has `detectSessionInUrl` on by default, so the redirect back to `/` is consumed automatically and `onAuthStateChange` picks up the session — no new callback route on web.
- `SignInForm` renders a live Apple button when `VITE_APPLE_SIGNIN_ENABLED === "true"`, otherwise the disabled "coming soon" stub.

**To turn it on after config:** set `VITE_APPLE_SIGNIN_ENABLED=true` in the
Vercel project env (Production + Preview), redeploy. That's the only switch.

## 1b. Reusing your SkinIQ Apple setup

I can't read the SkinIQ repo from this session, but here's what carries over
from an existing Sign in with Apple setup vs. what must be Homehub-specific:

**Reusable from SkinIQ (if it's the same Apple Developer team):**
- **Team ID** (10 chars) — same across all your apps.
- **The Sign in with Apple key (.p8) + its Key ID** — a key is *team-level*, so
  the same key/secret-generation works for Homehub. No need to make a new one.
- Any **client-secret generation script** SkinIQ uses (the JWT signed with the
  .p8). Reuse it verbatim, just changing the `sub`/`client_id` to Homehub's
  Services ID.

**Must be Homehub-specific:**
- A **Services ID** (the web OAuth `client_id`). Either create a new one for
  Homehub, or add Homehub's redirect to SkinIQ's existing Services ID (cleaner
  to make a separate one). Its *Return URL* must include Homehub's Supabase
  callback: `https://mpvhwuigpyrqdmjdkdjy.supabase.co/auth/v1/callback`.
- The **Supabase Apple provider** config lives on *Homehub's* project
  (`mpvhwuigpyrqdmjdkdjy`) — SkinIQ's Supabase project config does not transfer.

**Web vs native — important:** if SkinIQ's Apple sign-in is the **native iOS**
flow (Sign in with Apple sheet → `signInWithIdToken`), that path uses the *App
ID / bundle id* as the client and does **not** need a Services ID. Homehub today
is a **web** app, which needs the **Services ID + OAuth redirect** flow above.
The .p8 key still reuses; the Services ID is the web-only piece SkinIQ may not
have. If you tell me whether SkinIQ is web or native (and your Team ID), I can
tailor these steps exactly.

## 2. Apple Developer setup (account owner — needs a paid Apple Developer membership, $99/yr)

1. **App ID** with the *Sign in with Apple* capability enabled.
2. **Services ID** — this is the OAuth `client_id`. Configure its *Return URLs*
   to include the Supabase callback: `https://mpvhwuigpyrqdmjdkdjy.supabase.co/auth/v1/callback`.
3. **Sign in with Apple key** — create a key (.p8), note the **Key ID** and your
   **Team ID**. Supabase uses these + the .p8 to mint the OAuth **client secret**
   (a JWT). Note: that secret JWT has a **max 6-month lifetime** → it must be
   rotated before expiry, or sign-in starts failing. Set a reminder.

## 3. Supabase config (account owner)

1. Dashboard → **Authentication → Providers → Apple** → enable.
2. Set **Client ID** = the Services ID, and the **Secret** (the generated JWT,
   or let Supabase build it from Team ID / Key ID / .p8).
3. Dashboard → **Authentication → URL Configuration** → add the redirect URLs the
   button uses: production (`https://homehub-pied.vercel.app/`), Vercel preview
   domains, and `http://localhost:*` for dev. Apple is strict about exact
   redirect URLs.

## 4. Gotchas

- **Apple private email relay.** Many users hide their email; you receive a
  `@privaterelay.appleid.com` address. Treat it as the account email; don't
  assume it's reachable from anything other than Apple's relay.
- **Name is only sent once.** Apple returns the user's name only on the *first*
  authorization. If you want to store it, capture it on first sign-in.
- **Native iOS (future).** When the wrapped/native app exists, use the native
  Apple sign-in sheet + `supabase.auth.signInWithIdToken({ provider: "apple", token })`
  instead of the web OAuth redirect. The App Store **requires** Sign in with
  Apple if you offer other third-party logins — relevant once any social login
  ships.

## Effort summary
- Code: ~30 min (one method + un-disable the button).
- Apple + Supabase config: ~1–2 hrs, plus the Apple Developer membership.
- Ongoing: rotate the client-secret JWT before its ≤6-month expiry.
