import { APPLE_REDIRECT_ERROR_KEY } from "./components/AuthProvider"

/** An Apple redirect sign-in (native shell) reports failures on the return load,
 *  not inline — pick up any stashed message once and clear it. */
export function takeAppleRedirectError(): string | null {
  const stashed = window.sessionStorage.getItem(APPLE_REDIRECT_ERROR_KEY)
  if (stashed) window.sessionStorage.removeItem(APPLE_REDIRECT_ERROR_KEY)
  return stashed
}
