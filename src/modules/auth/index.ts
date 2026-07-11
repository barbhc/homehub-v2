/**
 * Auth module — wraps Supabase Auth.
 * Public API: AuthProvider, useAuth.
 */

export { AuthProvider, useAuth } from "./components/AuthProvider"
export { SignInForm } from "./components/SignInForm"
export { AuthGate } from "./components/AuthGate"
export type { AuthUser } from "./types"
