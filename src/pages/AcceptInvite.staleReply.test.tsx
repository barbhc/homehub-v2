/**
 * Opening a second invite link in place: the page answers for the link that
 * is open (H4).
 *
 * The invite read applied whatever came back, so the first link's slow reply,
 * landing after the second link was opened, showed the FIRST link's home with
 * a Join button — and Join accepts the token in the URL, the second one. And
 * until the second link's reply came back the first one's page stayed up,
 * with the same mismatched Join.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom"
import AcceptInvite from "./AcceptInvite"

const getInviteByToken = vi.hoisted(() => vi.fn())
vi.mock("@/modules/home", () => ({
  getInviteByToken: (...a: unknown[]) => getInviteByToken(...a),
  acceptInvite: vi.fn(),
}))
// One user object, as AuthProvider holds it in state: the read's effect keys on
// it, and a fresh object every render would re-read on every render.
const auth = vi.hoisted(() => ({ user: { id: "uid-1", email: "t@t.t", user_metadata: {} }, loading: false }))
vi.mock("@/modules/auth", () => ({ useAuth: () => auth }))

type InviteRead = { data: Record<string, unknown>; error: null }
const inviteTo = (token: string, homeName: string): InviteRead => ({
  data: {
    invite_id: token, home_id: token, token, role: "member",
    expires_at: new Date(Date.now() + 864e5).toISOString(), accepted_by: null,
    home: { name: homeName }, creator: { full_name: "Barb" }, already_member: false,
  },
  error: null,
})

function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => { resolve = r })
  return { promise, resolve }
}

/** The second link, opened in place (as an in-app link would). */
function OpenSecondLink() {
  const navigate = useNavigate()
  return <button type="button" onClick={() => navigate("/invite/tok-b")}>open second link</button>
}

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={["/invite/tok-a"]}>
      <OpenSecondLink />
      <Routes>
        <Route path="/invite/:token" element={<AcceptInvite />} />
      </Routes>
    </MemoryRouter>,
  )

beforeEach(() => getInviteByToken.mockReset())

describe("AcceptInvite — a late reply for the last link lands nowhere", () => {
  it("the first link's slow reply, landing after the second opens, does not replace it", async () => {
    const slowA = deferred<InviteRead>()
    getInviteByToken.mockImplementation((token: string) =>
      token === "tok-a" ? slowA.promise : Promise.resolve(inviteTo("tok-b", "Parents SF")))
    renderPage()
    fireEvent.click(screen.getByRole("button", { name: "open second link" }))
    expect(await screen.findByRole("button", { name: /join parents sf/i })).toBeInTheDocument()

    await act(async () => { slowA.resolve(inviteTo("tok-a", "SF Condo")) })
    expect(screen.getByRole("button", { name: /join parents sf/i })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /join sf condo/i })).toBeNull()
  })

  it("while the second link is read, the first link's Join is not on screen", async () => {
    const slowB = deferred<InviteRead>()
    getInviteByToken.mockImplementation((token: string) =>
      token === "tok-b" ? slowB.promise : Promise.resolve(inviteTo("tok-a", "SF Condo")))
    renderPage()
    expect(await screen.findByRole("button", { name: /join sf condo/i })).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "open second link" }))
    expect(screen.queryByRole("button", { name: /join sf condo/i })).toBeNull()
    expect(screen.getByText("Loading invite…")).toBeInTheDocument()

    await act(async () => { slowB.resolve(inviteTo("tok-b", "Parents SF")) })
    expect(screen.getByRole("button", { name: /join parents sf/i })).toBeInTheDocument()
  })
})
