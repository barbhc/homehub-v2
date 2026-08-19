/**
 * Household export: shape, Timestamp handling, and — the part that matters —
 * what happens when a collection cannot be read.
 *
 * The export is a support tool. Someone reconciling "this looks wrong" will
 * read a missing section as "the data isn't there", so an unreadable
 * collection has to be reported, not silently dropped and not allowed to sink
 * the whole export.
 */
import { describe, expect, it, vi, beforeEach } from "vitest"

const getDocs = vi.fn()

// vi.mock is hoisted above every top-level binding, so the stand-in Timestamp
// has to be created inside vi.hoisted to exist by the time the factory runs.
const { FakeTimestamp } = vi.hoisted(() => ({
  // A plain field, not a parameter property: tsconfig sets
  // `erasableSyntaxOnly`, which rejects `constructor(private d: Date)`.
  FakeTimestamp: class {
    d: Date
    constructor(d: Date) { this.d = d }
    toDate() { return this.d }
  },
}))

vi.mock("@/integrations/firebase", () => ({ db: {} }))
vi.mock("firebase/firestore", () => ({
  collection: (_db: unknown, path: string) => ({ path }),
  getDocs: (...a: unknown[]) => getDocs(...a),
  Timestamp: FakeTimestamp,
}))

import {
  buildHomeExport, toJsonSafe, exportFilename, EXPORTED_COLLECTIONS,
} from "./exportService"

const docOf = (id: string, data: Record<string, unknown>) => ({ id, data: () => data })

beforeEach(() => {
  vi.clearAllMocks()
  getDocs.mockResolvedValue({ docs: [] })
})

describe("toJsonSafe", () => {
  it("turns Timestamps into ISO strings, including nested and in arrays", () => {
    const t = new FakeTimestamp(new Date("2026-08-19T12:00:00.000Z"))
    const out = toJsonSafe({
      createdAt: t,
      nested: { updatedAt: t },
      list: [{ dueAt: t }],
      plain: "unchanged",
      n: 3,
      nul: null,
    }) as Record<string, never>

    expect(out.createdAt).toBe("2026-08-19T12:00:00.000Z")
    expect((out.nested as Record<string, unknown>).updatedAt).toBe("2026-08-19T12:00:00.000Z")
    expect((out.list as Record<string, unknown>[])[0].dueAt).toBe("2026-08-19T12:00:00.000Z")
    expect(out.plain).toBe("unchanged")
    expect(out.n).toBe(3)
    expect(out.nul).toBeNull()
  })
})

describe("buildHomeExport", () => {
  it("reads every exported collection and counts the rows", async () => {
    getDocs.mockImplementation((ref: { path: string }) =>
      Promise.resolve({
        docs: ref.path.endsWith("/items")
          ? [docOf("i1", { displayName: "Furnace" }), docOf("i2", { displayName: "Dryer" })]
          : [],
      }),
    )

    const res = await buildHomeExport("home-1", new Date("2026-08-19T00:00:00.000Z"))

    expect(getDocs).toHaveBeenCalledTimes(EXPORTED_COLLECTIONS.length)
    expect(res.homeId).toBe("home-1")
    expect(res.formatVersion).toBe(1)
    expect(res.counts.items).toBe(2)
    expect(res.data.items[0]).toMatchObject({ id: "i1", displayName: "Furnace" })
    expect(res.partial).toEqual([])
  })

  it("never exports live invite tokens", () => {
    // Invites are credentials and an export is a file people email around.
    expect(EXPORTED_COLLECTIONS).not.toContain("invites")
  })

  it("one unreadable collection → recorded in `partial`, the rest still exported", async () => {
    getDocs.mockImplementation((ref: { path: string }) =>
      ref.path.endsWith("/members")
        ? Promise.reject(new Error("Missing or insufficient permissions."))
        : Promise.resolve({ docs: [docOf("x", { a: 1 })] }),
    )

    const res = await buildHomeExport("home-1")

    expect(res.partial).toEqual([
      { collection: "members", reason: "Missing or insufficient permissions." },
    ])
    // The gap must be a named absence, not an empty array that reads as "none".
    expect(res.data.members).toBeUndefined()
    expect(res.counts.members).toBeUndefined()
    expect(res.counts.items).toBe(1)
  })

  it("a non-member (all reads denied) → every collection lands in `partial`, no data", async () => {
    getDocs.mockRejectedValue(new Error("Missing or insufficient permissions."))

    const res = await buildHomeExport("home-1")

    expect(res.partial).toHaveLength(EXPORTED_COLLECTIONS.length)
    expect(Object.keys(res.data)).toHaveLength(0)
    expect(Object.values(res.counts).reduce((a, n) => a + n, 0)).toBe(0)
  })

  it("is serialisable — the whole point of the file", async () => {
    getDocs.mockResolvedValue({
      docs: [docOf("i1", { createdAt: new FakeTimestamp(new Date("2026-01-02T03:04:05.000Z")) })],
    })

    const res = await buildHomeExport("home-1")
    const round = JSON.parse(JSON.stringify(res))

    expect(round.data.items[0].createdAt).toBe("2026-01-02T03:04:05.000Z")
  })
})

describe("exportFilename", () => {
  it("names the home and the day", () => {
    expect(exportFilename("home-1", new Date("2026-08-19T22:00:00.000Z")))
      .toBe("homehub-export-home-1-2026-08-19.json")
  })
})
