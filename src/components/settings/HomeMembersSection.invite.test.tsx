/**
 * The invite row after seventeen fixes (m7) and the no-name fallbacks.
 *
 * Requirements, quoted from the owner-approved list:
 *   · "No automatic copy after create."
 *   · "Invite link ready. It works for {N} days." using the real expiry.
 *   · Share Link uses navigator.share when present; absent, or rejected other
 *     than by the person cancelling, falls back to copy.
 *   · A refused copy says "Couldn't copy. Press and hold the link to copy it."
 *     (and the link is on screen to press and hold).
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react"
import { HomeMembersSection } from "./HomeMembersSection"

const createInvite = vi.fn()
const getActiveInvites = vi.fn()
const getHomeMembers = vi.fn()

vi.mock("@/modules/home", () => ({
  createInvite: (...a: unknown[]) => createInvite(...a),
  getActiveInvites: (...a: unknown[]) => getActiveInvites(...a),
  revokeInvite: vi.fn(),
  getHomeMembers: (...a: unknown[]) => getHomeMembers(...a),
  removeMember: vi.fn(),
  buildInviteUrl: (t: string) => `https://homehub.test/invite/${t}`,
}))
vi.mock("@/modules/auth", () => ({
  useAuth: () => ({ user: { id: "uid-owner", email: "zoe@example.com", user_metadata: {} }, loading: false }),
}))
vi.mock("@/integrations/firebase", () => ({ db: {} }))
vi.mock("firebase/firestore", () => ({ doc: vi.fn(), setDoc: vi.fn(), serverTimestamp: vi.fn() }))

const NAMED_OWNER = { user_id: "uid-owner", role: "owner", profile: { full_name: "Owner Person" } }
const days = (n: number) => new Date(Date.now() + n * 864e5 - 60_000).toISOString()
const invite = (token: string, expires = days(7)) => ({
  invite_id: `inv-${token}`, token, role: "member", created_by: "uid-owner",
  accepted_by: null, accepted_at: null, expires_at: expires, created_at: new Date().toISOString(),
})

let writeText: ReturnType<typeof vi.fn>
beforeEach(() => {
  vi.clearAllMocks()
  getHomeMembers.mockResolvedValue({ data: [NAMED_OWNER], error: null })
  getActiveInvites.mockResolvedValue({ data: [], error: null })
  writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true })
})
afterEach(() => {
  Reflect.deleteProperty(navigator, "share")
})

const settle = async () => {
  render(<HomeMembersSection homeId="home-1" />)
  await waitFor(() => expect(screen.getByText("Owner Person")).toBeInTheDocument())
}
const createOne = async (token = "tok-new", expires = days(7)) => {
  createInvite.mockResolvedValue({ data: invite(token, expires), error: null })
  fireEvent.click(screen.getByRole("button", { name: /^invite$/i }))
  return screen.findByTestId("invite-row")
}

describe("a new invite", () => {
  it("does not copy by itself, and says it is ready for the real number of days", async () => {
    await settle()
    const row = await createOne()
    expect(writeText).not.toHaveBeenCalled()
    expect(screen.getByRole("status")).toHaveTextContent("Invite link ready. It works for 7 days.")
    expect(screen.queryByRole("alert")).toBeNull()
    expect(within(row).getByRole("button", { name: "Share Link" })).toBeInTheDocument()
    expect(within(row).getByRole("button", { name: "Copy" })).toBeInTheDocument()
  })

  it("counts the days from the invite's own expiry", async () => {
    await settle()
    await createOne("tok-short", days(1))
    expect(screen.getByRole("status")).toHaveTextContent("Invite link ready. It works for 1 day.")
  })
})

describe("Copy", () => {
  it("copies this invite's link and says Copied", async () => {
    await settle()
    const row = await createOne()
    fireEvent.click(within(row).getByRole("button", { name: "Copy" }))
    expect(writeText).toHaveBeenCalledWith("https://homehub.test/invite/tok-new")
    expect(await within(row).findByRole("button", { name: "Copied" })).toBeInTheDocument()
  })

  it("a refusal says so in plain words and shows the link to press and hold", async () => {
    writeText.mockRejectedValue(new DOMException("denied", "NotAllowedError"))
    await settle()
    const row = await createOne()
    fireEvent.click(within(row).getByRole("button", { name: "Copy" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't copy. Press and hold the link to copy it.")
    expect(within(row).getByLabelText("Invite link")).toHaveValue("https://homehub.test/invite/tok-new")
  })
})

describe("Share Link", () => {
  it("opens the share sheet with the link when there is one, and copies nothing", async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, "share", { value: share, configurable: true })
    await settle()
    const row = await createOne()
    fireEvent.click(within(row).getByRole("button", { name: "Share Link" }))
    await waitFor(() => expect(share).toHaveBeenCalledWith(expect.objectContaining({ url: "https://homehub.test/invite/tok-new" })))
    expect(writeText).not.toHaveBeenCalled()
  })

  it("closing the sheet is not a failure: no copy, no message", async () => {
    Object.defineProperty(navigator, "share", { value: vi.fn().mockRejectedValue(new DOMException("closed", "AbortError")), configurable: true })
    await settle()
    const row = await createOne()
    fireEvent.click(within(row).getByRole("button", { name: "Share Link" }))
    await waitFor(() => expect(navigator.share).toHaveBeenCalled())
    expect(writeText).not.toHaveBeenCalled()
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("a share that fails for another reason copies instead", async () => {
    Object.defineProperty(navigator, "share", { value: vi.fn().mockRejectedValue(new DOMException("no", "NotAllowedError")), configurable: true })
    await settle()
    const row = await createOne()
    fireEvent.click(within(row).getByRole("button", { name: "Share Link" }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("https://homehub.test/invite/tok-new"))
    expect(await within(row).findByRole("button", { name: "Copied" })).toBeInTheDocument()
  })

  it("with no share sheet at all, copies", async () => {
    await settle()
    const row = await createOne()
    fireEvent.click(within(row).getByRole("button", { name: "Share Link" }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("https://homehub.test/invite/tok-new"))
  })
})

describe("members with no name", () => {
  it("you read as You with your email's initial; anyone else as Member", async () => {
    getHomeMembers.mockResolvedValue({
      data: [
        { user_id: "uid-owner", role: "owner", profile: { full_name: null } },
        { user_id: "uid-other", role: "member", profile: { full_name: null } },
      ],
      error: null,
    })
    render(<HomeMembersSection homeId="home-1" />)
    expect(await screen.findByText("You")).toBeInTheDocument()
    expect(screen.getByText("Z")).toBeInTheDocument()
    expect(screen.getAllByText("Member").length).toBeGreaterThan(0)
    expect(screen.queryByText("?")).toBeNull()
    expect(screen.getByLabelText("Remove this member")).toBeInTheDocument()
  })
})
