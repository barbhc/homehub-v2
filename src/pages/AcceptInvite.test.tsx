/**
 * Opening an invite to a home you already belong to.
 *
 * acceptInvite used to set() the member doc with merge:true, so accepting
 * RE-ROLED an existing member — an owner opening their own link came out
 * "admin", and a sole owner left the home with none. The server now refuses
 * (firebase/functions/test/inviteActions.emu.test.mjs); this pins the page:
 * it says so up front and offers no Join button to press.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import AcceptInvite from "./AcceptInvite"

const getInviteByToken = vi.fn()
const acceptInvite = vi.fn()
vi.mock("@/modules/home", () => ({
  getInviteByToken: (...a: unknown[]) => getInviteByToken(...a),
  acceptInvite: (...a: unknown[]) => acceptInvite(...a),
}))
vi.mock("@/modules/auth", () => ({
  useAuth: () => ({ user: { id: "uid-1", email: "t@t.t", user_metadata: {} }, loading: false }),
}))

const invite = (over: Record<string, unknown> = {}) => ({
  data: {
    invite_id: "", home_id: "h1", token: "tok", role: "member",
    expires_at: new Date(Date.now() + 864e5).toISOString(), accepted_by: null,
    home: { name: "SF Condo" }, creator: { full_name: "Barb" }, already_member: false,
    ...over,
  },
  error: null,
})

function renderPage() {
  render(
    <MemoryRouter initialEntries={["/invite/tok"]}>
      <Routes>
        <Route path="/invite/:token" element={<AcceptInvite />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  getInviteByToken.mockReset()
  acceptInvite.mockReset()
})

describe("AcceptInvite — already a member", () => {
  it("says so, and renders NO Join button", async () => {
    getInviteByToken.mockResolvedValue(invite({ already_member: true }))
    renderPage()
    await waitFor(() => expect(screen.getByText("You're already a member of SF Condo.")).toBeInTheDocument())
    // Not rendered at all (not merely hidden): there is nothing to accept.
    expect(screen.queryByRole("button", { name: /join/i })).toBeNull()
    expect(acceptInvite).not.toHaveBeenCalled()
  })

  it("a non-member still gets the Join button (control)", async () => {
    getInviteByToken.mockResolvedValue(invite())
    renderPage()
    await waitFor(() => expect(screen.getByRole("button", { name: /join sf condo/i })).toBeInTheDocument())
    expect(screen.queryByText(/already a member/i)).toBeNull()
  })
})
