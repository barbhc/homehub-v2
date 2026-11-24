/**
 * Codex review D4 — Snooze and its Undo must not undo someone else's Done.
 *
 * Both used to read the occurrence and then write it blind: a completion from
 * another device that landed in between was overwritten with "snoozed" (or,
 * from Undo, "scheduled"), reopening a task that had been done. Each now
 * decides inside one transaction, and only an occurrence that is still open is
 * written. The tests land the other device's completion in exactly that gap.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("firebase/firestore", async () => (await import("@/test/fakeFirestore")).fakeFirestoreModule)
vi.mock("@/integrations/firebase", () => ({ db: {}, auth: { currentUser: { uid: "u1" } }, callable: vi.fn(() => vi.fn()) }))
vi.mock("@/lib/analytics", () => ({ track: vi.fn() }))

const { fakeDb, Timestamp } = await import("@/test/fakeFirestore")
const { snoozeTaskInstance, unsnoozeTaskInstance } = await import("./taskService")

const HOME = "h1"
const PATH = `homes/${HOME}/taskInstances/ti-1`
const open = (over: Record<string, unknown> = {}) => ({
  taskTemplateId: "tpl-1", title: "Replace the furnace filter", status: "scheduled", dueDate: "2026-11-20",
  snoozedUntil: null, completedAt: null, deletedAt: null, ...over,
})
const stored = () => fakeDb.store.get(PATH)!

/** Another device completes the task right after this device's first read of it. */
function completeAfterFirstRead() {
  let landed = false
  fakeDb.afterRead = (what) => {
    if (landed || what !== `get ${PATH}`) return
    landed = true
    fakeDb.write(PATH, { status: "done", completedAt: Timestamp.fromDate(new Date("2026-11-22T20:00:00Z")), snoozedUntil: null }, { merge: true })
  }
}

beforeEach(() => fakeDb.load({ [PATH]: open() }))

describe("snoozeTaskInstance", () => {
  it("snoozes an open task and answers with what it replaced", async () => {
    const res = await snoozeTaskInstance(HOME, "ti-1", "2026-12-06")
    expect(res).toMatchObject({ success: true, prior: { status: "scheduled", snoozedUntil: null } })
    expect(stored()).toMatchObject({ status: "snoozed", snoozedUntil: "2026-12-06" })
  })

  it("a completion that lands between the read and the write is kept — the task is not snoozed", async () => {
    completeAfterFirstRead()
    const res = await snoozeTaskInstance(HOME, "ti-1", "2026-12-06")

    expect(stored().status).toBe("done")
    expect(stored().snoozedUntil).toBeNull()
    expect(res).toEqual({ success: false, error: "That task was already done.", reason: "already_done" })
    // It re-ran against the completed task rather than writing over it.
    expect(fakeDb.transactionAttempts).toBe(2)
  })

  it("a task that was already done is refused, and nothing is written", async () => {
    fakeDb.load({ [PATH]: open({ status: "done" }) })
    const res = await snoozeTaskInstance(HOME, "ti-1", "2026-12-06")
    expect(res).toMatchObject({ success: false, reason: "already_done" })
    expect(fakeDb.writes).toEqual([])
  })

  it("a task that was removed is refused, and nothing is written", async () => {
    fakeDb.load({ [PATH]: open({ deletedAt: Timestamp.now() }) })
    const res = await snoozeTaskInstance(HOME, "ti-1", "2026-12-06")
    expect(res).toEqual({ success: false, error: "That task no longer exists.", reason: "gone" })
    expect(fakeDb.writes).toEqual([])
  })

  it("a failed read is a failure with no reason — the caller says 'couldn't snooze'", async () => {
    fakeDb.failWith = new Error("unavailable")
    const res = await snoozeTaskInstance(HOME, "ti-1", "2026-12-06")
    expect(res).toEqual({ success: false, error: "unavailable" })
    expect(stored().status).toBe("scheduled")
  })
})

describe("unsnoozeTaskInstance (Undo)", () => {
  beforeEach(() => fakeDb.load({ [PATH]: open({ status: "snoozed", snoozedUntil: "2026-12-06" }) }))

  it("puts a snoozed task back", async () => {
    const res = await unsnoozeTaskInstance(HOME, "ti-1", null)
    expect(res.success).toBe(true)
    expect(stored()).toMatchObject({ status: "scheduled", snoozedUntil: null })
  })

  it("a completion that lands between the read and the write is kept — Undo does not reopen it", async () => {
    completeAfterFirstRead()
    const res = await unsnoozeTaskInstance(HOME, "ti-1", null)

    expect(stored().status).toBe("done")
    expect(res).toEqual({ success: false, error: "That task was already done.", reason: "already_done" })
  })

  it("a task someone already brought back is left exactly as it is", async () => {
    fakeDb.load({ [PATH]: open({ status: "scheduled", dueDate: "2026-12-20" }) })
    const res = await unsnoozeTaskInstance(HOME, "ti-1", { status: "snoozed", snoozedUntil: "2026-11-30" })
    expect(res.success).toBe(true)
    expect(fakeDb.writes).toEqual([])
    expect(stored()).toMatchObject({ status: "scheduled", dueDate: "2026-12-20", snoozedUntil: null })
  })
})
