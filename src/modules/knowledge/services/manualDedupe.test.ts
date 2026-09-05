/**
 * HH-154 — adding the same manual twice must not mint a second record.
 *
 * Owner, 2026-09-05: "Why is the rice cooker saved 4 times here?" — four
 * documents for one appliance, one scanned and three stuck at "Not scanned"
 * forever, with no way to remove them. Every add called createManualDocument,
 * which always created. A retried upload became a duplicate instead of a
 * replacement.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

const getDocs = vi.fn()
const getDoc = vi.fn()
const update = vi.fn()
const set = vi.fn()
const commit = vi.fn()
const batch = { set, update, commit }

vi.mock("firebase/firestore", () => ({
  collection: (_db: unknown, path: string) => ({ path }),
  doc: (...a: unknown[]) => ({ id: "new-id", path: String(a[1] ?? "new") }),
  query: (...a: unknown[]) => ({ q: a }),
  where: (f: string, op: string, v: unknown) => ({ f, op, v }),
  getDocs: (...a: unknown[]) => getDocs(...a),
  getDoc: (...a: unknown[]) => getDoc(...a),
  writeBatch: () => batch,
  serverTimestamp: () => "ts",
  orderBy: () => ({}),
  limit: () => ({}),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  Timestamp: class { static now() { return new Date() } toDate() { return new Date() } },
}))
vi.mock("@/integrations/firebase", () => ({ db: {}, callable: () => vi.fn() }))

const { createManualDocument } = await import("./manualDocumentService")

const input = {
  item_unit_id: "rice-cooker",
  title: "Rice Cooker.pdf",
  source_type: "upload" as const,
  source_ref: "homes/h1/manuals/rice.pdf",
}

beforeEach(() => {
  vi.clearAllMocks()
  set.mockReturnValue(batch); update.mockReturnValue(batch); commit.mockResolvedValue(undefined)
  getDoc.mockResolvedValue({ data: () => ({ itemUnitId: "rice-cooker", title: "Rice Cooker.pdf", parsedAt: null }) })
})

describe("createManualDocument is idempotent per item + source", () => {
  it("REUSES the existing record when the same manual is added again", async () => {
    getDocs.mockResolvedValue({ docs: [{ ref: { id: "existing-1" }, data: () => ({}) }] })
    const res = await createManualDocument("h1", input)
    expect(res.error).toBeNull()
    expect(update).toHaveBeenCalledTimes(1)
    expect(set).not.toHaveBeenCalled()
    // …and the replaced file is treated as unread, so it actually gets scanned.
    const patch = update.mock.calls[0][1] as Record<string, unknown>
    expect(patch.parsedAt).toBeNull()
    expect(patch.parse).toBeNull()
  })

  it("creates exactly one record when there is none", async () => {
    getDocs.mockResolvedValue({ docs: [] })
    const res = await createManualDocument("h1", input)
    expect(res.error).toBeNull()
    expect(set).toHaveBeenCalledTimes(1)
    expect(update).not.toHaveBeenCalled()
  })

  it("four adds of the same manual leave ONE record — the owner's case", async () => {
    getDocs.mockResolvedValueOnce({ docs: [] })
    await createManualDocument("h1", input)
    getDocs.mockResolvedValue({ docs: [{ ref: { id: "existing-1" }, data: () => ({}) }] })
    await createManualDocument("h1", input)
    await createManualDocument("h1", input)
    await createManualDocument("h1", input)
    expect(set).toHaveBeenCalledTimes(1)
    expect(update).toHaveBeenCalledTimes(3)
  })

  it("a DIFFERENT manual on the same item still gets its own record", async () => {
    getDocs.mockResolvedValue({ docs: [] })
    await createManualDocument("h1", { ...input, source_ref: "homes/h1/manuals/other.pdf" })
    expect(set).toHaveBeenCalledTimes(1)
  })

  it("a failed lookup does not block the add — it falls through to creating", async () => {
    getDocs.mockRejectedValue(new Error("offline"))
    const res = await createManualDocument("h1", input)
    expect(res.error).toBeNull()
    expect(set).toHaveBeenCalledTimes(1)
  })
})
