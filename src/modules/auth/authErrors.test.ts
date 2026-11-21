import { describe, expect, it } from "vitest"
import { authErrorMessage } from "./authErrors"

const fbError = (code: string) => Object.assign(new Error(`Firebase: Error (${code}).`), { code })

describe("authErrorMessage", () => {
  it("says what to do for the codes people hit", () => {
    expect(authErrorMessage(fbError("auth/email-already-in-use"))).toBe("There’s already an account with that email. Sign in instead.")
    expect(authErrorMessage(fbError("auth/weak-password"))).toBe("Use at least 8 characters for your password.")
    expect(authErrorMessage(fbError("auth/invalid-credential"))).toMatch(/don’t match/)
  })
  it("reads the code out of the message when the error lost its code", () => {
    expect(authErrorMessage(new Error("Firebase: Error (auth/network-request-failed)."))).toMatch(/Unable to connect/)
  })
  it("keeps any other message as it is", () => {
    expect(authErrorMessage(new Error("Apple sign-in was cancelled."))).toBe("Apple sign-in was cancelled.")
  })
})
