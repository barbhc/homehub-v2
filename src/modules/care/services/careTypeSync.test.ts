/**
 * Codex review D10 — moving a task between cleaning and maintenance must
 * reach the occurrences already scheduled.
 *
 * `careType` is copied onto every taskInstance and the agenda filters on THAT
 * copy (denormSync.ts). updateTaskCareType wrote only the template, so a task
 * re-filed as cleaning stayed on Home and Tasks as maintenance — and one
 * re-filed as maintenance stayed hidden — until its next occurrence.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("firebase/firestore", async () => (await import("@/test/fakeFirestore")).fakeFirestoreModule)
vi.mock("@/integrations/firebase", () => ({ db: {}, auth: { currentUser: { uid: "u1" } }, callable: vi.fn(() => vi.fn()) }))
vi.mock("@/lib/analytics", () => ({ track: vi.fn() }))

const { fakeDb } = await import("@/test/fakeFirestore")
const { updateTaskCareType } = await import("./taskService")

const HOME = "h1"
const inst = (id: string) => `homes/${HOME}/taskInstances/${id}`
const occurrence = (over: Record<string, unknown>) => ({
  taskTemplateId: "tpl-1", title: "Wipe the door gasket", careType: "maintenance", status: "scheduled", deletedAt: null, ...over,
})

beforeEach(() =>
  fakeDb.load({
    [`homes/${HOME}/taskTemplates/tpl-1`]: { title: "Wipe the door gasket", careType: "maintenance", deletedAt: null },
    [inst("open")]: occurrence({}),
    [inst("snoozed")]: occurrence({ status: "snoozed", snoozedUntil: "2026-12-01" }),
    [inst("done")]: occurrence({ status: "done" }),
    [inst("removed")]: occurrence({ deletedAt: "2026-11-01" }),
    [inst("other-task")]: occurrence({ taskTemplateId: "tpl-2" }),
  }),
)

describe("updateTaskCareType", () => {
  it("re-files the template AND its open occurrences, in one write", async () => {
    const res = await updateTaskCareType(HOME, "tpl-1", "cleaning")
    expect(res).toEqual({ data: true, error: null })

    expect(fakeDb.store.get(`homes/${HOME}/taskTemplates/tpl-1`)).toMatchObject({ careType: "cleaning" })
    expect(fakeDb.store.get(inst("open"))).toMatchObject({ careType: "cleaning", status: "scheduled" })
    expect(fakeDb.store.get(inst("snoozed"))).toMatchObject({ careType: "cleaning", status: "snoozed", snoozedUntil: "2026-12-01" })
  })

  it("leaves history and other tasks as they were", async () => {
    await updateTaskCareType(HOME, "tpl-1", "cleaning")
    // Done occurrences keep the classification they were completed under.
    expect(fakeDb.store.get(inst("done"))).toMatchObject({ careType: "maintenance" })
    expect(fakeDb.store.get(inst("removed"))).toMatchObject({ careType: "maintenance" })
    expect(fakeDb.store.get(inst("other-task"))).toMatchObject({ careType: "maintenance" })
  })
})
