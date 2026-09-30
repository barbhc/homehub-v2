/**
 * Ask's conversation rail: listConversations shows the 50 most recently
 * touched conversations, newest first — and conversations that were touched in
 * the same instant (the seed writes three) keep one stable order.
 *
 * Audit 2026-09-29 (B, Part 1): it read EVERY conversation the home ever had
 * and cut the list to 50 on the client. The expected order below is what that
 * implementation returned; `docsRead` is what a visit costs.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("firebase/firestore", async () => (await import("@/test/fakeFirestore")).fakeFirestoreModule)
vi.mock("@/integrations/firebase", () => ({ db: {}, auth: { currentUser: null }, callable: vi.fn(() => vi.fn()) }))

const { fakeDb, Timestamp } = await import("@/test/fakeFirestore")
const { listConversations } = await import("./conversationService")

const HOME = "h1"
const base = Date.parse("2026-06-01T00:00:00Z")

/** 60 conversations, ids deliberately NOT in time order, three touched at the very same instant. */
function sixtyConversations() {
  const docs: Record<string, Record<string, unknown>> = {}
  for (let i = 0; i < 60; i++) {
    const id = `conv-${String((i * 37) % 60).padStart(2, "0")}`
    const updated = i >= 57 ? base + 57 * 3_600_000 : base + i * 3_600_000 // the three newest share an instant
    docs[`homes/${HOME}/chatConversations/${id}`] = {
      userId: "u1",
      title: `Question ${i}`,
      createdAt: Timestamp.fromMillis(base + i * 60_000),
      updatedAt: Timestamp.fromMillis(updated),
    }
  }
  return docs
}

describe("listConversations", () => {
  beforeEach(() => fakeDb.load(sixtyConversations()))

  it("the 50 most recent, newest first; a shared instant keeps document-id order", async () => {
    const list = await listConversations(HOME)
    expect(list).toHaveLength(50)
    expect(list?.slice(0, 5).map((c) => [c.id, c.title, c.updated_at])).toEqual([
      ["conv-09", "Question 57", "2026-06-03T09:00:00.000Z"],
      ["conv-23", "Question 59", "2026-06-03T09:00:00.000Z"],
      ["conv-46", "Question 58", "2026-06-03T09:00:00.000Z"],
      ["conv-32", "Question 56", "2026-06-03T08:00:00.000Z"],
      ["conv-55", "Question 55", "2026-06-03T07:00:00.000Z"],
    ])
    expect(list?.at(-1)?.title).toBe("Question 10")
    // Was 60: every conversation, cut to 50 on the client.
    expect(fakeDb.reads.docsRead).toBe(50)
    expect(fakeDb.reads.log).toEqual(["query homes/h1/chatConversations [orderBy updatedAt desc, limit 50] → 50"])
  })

  it("fewer than 50: all of them, same order", async () => {
    fakeDb.load(
      Object.fromEntries(
        Object.entries(sixtyConversations()).filter(([path]) => /conv-(0\d|1\d)$/.test(path)),
      ),
    )
    const list = await listConversations(HOME)
    expect(list).toHaveLength(20)
    const times = list!.map((c) => c.updated_at)
    expect(times).toEqual([...times].sort().reverse())
  })

  it("a failed read is 'persistence off' (null), as before", async () => {
    fakeDb.failWith = new Error("unavailable")
    expect(await listConversations(HOME)).toBeNull()
  })

  it("no home → no call", async () => {
    expect(await listConversations("")).toBeNull()
    expect(fakeDb.reads.queries).toBe(0)
  })
})
