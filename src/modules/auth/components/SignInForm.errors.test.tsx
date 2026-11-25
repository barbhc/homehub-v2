/**
 * A failed sign-in says what to do, not what Firebase said.
 *
 * The form showed err.message, so a mistyped email read "Firebase: Error
 * (auth/user-not-found)." (flow walk, 2026-11-24). KeepListSheet already went
 * through authErrorMessage; this form now does too.
 */
import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"

const signIn = vi.fn()
vi.mock("./AuthProvider", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./AuthProvider")>()),
  useAuth: () => ({ signIn, signUp: vi.fn(), resetPassword: vi.fn(), signInWithApple: vi.fn() }),
}))

import { SignInForm } from "./SignInForm"

describe("SignInForm errors", () => {
  it.each([
    ["Firebase: Error (auth/user-not-found).", "There’s no account with that email. Create one instead."],
    ["Firebase: Error (auth/invalid-credential).", "That email and password don’t match. Try again, or reset your password."],
  ])("%s → plain words", async (raw, plain) => {
    signIn.mockResolvedValue({ error: new Error(raw) })
    const { container } = render(<MemoryRouter><SignInForm /></MemoryRouter>)
    fireEvent.change(container.querySelector('input[type="email"]')!, { target: { value: "sam@example.com" } })
    fireEvent.change(container.querySelector('input[type="password"]')!, { target: { value: "not-the-password" } })
    fireEvent.submit(container.querySelector("form")!)
    await waitFor(() => expect(screen.getByText(plain)).toBeInTheDocument())
    expect(screen.queryByText(raw)).not.toBeInTheDocument()
  })
})
