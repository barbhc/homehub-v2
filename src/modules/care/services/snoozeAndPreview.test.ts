/**
 * Gate review of #246, items 2 and 3 — the receipts must be exact.
 *
 * 2. "Done · next due {date}" must never name a date that will not be written.
 *    completeTask mints NO next instance when another open instance of the
 *    task already exists (dup-suppression), so previewNextDue says nothing then.
 * 3. Undo of a RE-snooze must put the earlier snooze back. It used to write
 *    "scheduled" unconditionally, dropping the first snooze.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const getDoc = vi.fn()
const getDocs = vi.fn()
const batchSet = vi.fn()

vi.mock("@/integrations/firebase", () => ({ db: {}, auth: { currentUser: null }, callable: vi.fn(() => vi.fn()) }))
vi.mock("@/lib/analytics", () => ({ track: vi.fn() }))
vi.mock("firebase/firestore", () => ({
  Timestamp: class {},
  collection: vi.fn(() => ({})),
  doc: vi.fn((_db: unknown, path: string) => ({ path })),
  query: vi.fn(() => ({})),
  where: vi.fn(() => ({})),
  limit: vi.fn(() => ({})),
  runTransaction: vi.fn(),
  serverTimestamp: vi.fn(() => "ts"),
  getDoc: (...a: unknown[]) => getDoc(...a),
  getDocs: (...a: unknown[]) => getDocs(...a),
  writeBatch: vi.fn(() => {
    const batch = {
      set: (...a: unknown[]) => {
        batchSet(...a)
        return batch
      },
      commit: vi.fn(async () => {}),
    }
    return batch
  }),
}))

import { previewNextDue, snoozeTaskInstance, unsnoozeTaskInstance } from "./taskService"

/** A stored document as getDoc answers it. */
const snap = (id: string, data: Record<string, unknown> | null) => ({
  id,
  exists: () => data !== null,
  get: (k: string) => data?.[k],
  data: () => data ?? undefined,
})

beforeEach(() => {
  getDoc.mockReset()
  getDocs.mockReset()
  batchSet.mockReset()
})

describe("previewNextDue — the receipt's date is the date that gets written", () => {
  const byPath = (path: string) =>
    path.endsWith("/taskInstances/ti-1")
      ? snap("ti-1", { taskTemplateId: "tpl-1", status: "scheduled" })
      : snap("tpl-1", { isActive: true, deletedAt: null, schedule: { scheduleType: "monthly" } })

  it("names the next cadence date when completing this one mints the next", async () => {
    getDoc.mockImplementation(async (ref: { path: string }) => byPath(ref.path))
    getDocs.mockResolvedValue({ docs: [snap("ti-1", { deletedAt: null })] })
    expect(await previewNextDue("h1", "ti-1", "2026-10-15")).toBe("2026-11-15")
  })

  it("names NO date when another open instance exists — completeTask will not mint one", async () => {
    getDoc.mockImplementation(async (ref: { path: string }) => byPath(ref.path))
    getDocs.mockResolvedValue({ docs: [snap("ti-1", { deletedAt: null }), snap("ti-other", { deletedAt: null })] })
    expect(await previewNextDue("h1", "ti-1", "2026-10-15")).toBeNull()
  })

  it("a soft-deleted sibling does not count (the server skips it too)", async () => {
    getDoc.mockImplementation(async (ref: { path: string }) => byPath(ref.path))
    getDocs.mockResolvedValue({ docs: [snap("ti-1", { deletedAt: null }), snap("ti-gone", { deletedAt: "2026-10-01" })] })
    expect(await previewNextDue("h1", "ti-1", "2026-10-15")).toBe("2026-11-15")
  })
})

describe("Snooze Undo puts back exactly what the snooze replaced", () => {
  it("a re-snooze answers with the earlier snooze, and Undo restores it", async () => {
    getDoc.mockResolvedValue(snap("ti-1", { status: "snoozed", snoozedUntil: "2026-10-20", dueDate: "2026-10-10" }))
    const res = await snoozeTaskInstance("h1", "ti-1", "2026-10-29")
    expect(res.success).toBe(true)
    const prior = res.success ? res.prior : undefined
    expect(prior).toEqual({ status: "snoozed", snoozedUntil: "2026-10-20" })
    expect(batchSet.mock.calls[0][1]).toMatchObject({ status: "snoozed", snoozedUntil: "2026-10-29" })

    batchSet.mockReset()
    await unsnoozeTaskInstance("h1", "ti-1", prior)
    expect(batchSet.mock.calls[0][1]).toMatchObject({ status: "snoozed", snoozedUntil: "2026-10-20" })
  })

  it("a first snooze answers with 'scheduled', and Undo restores that", async () => {
    getDoc.mockResolvedValue(snap("ti-1", { status: "scheduled", snoozedUntil: null, dueDate: "2026-10-10" }))
    const res = await snoozeTaskInstance("h1", "ti-1", "2026-10-29")
    const prior = res.success ? res.prior : undefined
    expect(prior).toEqual({ status: "scheduled", snoozedUntil: null })
    batchSet.mockReset()
    await unsnoozeTaskInstance("h1", "ti-1", prior)
    expect(batchSet.mock.calls[0][1]).toMatchObject({ status: "scheduled", snoozedUntil: null })
  })
})
