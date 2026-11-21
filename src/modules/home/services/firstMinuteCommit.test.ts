/**
 * The first minute's save (design/account-after-list.md): one home, never two;
 * an existing home is never written over; every step safe to run again.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const svc = vi.hoisted(() => ({
  getPrimaryHome: vi.fn(),
  createHome: vi.fn(),
  upsert: vi.fn(),
  addLibraryTask: vi.fn(),
}))
vi.mock("./homeService", () => ({
  getPrimaryHome: (...a: unknown[]) => svc.getPrimaryHome(...a),
  createHome: (...a: unknown[]) => svc.createHome(...a),
}))
vi.mock("./homeProfileService", () => ({ upsertHomeProfile: (...a: unknown[]) => svc.upsert(...a) }))
vi.mock("@/modules/care/services/careSuggestionService", () => ({ addLibraryTask: (...a: unknown[]) => svc.addLibraryTask(...a) }))
vi.mock("@/lib/analytics", () => ({ track: vi.fn() }))

const { commitFirstMinute, addToExistingHome, FIRST_HOME_NAME } = await import("./firstMinuteCommit")

const tasks = [{ key: "home.alarm_test", due: "2026-11-21" }, { key: "home.air_filter", due: "2026-11-22" }]
const base = { userId: "u1", patch: { zip: "94110", home_type: "condo" as const }, tasks, createdHomeId: null, addedKeys: [] }

beforeEach(() => {
  vi.clearAllMocks()
  svc.getPrimaryHome.mockResolvedValue({ data: null, error: null })
  svc.createHome.mockResolvedValue({ data: { homeId: "new1" }, error: null })
  svc.upsert.mockResolvedValue({ data: {}, error: null })
  svc.addLibraryTask.mockResolvedValue({ data: { task_template_id: "t" }, error: null })
})

describe("commitFirstMinute", () => {
  it("creates the home, writes the profile, then adds each task with its due date", async () => {
    const r = await commitFirstMinute(base)
    expect(r).toEqual({ kind: "saved", homeId: "new1", addedKeys: ["home.alarm_test", "home.air_filter"] })
    expect(svc.createHome).toHaveBeenCalledWith({ name: FIRST_HOME_NAME, userId: "u1" })
    expect(svc.upsert).toHaveBeenCalledWith("new1", base.patch)
    expect(svc.addLibraryTask.mock.calls.map((c) => [c[0], c[2].key, c[3].firstDue])).toEqual([
      ["new1", "home.alarm_test", "2026-11-21"], ["new1", "home.air_filter", "2026-11-22"],
    ])
  })

  it("a failed membership lookup creates nothing", async () => {
    svc.getPrimaryHome.mockResolvedValue({ data: null, error: { message: "unavailable" } })
    const r = await commitFirstMinute(base)
    expect(r).toMatchObject({ kind: "failed", message: "We couldn't check your account just now. Try again in a moment." })
    expect(svc.createHome).not.toHaveBeenCalled()
    expect(svc.upsert).not.toHaveBeenCalled()
  })

  it("an account that already has a home: nothing is written, the caller asks", async () => {
    svc.getPrimaryHome.mockResolvedValue({ data: { home_id: "h9", name: "SF Condo" }, error: null })
    const r = await commitFirstMinute(base)
    expect(r).toEqual({ kind: "existing", homeId: "h9", homeName: "SF Condo" })
    expect(svc.createHome).not.toHaveBeenCalled()
    expect(svc.upsert).not.toHaveBeenCalled()
    expect(svc.addLibraryTask).not.toHaveBeenCalled()
  })

  it("a refused create says nothing was saved", async () => {
    svc.createHome.mockResolvedValue({ data: null, error: { message: "Missing or insufficient permissions." } })
    const r = await commitFirstMinute(base)
    expect(r).toEqual({ kind: "failed", message: "Couldn't create your home. Nothing was saved. Try again.", createdHomeId: null, addedKeys: [] })
    expect(svc.upsert).not.toHaveBeenCalled()
  })

  it("a failed profile write keeps the new home's id so Try again reuses it", async () => {
    svc.upsert.mockResolvedValueOnce({ data: null, error: { message: "unavailable" } })
    const first = await commitFirstMinute(base)
    expect(first).toMatchObject({ kind: "failed", createdHomeId: "new1" })
    expect(svc.addLibraryTask).not.toHaveBeenCalled()

    // Try again: the lookup now finds the home this flow made — not "existing".
    svc.getPrimaryHome.mockResolvedValue({ data: { home_id: "new1", name: "My home" }, error: null })
    const second = await commitFirstMinute({ ...base, createdHomeId: "new1" })
    expect(second).toMatchObject({ kind: "saved", homeId: "new1" })
    expect(svc.createHome).toHaveBeenCalledTimes(1)
  })

  it("a partial task failure names it, and Try again adds only the rest", async () => {
    svc.addLibraryTask
      .mockResolvedValueOnce({ data: { task_template_id: "t1" }, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "unavailable" } })
    const first = await commitFirstMinute(base)
    expect(first).toEqual({
      kind: "failed", createdHomeId: "new1", addedKeys: ["home.alarm_test"],
      message: "Couldn’t add “Replace the air filter”. The others were added. Try again for the rest.",
    })
    svc.addLibraryTask.mockClear()
    svc.getPrimaryHome.mockResolvedValue({ data: { home_id: "new1", name: "My home" }, error: null })
    const second = await commitFirstMinute({ ...base, createdHomeId: "new1", addedKeys: ["home.alarm_test"] })
    expect(second).toMatchObject({ kind: "saved" })
    expect(svc.addLibraryTask.mock.calls.map((c) => c[2].key)).toEqual(["home.air_filter"])
  })

  it("every task failing says so plainly", async () => {
    svc.addLibraryTask.mockResolvedValue({ data: null, error: { message: "unavailable" } })
    const r = await commitFirstMinute(base)
    expect(r).toMatchObject({ kind: "failed", message: "Couldn’t add your tasks. Check your connection and try again." })
  })
})

describe("addToExistingHome", () => {
  it("adds the tasks and leaves the home's own profile alone", async () => {
    const r = await addToExistingHome("h9", tasks, [])
    expect(r).toMatchObject({ kind: "saved", homeId: "h9" })
    expect(svc.upsert).not.toHaveBeenCalled()
    expect(svc.createHome).not.toHaveBeenCalled()
    expect(svc.addLibraryTask.mock.calls.map((c) => c[0])).toEqual(["h9", "h9"])
  })
})
