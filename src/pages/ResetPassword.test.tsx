/**
 * ResetPassword phase machine (launch-incident regression): the old `ready`
 * boolean left the page stuck on "Verifying your link…" forever when the
 * oobCode was missing or invalid — the error was only rendered inside the
 * ready-only form. Also covers the mode=signIn handoff (Firebase routes ALL
 * email-action types through ONE action URL).
 */
import { describe, expect, it, vi, beforeEach } from "vitest"
import { render, screen, waitFor, fireEvent } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import ResetPassword from "./ResetPassword"

const verifyPasswordResetCode = vi.fn()
const isSignInWithEmailLink = vi.fn()
vi.mock("firebase/auth", () => ({
  verifyPasswordResetCode: (...a: unknown[]) => verifyPasswordResetCode(...a),
  confirmPasswordReset: vi.fn(),
  isSignInWithEmailLink: (...a: unknown[]) => isSignInWithEmailLink(...a),
}))
vi.mock("@/integrations/firebase", () => ({ auth: {} }))

const useAuth = vi.fn()
vi.mock("@/modules/auth", () => ({ useAuth: () => useAuth() }))

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/reset" element={<div>REQUEST-PAGE</div>} />
        <Route path="/signin" element={<div>SIGNIN-PAGE</div>} />
        <Route path="/" element={<div>HOME-PAGE</div>} />
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => {
  verifyPasswordResetCode.mockReset()
  isSignInWithEmailLink.mockReset().mockReturnValue(false)
  useAuth.mockReset().mockReturnValue({ user: null, loading: false })
})

describe("ResetPassword phases", () => {
  it("no oobCode → immediate link-error card with a request-new-link CTA (never a stuck spinner)", async () => {
    renderAt("/reset-password")
    expect(screen.getByText(/that link didn't work/i)).toBeInTheDocument()
    expect(screen.queryByText(/verifying your link/i)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /request a new link/i }))
    await waitFor(() => expect(screen.getByText("REQUEST-PAGE")).toBeInTheDocument())
  })

  it("invalid oobCode → verify rejects → link-error card (the incident regression)", async () => {
    verifyPasswordResetCode.mockRejectedValue(new Error("expired"))
    renderAt("/reset-password?mode=resetPassword&oobCode=bad")
    await waitFor(() => expect(screen.getByText(/that link didn't work/i)).toBeInTheDocument())
    expect(screen.queryByText(/verifying your link/i)).not.toBeInTheDocument()
  })

  it("valid oobCode → the new-password form", async () => {
    verifyPasswordResetCode.mockResolvedValue("ok")
    renderAt("/reset-password?mode=resetPassword&oobCode=good")
    await waitFor(() => expect(screen.getByText(/set a new password/i)).toBeInTheDocument())
  })

  it("mode=signIn with a session → hands off home (magic links share the action URL)", async () => {
    useAuth.mockReturnValue({ user: { id: "u1" }, loading: false })
    renderAt("/reset-password?mode=signIn&oobCode=x")
    await waitFor(() => expect(screen.getByText("HOME-PAGE")).toBeInTheDocument())
  })

  it("mode=signIn without a session shows the finishing state, not the reset spinner", () => {
    renderAt("/reset-password?mode=signIn&oobCode=x")
    expect(screen.getByText(/finishing sign-in/i)).toBeInTheDocument()
  })
})
