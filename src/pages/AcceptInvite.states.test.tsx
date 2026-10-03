/**
 * The invite page's answers that need no read: sign in first, or a broken link.
 *
 * They used to be set inside the effect that reads the invite (H5,
 * react-hooks/set-state-in-effect); now they are decided in the render that
 * learns them. Pinned: while auth settles it says "Loading invite…"; signed
 * out it asks you to sign in (and reads nothing); a link without a token says
 * so; signing in moves on to the invite.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"

const auth = vi.hoisted(() => ({ state: { user: null as null | { id: string }, loading: true } }))
const getInviteByToken = vi.hoisted(() => vi.fn())
vi.mock("@/modules/home", () => ({
  getInviteByToken: (...a: unknown[]) => getInviteByToken(...a),
  acceptInvite: vi.fn(),
}))
vi.mock("@/modules/auth", () => ({ useAuth: () => auth.state }))

const { default: AcceptInvite } = await import("./AcceptInvite")

const USER = { id: "uid-1" }
const INVITE = {
  data: {
    invite_id: "", home_id: "h1", token: "tok", role: "member",
    expires_at: new Date(Date.now() + 864e5).toISOString(), accepted_by: null,
    home: { name: "SF Condo" }, creator: { full_name: "Barb" }, already_member: false,
  },
  error: null,
}

function Page({ path = "/invite/tok" }: { path?: string }) {
  return (
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/invite/:token" element={<AcceptInvite />} />
        <Route path="/invite" element={<AcceptInvite />} />
      </Routes>
    </MemoryRouter>
  )
}

describe("AcceptInvite · before any read", () => {
  beforeEach(() => {
    getInviteByToken.mockReset().mockResolvedValue(INVITE)
    auth.state = { user: null, loading: true }
  })

  it("waits for auth, then asks a signed-out person to sign in — reading nothing", () => {
    const { rerender } = render(<Page />)
    expect(screen.getByText("Loading invite…")).toBeInTheDocument()

    auth.state = { user: null, loading: false }
    rerender(<Page />)
    expect(screen.getByText("Sign in to join")).toBeInTheDocument()
    expect(getInviteByToken).not.toHaveBeenCalled()
  })

  it("a link with no token says so", () => {
    auth.state = { user: USER, loading: false }
    render(<Page path="/invite" />)
    expect(screen.getByText("Invalid invite link.")).toBeInTheDocument()
    expect(getInviteByToken).not.toHaveBeenCalled()
  })

  it("arriving signed in reads the invite and offers to join", async () => {
    auth.state = { user: USER, loading: false }
    render(<Page />)
    await waitFor(() => expect(screen.getByRole("button", { name: /join sf condo/i })).toBeInTheDocument())
    expect(getInviteByToken).toHaveBeenCalledWith("tok")
  })
})
