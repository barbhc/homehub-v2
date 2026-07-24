import { createContext, useCallback, useContext, useEffect, useState } from "react"
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
  sendPasswordResetEmail,
  updatePassword as fbUpdatePassword,
  signOut as fbSignOut,
  OAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  getAdditionalUserInfo,
  type UserCredential,
  type User as FirebaseUser,
} from "firebase/auth"
import { auth } from "@/integrations/firebase"
import { isNativePlatform } from "@/lib/native"
import { clearPersistedDashboardCache } from "@/lib/swrPersist"
import { track, identifyUser, resetAnalyticsIdentity } from "@/lib/analytics"
import type { AuthUser } from "@/modules/auth/types/auth"

type AuthState = {
  user: AuthUser | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
  signOut: () => Promise<void>
  signUp: (email: string, password: string, name?: string) => Promise<{ error: Error | null }>
  signInWithMagicLink: (email: string) => Promise<{ error: Error | null }>
  completeMagicLink: (email: string) => Promise<{ error: Error | null }>
  signInWithApple: () => Promise<{ error: Error | null }>
  resetPassword: (email: string) => Promise<{ error: Error | null }>
  updatePassword: (password: string) => Promise<{ error: Error | null }>
}

const AuthContext = createContext<AuthState | null>(null)

const APPLE_ENABLED = import.meta.env.VITE_APPLE_SIGNIN_ENABLED === "true"
/** localStorage key for the email-link flow (Firebase can't read it back from the link). */
const EMAIL_LINK_KEY = "homehub:emailForSignIn"
/** Full magic-link URL, stashed for cross-device completion (the link isn't in the
 *  URL anymore once we redirect to the confirm-email form). */
const EMAIL_LINK_URL_KEY = "homehub:emailLinkUrl"
/** An Apple sign-in via redirect (the native shell — WKWebView blocks popups) reports
 *  failures only on the return page load. Stash the message so SignInForm can show it. */
export const APPLE_REDIRECT_ERROR_KEY = "homehub:appleRedirectError"

/** Firebase user → the app's minimal AuthUser (id = uid). */
function toAuthUser(u: FirebaseUser | null): AuthUser | null {
  if (!u) return null
  return { id: u.uid, email: u.email, user_metadata: { full_name: u.displayName } }
}

/** Normalize a thrown Firebase auth error into a plain Error with a readable message. */
function toError(err: unknown): Error {
  if (err instanceof Error) return err
  return new Error(typeof err === "string" ? err : "Authentication failed")
}

/** Funnel: fire sign_up only for a NEW account (email-link/Apple also sign in
 *  returning users through the same credential calls). */
function trackSignUpIfNew(cred: UserCredential, method: string): void {
  if (getAdditionalUserInfo(cred)?.isNewUser) track("sign_up", { method })
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Complete a magic-link sign-in if we arrived on one (state survives the
    // round-trip via localStorage — Firebase can't recover the email from the link).
    if (isSignInWithEmailLink(auth, window.location.href)) {
      const storedEmail = window.localStorage.getItem(EMAIL_LINK_KEY)
      if (storedEmail) {
        // Same device: we already know the email — complete the sign-in inline.
        void signInWithEmailLink(auth, storedEmail, window.location.href)
          .then((cred) => {
            trackSignUpIfNew(cred, "email_link")
            window.localStorage.removeItem(EMAIL_LINK_KEY)
            window.history.replaceState({}, "", window.location.pathname) // strip one-time params
          })
          .catch(() => { /* listener stays unauthenticated; UI shows sign-in */ })
      } else if (!window.location.pathname.startsWith("/signin")) {
        // Different device / storage cleared: the email can't be recovered from the
        // link. Stash the link and send the user to a real confirm-email form
        // instead of window.prompt (blocked by some browsers, and poor UX).
        window.localStorage.setItem(EMAIL_LINK_URL_KEY, window.location.href)
        window.location.replace("/signin?completeLink=1")
      }
    }

    // Complete a pending Apple sign-in that used the redirect flow (native shell).
    // The happy path lands via onAuthStateChanged below; getRedirectResult here
    // surfaces errors across the full-page round-trip + the new-account signal.
    void getRedirectResult(auth)
      .then((cred) => {
        if (cred) trackSignUpIfNew(cred, "apple")
      })
      .catch((err) => {
        window.sessionStorage.setItem(APPLE_REDIRECT_ERROR_KEY, toError(err).message)
      })

    let lastUid: string | null = null
    const unsub = onAuthStateChanged(auth, (u) => {
      // Tie analytics to the uid; reset only on a real sign-out (not the initial
      // signed-out emission, which would churn the anonymous id every cold load).
      if (u) identifyUser(u.uid)
      else if (lastUid) resetAnalyticsIdentity()
      lastUid = u?.uid ?? null
      setUser(toAuthUser(u))
      setLoading(false)
    })
    return () => unsub()
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      await signInWithEmailAndPassword(auth, email, password)
      return { error: null }
    } catch (err) {
      return { error: toError(err) }
    }
  }, [])

  const signOut = useCallback(async () => {
    // Drop the persisted dashboard cache so the next account on this device
    // never briefly sees the previous user's Home.
    clearPersistedDashboardCache()
    await fbSignOut(auth)
  }, [])

  const signUp = useCallback(async (email: string, password: string, name?: string) => {
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password)
      track("sign_up", { method: "password" })
      if (name?.trim()) await updateProfile(cred.user, { displayName: name.trim() })
      // Re-emit so the freshly-set displayName reaches consumers.
      setUser(toAuthUser(cred.user))
      return { error: null }
    } catch (err) {
      return { error: toError(err) }
    }
  }, [])

  const signInWithMagicLink = useCallback(async (email: string) => {
    try {
      await sendSignInLinkToEmail(auth, email, {
        url: `${window.location.origin}/`,
        handleCodeInApp: true,
      })
      window.localStorage.setItem(EMAIL_LINK_KEY, email)
      return { error: null }
    } catch (err) {
      return { error: toError(err) }
    }
  }, [])

  const completeMagicLink = useCallback(async (email: string) => {
    try {
      const linkUrl = window.localStorage.getItem(EMAIL_LINK_URL_KEY) ?? window.location.href
      if (!isSignInWithEmailLink(auth, linkUrl)) {
        return { error: new Error("This sign-in link is invalid or has expired. Request a new one.") }
      }
      const cred = await signInWithEmailLink(auth, email, linkUrl)
      trackSignUpIfNew(cred, "email_link")
      window.localStorage.removeItem(EMAIL_LINK_KEY)
      window.localStorage.removeItem(EMAIL_LINK_URL_KEY)
      return { error: null }
    } catch (err) {
      return { error: toError(err) }
    }
  }, [])

  const signInWithApple = useCallback(async () => {
    // Behind VITE_APPLE_SIGNIN_ENABLED; stub path returns a clear error until the
    // owner completes the Services-ID config.
    if (!APPLE_ENABLED) {
      return { error: new Error("Apple sign-in isn't enabled yet.") }
    }
    const provider = new OAuthProvider("apple.com")
    provider.addScope("email")
    provider.addScope("name")
    try {
      // Native iOS/Android: use the OS-native Apple sheet (no Safari bounce), then
      // exchange the identity token for a Firebase session. If the native plugin
      // isn't in this build yet (pre-rebuild), fall back to the web redirect so
      // sign-in still works.
      if (isNativePlatform()) {
        try {
          const { signInWithAppleNative, AppleNativeUnavailable, AppleNativeCancelled } = await import("@/lib/nativeAppleAuth")
          try {
            await signInWithAppleNative()
            return { error: null }
          } catch (nativeErr) {
            if (nativeErr instanceof AppleNativeCancelled) return { error: new Error(nativeErr.message) }
            if (!(nativeErr instanceof AppleNativeUnavailable)) throw nativeErr
            // plugin not synced into this build yet → graceful fallback below
          }
        } catch (importErr) {
          void importErr // module/plugin unavailable → fall through to redirect
        }
        await signInWithRedirect(auth, provider)
        return { error: null } // completes on the return load via getRedirectResult
      }
      try {
        const cred = await signInWithPopup(auth, provider)
        trackSignUpIfNew(cred, "apple")
        return { error: null }
      } catch (err) {
        const code = (err as { code?: string })?.code
        if (code === "auth/popup-blocked" || code === "auth/operation-not-supported-in-this-environment") {
          await signInWithRedirect(auth, provider)
          return { error: null }
        }
        throw err
      }
    } catch (err) {
      return { error: toError(err) }
    }
  }, [])

  const resetPassword = useCallback(async (email: string) => {
    try {
      await sendPasswordResetEmail(auth, email, { url: `${window.location.origin}/reset-password` })
      return { error: null }
    } catch (err) {
      return { error: toError(err) }
    }
  }, [])

  const updatePassword = useCallback(async (password: string) => {
    try {
      if (!auth.currentUser) throw new Error("Not signed in.")
      await fbUpdatePassword(auth.currentUser, password)
      return { error: null }
    } catch (err) {
      const e = toError(err)
      // Firebase requires a recent login to change credentials. Surface a clear,
      // actionable message; the reauth prompt is a UI concern for the caller.
      if ((err as { code?: string })?.code === "auth/requires-recent-login") {
        return { error: new Error("Please sign in again, then retry changing your password.") }
      }
      return { error: e }
    }
  }, [])

  const value: AuthState = { user, loading, signIn, signOut, signUp, signInWithMagicLink, completeMagicLink, signInWithApple, resetPassword, updatePassword }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}
