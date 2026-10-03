/**
 * How the members list is READ: on arrival, on a home switch, and on Try again.
 *
 * H5 (the whole-app lint) split the old load() — which an effect called and
 * which set its spinner synchronously inside that effect — into one read
 * (readAccess) whose result lands through one function, an imperative load()
 * for Try again, and a spinner that starts in the render that switches homes.
 * The "expires in Nd" label stopped reading the clock during render; it counts
 * from when the list was read, or from when an invite was just made. Pinned:
 *  - a failed read is an error with Try again, and Try again reads again;
 *  - a home switch shows Loading, then that home's members — never the old ones;
 *  - a week-long invite reads "expires in 7d", read or freshly created.
 */
import { describe, expect, it, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { HomeMembersSection } from "./HomeMembersSection"

const svc = vi.hoisted(() => ({
  createInvite: vi.fn(),
  getActiveInvites: vi.fn(),
  getHomeMembers: vi.fn(),
}))
vi.mock("@/modules/home", () => ({
  createInvite: (...a: unknown[]) => svc.createInvite(...a),
  getActiveInvites: (...a: unknown[]) => svc.getActiveInvites(...a),
  revokeInvite: vi.fn(),
  getHomeMembers: (...a: unknown[]) => svc.getHomeMembers(...a),
  removeMember: vi.fn(),
  buildInviteUrl: (t: string) => `https://homehub.test/invite/${t}`,
}))
vi.mock("@/modules/auth", () => ({
  useAuth: () => ({ user: { id: "uid-owner", email: "o@o.o", user_metadata: {} }, loading: false }),
}))
vi.mock("@/integrations/firebase", () => ({ db: {} }))
vi.mock("firebase/firestore", () => ({ doc: vi.fn(), setDoc: vi.fn(), serverTimestamp: vi.fn() }))

const member = (user_id: string, full_name: string, role = "member") => ({ user_id, role, profile: { full_name } })
const weekFromNow = () => new Date(Date.now() + 7 * 864e5).toISOString()
const invite = (invite_id: string) => ({
  invite_id, token: `tok-${invite_id}`, role: "member", created_by: "uid-owner",
  accepted_by: null, accepted_at: null, expires_at: weekFromNow(),
})

beforeEach(() => {
  vi.clearAllMocks()
  svc.getHomeMembers.mockImplementation(async (homeId: string) => ({
    data: homeId === "home-2"
      ? [member("uid-owner", "Owner Person", "owner"), member("uid-p", "Parent Person")]
      : [member("uid-owner", "Owner Person", "owner"), member("uid-o", "Other Person")],
    error: null,
  }))
  svc.getActiveInvites.mockResolvedValue({ data: [], error: null })
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } })
})

describe("HomeMembersSection · reading the list", () => {
  it("a failed read says so with Try again, and Try again reads again", async () => {
    svc.getHomeMembers.mockRejectedValueOnce(new Error("Missing or insufficient permissions."))
    render(<HomeMembersSection homeId="home-1" />)
    await waitFor(() => expect(screen.getByText("Missing or insufficient permissions.")).toBeInTheDocument())
    expect(screen.queryByText("Other Person")).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    await waitFor(() => expect(screen.getByText("Other Person")).toBeInTheDocument())
    expect(screen.queryByText("Missing or insufficient permissions.")).toBeNull()
    expect(svc.getHomeMembers).toHaveBeenCalledTimes(2)
  })

  it("a home switch shows Loading, then that home's members — never the last home's", async () => {
    const { rerender } = render(<HomeMembersSection homeId="home-1" />)
    await waitFor(() => expect(screen.getByText("Other Person")).toBeInTheDocument())

    rerender(<HomeMembersSection homeId="home-2" />)
    // The render that switches already shows the spinner, not home-1's list.
    expect(screen.getByText("Loading...")).toBeInTheDocument()
    expect(screen.queryByText("Other Person")).toBeNull()
    await waitFor(() => expect(screen.getByText("Parent Person")).toBeInTheDocument())
    expect(svc.getHomeMembers).toHaveBeenLastCalledWith("home-2")
  })

  it("a week-long invite reads 'expires in 7d', read with the list or just created", async () => {
    svc.getActiveInvites.mockResolvedValue({ data: [invite("read")], error: null })
    render(<HomeMembersSection homeId="home-1" />)
    await waitFor(() => expect(screen.getByText(/Invite link · expires in 7d/)).toBeInTheDocument())

    svc.createInvite.mockResolvedValue({ data: invite("new"), error: null })
    fireEvent.click(screen.getByRole("button", { name: /Invite/ }))
    await waitFor(() => expect(screen.getAllByText(/Invite link · expires in 7d/)).toHaveLength(2))
  })
})
