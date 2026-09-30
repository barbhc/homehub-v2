/**
 * What the Invite button writes.
 *
 * firestore.rules refuses an invite whose role is not one the CALLER may hand
 * out (any member: member/guest; owners: any role), or whose createdBy is not
 * the caller. createInvite used to default to role "admin" — so once the rule
 * shipped, every non-owner's Invite button would have failed. The emulator
 * suite (firebase/rules.test.ts "invites") pins the verdicts; this pins the
 * payload the one caller (HomeMembersSection) actually sends.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const batchSets: Array<{ path: string; data: Record<string, unknown> }> = []
const getInviteDetails = vi.fn()

vi.mock("firebase/firestore", () => ({
  Timestamp: class {
    static fromDate(d: Date) {
      return { iso: d.toISOString() }
    }
  },
  collection: vi.fn((_db: unknown, path: string) => ({ path })),
  doc: vi.fn((parent: { path?: string }, path?: string) => ({ path: path ?? `${parent.path}/new-invite`, id: "new-invite" })),
  getDoc: vi.fn(async () => ({ data: () => ({ token: "t", role: "member", createdBy: "uid-1" }) })),
  getDocs: vi.fn(),
  deleteDoc: vi.fn(),
  serverTimestamp: vi.fn(),
  writeBatch: vi.fn(() => {
    const batch = {
      set: vi.fn((ref: { path: string }, data: Record<string, unknown>) => {
        batchSets.push({ path: ref.path, data })
        return batch
      }),
      commit: vi.fn(async () => undefined),
    }
    return batch
  }),
}))
vi.mock("@/integrations/firebase", () => ({
  db: {},
  callable: (name: string) => (req: unknown) => (name === "getInviteDetails" ? getInviteDetails(req) : Promise.resolve({})),
}))

import { createInvite, getInviteByToken } from "./inviteService"

beforeEach(() => {
  batchSets.length = 0
  getInviteDetails.mockReset()
})

describe("createInvite", () => {
  it("defaults to role 'member' — never the old 'admin'", async () => {
    const res = await createInvite("home-1", "uid-1")
    expect(res.error).toBeNull()
    expect(batchSets).toHaveLength(1)
    expect(batchSets[0].path).toBe("homes/home-1/invites/new-invite")
    expect(batchSets[0].data.role).toBe("member")
    expect(batchSets[0].data.role).not.toBe("admin")
  })

  it("stamps createdBy with the caller's uid (the rules pin it)", async () => {
    await createInvite("home-1", "uid-1")
    expect(batchSets[0].data.createdBy).toBe("uid-1")
  })

  it("still writes an explicitly chosen role", async () => {
    await createInvite("home-1", "uid-1", "guest")
    expect(batchSets[0].data.role).toBe("guest")
  })
})

describe("getInviteByToken", () => {
  const found = { found: true, home_id: "h", home_name: "SF Condo", role: "member", expires_at: "2099-01-01T00:00:00Z", accepted: false }

  it("passes the server's already_member flag through", async () => {
    getInviteDetails.mockResolvedValue({ ...found, already_member: true })
    const res = await getInviteByToken("tok")
    expect(res.data?.already_member).toBe(true)
  })

  it("reads a server that predates the flag as 'not a member'", async () => {
    getInviteDetails.mockResolvedValue(found)
    const res = await getInviteByToken("tok")
    expect(res.data?.already_member).toBe(false)
  })
})
