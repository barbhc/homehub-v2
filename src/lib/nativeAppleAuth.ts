/**
 * Native "Sign in with Apple" for the iOS shell (Capacitor), exchanged for a
 * Firebase session in the JS SDK.
 *
 * The web redirect flow bounces out to Safari inside the WKWebView; this uses
 * the OS-native Apple sheet via @capacitor-community/apple-sign-in and keeps
 * everything in-app. Firebase still owns auth state — we only borrow Apple's
 * identity token and hand it to signInWithCredential.
 *
 * Nonce: Apple signs a token bound to SHA256(nonce); Firebase re-derives and
 * checks SHA256(rawNonce) === the token's nonce claim. So we send the HASH to
 * Apple and the RAW nonce to Firebase.
 *
 * Lives in its own module so it's a lazy chunk — the web build never eagerly
 * pulls the Apple plugin, and web sign-in keeps using popup/redirect.
 */
import { SignInWithApple } from "@capacitor-community/apple-sign-in"
import { OAuthProvider, signInWithCredential } from "firebase/auth"
import { auth } from "@/integrations/firebase"

/** Raw nonce: URL-safe chars, unguessable, sent only to Firebase. */
function randomNonce(length = 32): string {
  const chars = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-._"
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => chars[b % chars.length]).join("")
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("")
}

/** Raised when the native plugin isn't in this build yet → caller can fall back. */
export class AppleNativeUnavailable extends Error {}
/** Raised when the user dismisses the Apple sheet → caller shows a benign message. */
export class AppleNativeCancelled extends Error {}

/** Reject after `ms` so a hung native/Firebase call surfaces instead of freezing. */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} (no response after ${ms / 1000}s)`)), ms)),
  ])
}

export async function signInWithAppleNative(): Promise<void> {
  const rawNonce = randomNonce()
  const hashedNonce = await sha256Hex(rawNonce)
  console.log("[apple-native] 1/4 requesting native Apple authorization")

  let result: Awaited<ReturnType<typeof SignInWithApple.authorize>>
  try {
    result = await withTimeout(
      SignInWithApple.authorize({
        // clientId/redirectURI are ignored on native iOS (it uses the app's own
        // "Sign in with Apple" entitlement) but are required by the option type.
        clientId: "com.bc.homehub",
        redirectURI: "https://homehub-2068d.web.app",
        scopes: "email name",
        nonce: hashedNonce,
      }),
      60000,
      "Apple didn't return a credential",
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const code = (err as { code?: string })?.code
    // Capacitor reports an unregistered plugin as UNIMPLEMENTED — i.e. the native
    // side hasn't been synced/rebuilt yet. Let the caller fall back to redirect.
    if (code === "UNIMPLEMENTED" || /not implemented|unimplemented/i.test(msg)) {
      throw new AppleNativeUnavailable(msg)
    }
    // ASAuthorizationError.canceled == 1000/1001 (user dismissed the sheet).
    if (code === "1000" || code === "1001" || /cancel/i.test(msg)) {
      throw new AppleNativeCancelled("Apple sign-in was cancelled.")
    }
    throw err
  }

  const idToken = result.response?.identityToken
  console.log("[apple-native] 2/4 got Apple response — identityToken present:", !!idToken)
  if (!idToken) throw new Error("Apple didn't return an identity token.")

  console.log("[apple-native] 3/4 exchanging for a Firebase session")
  const credential = new OAuthProvider("apple.com").credential({ idToken, rawNonce })
  await withTimeout(signInWithCredential(auth, credential), 25000, "Firebase sign-in stalled")
  console.log("[apple-native] 4/4 signed in")
}
