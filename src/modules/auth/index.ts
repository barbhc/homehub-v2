/**
 * Auth module — wraps Supabase Auth.
 * Public API: AuthProvider, useAuth.
 */

export { AuthProvider, useAuth } from "./components/AuthProvider"
export { SignInForm } from "./components/SignInForm"
export { AuthGate } from "./components/AuthGate"
export type { AuthUser } from "./types"
export { AppleButton } from "./components/AppleLogo"
export { authErrorMessage } from "./authErrors"
export { takeAppleRedirectError, APPLE_REDIRECT_ERROR_EVENT } from "./appleRedirectError"
