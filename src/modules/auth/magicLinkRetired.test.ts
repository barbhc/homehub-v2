/**
 * The magic-link path is gone, and must not creep back.
 *
 * Email-link sign-in is not a provider row in Firebase — it is a checkbox
 * inside Email/Password, and it was never switched on for this project. So the
 * "Email me a magic link" button failed with auth/operation-not-allowed for
 * every user who pressed it, the owner included. She chose to remove the path
 * rather than enable it (2026-08-28).
 *
 * Structural rather than rendered: this asserts the code cannot send or
 * complete a link, which is what "removed" has to mean. A rendering test would
 * pass just as happily with the button hidden behind a flag.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"

const read = (p: string) => readFileSync(p, "utf8")
const provider = read("src/modules/auth/components/AuthProvider.tsx")
const form = read("src/modules/auth/components/SignInForm.tsx")
const page = read("src/pages/AuthPage.tsx")

describe("magic-link sign-in is retired", () => {
  it("nothing can send a link", () => {
    expect(provider).not.toContain("sendSignInLinkToEmail")
  })

  it("nothing can complete one", () => {
    expect(provider).not.toContain("signInWithEmailLink")
    expect(provider).not.toContain("completeMagicLink")
  })

  it("the button is gone from the sign-in form", () => {
    expect(form).not.toContain("Email me a magic link")
    expect(form).not.toContain("signInWithMagicLink")
  })

  it("the cross-device confirm-email form is gone", () => {
    expect(page).not.toContain("CompleteLinkForm")
    expect(page).not.toContain("completeLink")
  })

  it("the localStorage keys it used are gone too", () => {
    // Left behind, these would be the only trace of a feature nobody can reach.
    expect(provider).not.toContain("homehub:emailForSignIn")
    expect(provider).not.toContain("homehub:emailLinkUrl")
  })

  it("the other two providers are untouched", () => {
    // Email/password and Apple are what sign-in runs on now.
    expect(provider).toContain("signInWithEmailAndPassword")
    expect(provider).toContain("OAuthProvider")
    expect(form).toContain("Continue with Apple")
  })
})
