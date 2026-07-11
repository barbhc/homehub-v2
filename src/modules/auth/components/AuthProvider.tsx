import { createContext, useCallback, useContext, useEffect, useState } from "react"
import { supabase } from "@/integrations/shim/client"
import type { User } from "@supabase/supabase-js"

type AuthState = {
  user: User | null
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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error ?? null }
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  const signUp = useCallback(async (email: string, password: string, name?: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: name?.trim() ? { data: { full_name: name.trim() } } : undefined,
    })
    return { error: error ?? null }
  }, [])

  const signInWithMagicLink = useCallback(async (email: string) => {
    // Passwordless sign-in: Supabase emails a one-time link. Uses the project's
    // existing email setup (same as confirm/reset) — no external provider config.
    // `shouldCreateUser: false` keeps this a sign-in, not silent account creation.
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        shouldCreateUser: false,
      },
    })
    return { error: error ?? null }
  }, [])

  const signInWithApple = useCallback(async () => {
    // Web OAuth redirect flow. Requires the Apple provider to be enabled in the
    // Supabase dashboard (Services ID + client secret) — see
    // design/apple-signin-scope.md. supabase-js consumes the returned session on
    // redirect back to "/" via detectSessionInUrl.
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "apple",
      options: { redirectTo: `${window.location.origin}/` },
    })
    return { error: error ?? null }
  }, [])

  const resetPassword = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    return { error: error ?? null }
  }, [])

  const updatePassword = useCallback(async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password })
    return { error: error ?? null }
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
