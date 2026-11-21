/**
 * Sign-in failures in words a person can act on.
 *
 * Firebase hands back "Firebase: Error (auth/email-already-in-use)." — accurate
 * and useless. Map the codes people actually hit; anything else keeps its own
 * message rather than a vague "something went wrong".
 */
const MESSAGES: Record<string, string> = {
  "auth/email-already-in-use": "There’s already an account with that email. Sign in instead.",
  "auth/invalid-email": "That email doesn’t look right. Check it and try again.",
  "auth/weak-password": "Use at least 8 characters for your password.",
  "auth/missing-password": "Enter a password.",
  "auth/invalid-credential": "That email and password don’t match. Try again, or reset your password.",
  "auth/wrong-password": "That email and password don’t match. Try again, or reset your password.",
  "auth/user-not-found": "There’s no account with that email. Create one instead.",
  "auth/too-many-requests": "Too many tries. Wait a minute, then try again.",
  "auth/network-request-failed": "Unable to connect. Check your internet connection and try again.",
  "auth/popup-closed-by-user": "Apple sign-in was closed before it finished. Try again.",
  "auth/cancelled-popup-request": "Apple sign-in was closed before it finished. Try again.",
}

export function authErrorMessage(err: Error): string {
  const code = (err as { code?: unknown }).code
  const fromCode = typeof code === "string" ? MESSAGES[code] : undefined
  if (fromCode) return fromCode
  const inMessage = /\((auth\/[a-z-]+)\)/.exec(err.message)?.[1]
  return (inMessage && MESSAGES[inMessage]) || err.message
}
