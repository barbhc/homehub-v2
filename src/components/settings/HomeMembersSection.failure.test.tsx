/**
 * Failure-path coverage for the invite/member flow.
 *
 * All three actions here used to swallow their result. They keyed off
 * `res.data` and did nothing at all on `res.error`, so a failed call produced
 * the success animation and no message:
 *
 *   · create invite  — spinner stopped, no link, nothing said
 *   · revoke invite  — result DISCARDED, row removed regardless, link still live
 *   · remove member  — dialog closed, member still in the home
 *
 * The revoke one is the expensive one: it is the access-control action, and
 * "it disappeared from the list" is exactly how a user confirms it worked.
 *
 * Each test forces the underlying service to fail and asserts BOTH halves —
 * the error is on screen, AND the optimistic success never happened.
 */
import { describe, expect, it, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { HomeMembersSection } from "./HomeMembersSection"

const createInvite = vi.fn()
const getActiveInvites = vi.fn()
const revokeInvite = vi.fn()
const getHomeMembers = vi.fn()
const removeMember = vi.fn()

vi.mock("@/modules/home", () => ({
  createInvite: (...a: unknown[]) => createInvite(...a),
  getActiveInvites: (...a: unknown[]) => getActiveInvites(...a),
  revokeInvite: (...a: unknown[]) => revokeInvite(...a),
  getHomeMembers: (...a: unknown[]) => getHomeMembers(...a),
  removeMember: (...a: unknown[]) => removeMember(...a),
  buildInviteUrl: (t: string) => `https://homehub.test/invite/${t}`,
}))
vi.mock("@/modules/auth", () => ({
  useAuth: () => ({ user: { id: "uid-owner", email: "o@o.o", user_metadata: {} }, loading: false }),
}))
vi.mock("@/integrations/firebase", () => ({ db: {} }))
vi.mock("firebase/firestore", () => ({
  doc: vi.fn(), setDoc: vi.fn(), serverTimestamp: vi.fn(),
}))

const OWNER = {
  user_id: "uid-owner", role: "owner",
  profile: { full_name: "Owner Person" },
}
const OTHER = {
  user_id: "uid-other", role: "member",
  profile: { full_name: "Other Person" },
}
const INVITE = {
  invite_id: "inv-1", token: "tok-1", role: "member",
  created_by: "uid-owner", accepted_by: null, accepted_at: null,
  expires_at: new Date(Date.now() + 7 * 864e5).toISOString(),
}

beforeEach(() => {
  vi.clearAllMocks()
  getHomeMembers.mockResolvedValue({ data: [OWNER, OTHER], error: null })
  getActiveInvites.mockResolvedValue({ data: [INVITE], error: null })
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } })
})

const renderAndSettle = async () => {
  render(<HomeMembersSection homeId="home-1" />)
  await waitFor(() => expect(screen.getByText("Owner Person")).toBeInTheDocument())
}

describe("HomeMembersSection — failures must be visible, not silent", () => {
  it("create invite fails → shows the error and adds no invite row", async () => {
    createInvite.mockResolvedValue({ data: null, error: { message: "permission-denied" } })
    await renderAndSettle()

    fireEvent.click(screen.getByRole("button", { name: /^invite$/i }))

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/permission-denied/i))
    // One invite existed before; a failed create must not have produced another.
    expect(screen.getAllByLabelText(/revoke invite/i)).toHaveLength(1)
  })

  it("revoke invite fails → error shown AND the invite stays in the list", async () => {
    revokeInvite.mockResolvedValue({ data: null, error: { message: "network down" } })
    await renderAndSettle()
    expect(screen.getAllByLabelText(/revoke invite/i)).toHaveLength(1)

    fireEvent.click(screen.getByLabelText(/revoke invite/i))

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/could not revoke/i))
    // The whole point: the link is still live, so the row must still be there.
    expect(screen.getAllByLabelText(/revoke invite/i)).toHaveLength(1)
  })

  it("remove member fails → error shown, dialog stays open, member still listed", async () => {
    removeMember.mockResolvedValue({ data: null, error: { message: "last owner cannot be removed" } })
    await renderAndSettle()

    fireEvent.click(screen.getByLabelText(/remove other person/i))
    await waitFor(() => expect(screen.getByRole("button", { name: /^remove$/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole("button", { name: /^remove$/i }))

    await waitFor(() =>
      expect(screen.getAllByRole("alert").some((n) => /last owner/i.test(n.textContent ?? ""))).toBe(true),
    )
    // Dialog still open (its confirm button is still mounted) and the member remains.
    expect(screen.getByRole("button", { name: /^remove$/i })).toBeInTheDocument()
    expect(screen.getByText("Other Person")).toBeInTheDocument()
  })

  it("revoke SUCCEEDS → no error, and the invite goes away (the control case)", async () => {
    revokeInvite.mockResolvedValue({ data: true, error: null })
    await renderAndSettle()

    fireEvent.click(screen.getByLabelText(/revoke invite/i))

    await waitFor(() => expect(screen.queryAllByLabelText(/revoke invite/i)).toHaveLength(0))
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  })
})
