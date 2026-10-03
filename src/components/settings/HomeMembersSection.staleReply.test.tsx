/**
 * Settings › Members: a late reply never lands on the wrong home (H4).
 *
 * The list is read on arrival, on a home switch, on Try again, and again after
 * the person saves their name. The effect's read applied whatever came back —
 * so home A's slow read, answering after a switch to home B, put A's members
 * (who can see this home!) under B. Try again and the post-save re-read had
 * the same hole, and the re-read could even START after the switch: a spinner
 * on B's list, then A's members in it.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { HomeMembersSection } from "./HomeMembersSection"

const svc = vi.hoisted(() => ({
  getActiveInvites: vi.fn(),
  getHomeMembers: vi.fn(),
  setDoc: vi.fn(),
}))
vi.mock("@/modules/home", () => ({
  createInvite: vi.fn(),
  getActiveInvites: (...a: unknown[]) => svc.getActiveInvites(...a),
  revokeInvite: vi.fn(),
  getHomeMembers: (...a: unknown[]) => svc.getHomeMembers(...a),
  removeMember: vi.fn(),
  buildInviteUrl: (t: string) => `https://homehub.test/invite/${t}`,
}))
vi.mock("@/modules/auth", () => ({
  useAuth: () => ({ user: { id: "uid-me", email: "o@o.o", user_metadata: {} }, loading: false }),
}))
vi.mock("@/integrations/firebase", () => ({ db: {} }))
vi.mock("firebase/firestore", () => ({
  doc: vi.fn(),
  setDoc: (...a: unknown[]) => svc.setDoc(...a),
  serverTimestamp: vi.fn(),
}))

type Member = { user_id: string; role: string; profile: { full_name: string | null } }
type MembersRead = { data: Member[]; error: null }
const member = (user_id: string, full_name: string | null, role = "member"): Member => ({ user_id, role, profile: { full_name } })
const MEMBERS: Record<string, Member[]> = {
  "home-a": [member("uid-me", "Me Person", "owner"), member("uid-a", "Alice FromA")],
  "home-b": [member("uid-me", "Me Person", "owner"), member("uid-b", "Bob FromB")],
}
const read = (homeId: string): Promise<MembersRead> => Promise.resolve({ data: MEMBERS[homeId], error: null })

function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => { resolve = r })
  return { promise, resolve }
}

beforeEach(() => {
  vi.clearAllMocks()
  svc.getHomeMembers.mockImplementation(read)
  svc.getActiveInvites.mockResolvedValue({ data: [], error: null })
})

describe("HomeMembersSection — a late reply for the last home lands nowhere", () => {
  it("home A's slow first read, answering after the switch to B, leaves B's members", async () => {
    const slowA = deferred<MembersRead>()
    svc.getHomeMembers.mockImplementation((homeId: string) => (homeId === "home-a" ? slowA.promise : read(homeId)))
    const { rerender } = render(<HomeMembersSection homeId="home-a" />)

    rerender(<HomeMembersSection homeId="home-b" />)
    expect(await screen.findByText("Bob FromB")).toBeInTheDocument()

    await act(async () => { slowA.resolve({ data: MEMBERS["home-a"], error: null }) })
    expect(screen.getByText("Bob FromB")).toBeInTheDocument()
    expect(screen.queryByText("Alice FromA")).toBeNull()
  })

  it("Try again on A, answering after the switch to B, leaves B's members", async () => {
    const retryA = deferred<MembersRead>()
    svc.getHomeMembers
      .mockRejectedValueOnce(new Error("Missing or insufficient permissions."))
      .mockImplementation((homeId: string) => (homeId === "home-a" ? retryA.promise : read(homeId)))
    const { rerender } = render(<HomeMembersSection homeId="home-a" />)
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }))

    rerender(<HomeMembersSection homeId="home-b" />)
    expect(await screen.findByText("Bob FromB")).toBeInTheDocument()

    await act(async () => { retryA.resolve({ data: MEMBERS["home-a"], error: null }) })
    expect(screen.getByText("Bob FromB")).toBeInTheDocument()
    expect(screen.queryByText("Alice FromA")).toBeNull()
  })

  it("the re-read after saving a name, finishing after the switch, neither spins nor lands on B", async () => {
    // No name yet, so the list offers the field in place.
    const noName: Record<string, Member[]> = {
      "home-a": [member("uid-me", null, "owner"), member("uid-a", "Alice FromA")],
      "home-b": [member("uid-me", null, "owner"), member("uid-b", "Bob FromB")],
    }
    svc.getHomeMembers.mockImplementation(async (homeId: string) => ({ data: noName[homeId], error: null }))
    const save = deferred<void>()
    svc.setDoc.mockReturnValue(save.promise)
    const { rerender } = render(<HomeMembersSection homeId="home-a" />)
    fireEvent.change(await screen.findByLabelText("Your display name"), { target: { value: "Me Person" } })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    rerender(<HomeMembersSection homeId="home-b" />)
    expect(await screen.findByText("Bob FromB")).toBeInTheDocument()

    await act(async () => { save.resolve() })
    await act(async () => {})
    expect(screen.queryByText("Loading...")).toBeNull()
    expect(screen.getByText("Bob FromB")).toBeInTheDocument()
    expect(screen.queryByText("Alice FromA")).toBeNull()
    await waitFor(() => expect(svc.getHomeMembers).not.toHaveBeenLastCalledWith("home-a"))
  })
})
