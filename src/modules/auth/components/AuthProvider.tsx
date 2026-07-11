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
  type User as FirebaseUser,
} from "firebase/auth"
import { auth } from "@/integrations/firebase"
import type { AuthUser } from "@/modules/auth/types/auth"

type AuthState = {
  user: AuthUser | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
  signOut: () => Promise<void>
  signUp: (email: string, password: string, name?: string) => Promise<{ error: Error | null }>
  signInWithMagicLink: (email: string) => Promise<{ error: Error | null }>
  signInWithApple: () => Promise<{ error: Error | null }>
  resetPassword: (email: string) => Promise<{ error: Error | null }>
  updatePassword: (password: string) => Promise<{ error: Error | null }>
}

const AuthContext = createContext<AuthState | null>(null)

const APPLE_ENABLED = import.meta.env.VITE_APPLE_SIGNIN_ENABLED === "true"
/** localStorage key for the email-link flow (Firebase can't read it back from the link). */
const EMAIL_LINK_KEY = "homehub:emailForSignIn"

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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Complete a magic-link sign-in if we arrived on one (state survives the
    // round-trip via localStorage — Firebase can't recover the email from the link).
    if (isSignInWithEmailLink(auth, window.location.href)) {
      const stored = window.localStorage.getItem(EMAIL_LINK_KEY)
      const email = stored ?? window.prompt("Confirm your email to finish signing in") ?? ""
      if (email) {
        void signInWithEmailLink(auth, email, window.location.href)
          .then(() => {
            window.localStorage.removeItem(EMAIL_LINK_KEY)
            // Strip the one-time link params from the URL.
            window.history.replaceState({}, "", window.location.pathname)
          })
          .catch(() => { /* listener stays on the unauthenticated path; UI shows sign-in */ })
      }
    }

    const unsub = onAuthStateChanged(auth, (u) => {
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
    await fbSignOut(auth)
  }, [])

  const signUp = useCallback(async (email: string, password: string, name?: string) => {
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password)
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

  const signInWithApple = useCallback(async () => {
    // Fix D. Popup (not redirect) — third-party-storage partitioning breaks the
    // redirect flow unless authDomain is same-origin. Behind VITE_APPLE_SIGNIN_ENABLED;
    // stub path returns a clear error until the owner completes the Services-ID config.
    if (!APPLE_ENABLED) {
      return { error: new Error("Apple sign-in isn't enabled yet.") }
    }
    try {
      const provider = new OAuthProvider("apple.com")
      provider.addScope("email")
      provider.addScope("name")
      await signInWithPopup(auth, provider)
      return { error: null }
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

  const value: AuthState = { user, loading, signIn, signOut, signUp, signInWithMagicLink, signInWithApple, resetPassword, updatePassword }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}
