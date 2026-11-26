/**
 * The first minute's save (design/account-after-list.md): one home, never two;
 * an existing home is never written over; every step safe to run again.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const svc = vi.hoisted(() => ({
  getPrimaryHome: vi.fn(),
  createHome: vi.fn(),
  upsert: vi.fn(),
  getProfile: vi.fn(),
  addLibraryTask: vi.fn(),
}))
vi.mock("./homeService", () => ({
  getPrimaryHome: (...a: unknown[]) => svc.getPrimaryHome(...a),
  createHome: (...a: unknown[]) => svc.createHome(...a),
}))
vi.mock("./homeProfileService", () => ({
  upsertHomeProfile: (...a: unknown[]) => svc.upsert(...a),
  getHomeProfile: (...a: unknown[]) => svc.getProfile(...a),
}))
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
  svc.getProfile.mockResolvedValue({ data: { zip: "94110", home_type: "condo", climate: "mild", completed_at: "2026-10-01T00:00:00Z" }, error: null })
  svc.addLibraryTask.mockResolvedValue({ data: { task_template_id: "t" }, error: null })
})

describe("commitFirstMinute", () => {
  it("creates the home, writes the profile, then adds each task with its due date", async () => {
    const r = await commitFirstMinute(base)
    expect(r).toEqual({ kind: "saved", homeId: "new1", addedKeys: ["home.alarm_test", "home.air_filter"] })
    expect(svc.createHome).toHaveBeenCalledWith({ name: FIRST_HOME_NAME, userId: "u1" })
    // A condo also answers own-or-rent (seventeen fixes).
    expect(svc.upsert).toHaveBeenCalledWith("new1", { ...base.patch, ownership: "own" })
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

describe("a home of theirs that was never set up", () => {
  // A save that died after createHome committed — before its id came back, or
  // the tab closed before the profile write — must not turn into "you already
  // have a home" with the zip and home type thrown away.
  it("gets this setup instead of the existing-home question", async () => {
    svc.getPrimaryHome.mockResolvedValue({ data: { home_id: "h5", name: "My home", created_by: "u1" }, error: null })
    svc.getProfile.mockResolvedValue({ data: { zip: null, home_type: null, climate: null, completed_at: null }, error: null })
    const r = await commitFirstMinute(base)
    expect(r).toMatchObject({ kind: "saved", homeId: "h5" })
    expect(svc.createHome).not.toHaveBeenCalled()
    expect(svc.upsert).toHaveBeenCalledWith("h5", { ...base.patch, ownership: "own" })
  })

  it("a set-up home, or one someone else created, is still asked about", async () => {
    svc.getPrimaryHome.mockResolvedValue({ data: { home_id: "h5", name: "My home", created_by: "u1" }, error: null })
    expect(await commitFirstMinute(base)).toMatchObject({ kind: "existing", homeId: "h5" })
    svc.getPrimaryHome.mockResolvedValue({ data: { home_id: "h6", name: "Shared", created_by: "partner" }, error: null })
    expect(await commitFirstMinute(base)).toMatchObject({ kind: "existing", homeId: "h6" })
    expect(svc.upsert).not.toHaveBeenCalled()
  })

  it("can't read the profile: stop, write nothing", async () => {
    svc.getPrimaryHome.mockResolvedValue({ data: { home_id: "h5", name: "My home", created_by: "u1" }, error: null })
    svc.getProfile.mockResolvedValue({ data: null, error: { message: "unavailable" } })
    expect(await commitFirstMinute(base)).toMatchObject({ kind: "failed" })
    expect(svc.upsert).not.toHaveBeenCalled()
    expect(svc.createHome).not.toHaveBeenCalled()
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

describe("commitFirstMinute — the home type answers own-or-rent", () => {
  it("Apartment saves rent, Condo saves own, on a new home", async () => {
    await commitFirstMinute({ ...base, patch: { zip: "60614", home_type: "apartment" } })
    expect(svc.upsert).toHaveBeenLastCalledWith("new1", { zip: "60614", home_type: "apartment", ownership: "rent" })
    await commitFirstMinute({ ...base, patch: { zip: "94110", home_type: "condo" } })
    expect(svc.upsert).toHaveBeenLastCalledWith("new1", { zip: "94110", home_type: "condo", ownership: "own" })
  })
  it("a house or townhouse says nothing about it", async () => {
    await commitFirstMinute({ ...base, patch: { zip: "94110", home_type: "house" } })
    expect(svc.upsert.mock.calls.at(-1)![1]).not.toHaveProperty("ownership")
  })
  it("never overwrites an own-or-rent already stored on a home being finished", async () => {
    svc.getPrimaryHome.mockResolvedValue({ data: { home_id: "h1", name: "My home", created_by: "u1" }, error: null })
    svc.getProfile.mockResolvedValue({ data: { zip: null, home_type: null, climate: null, completed_at: null, ownership: "own" }, error: null })
    await commitFirstMinute({ ...base, patch: { zip: "60614", home_type: "apartment" } })
    expect(svc.upsert).toHaveBeenCalledWith("h1", { zip: "60614", home_type: "apartment" })
  })
  it("sets it on a home being finished that has none", async () => {
    svc.getPrimaryHome.mockResolvedValue({ data: { home_id: "h1", name: "My home", created_by: "u1" }, error: null })
    svc.getProfile.mockResolvedValue({ data: { zip: null, home_type: null, climate: null, completed_at: null, ownership: null }, error: null })
    await commitFirstMinute({ ...base, patch: { zip: "60614", home_type: "apartment" } })
    expect(svc.upsert).toHaveBeenCalledWith("h1", { zip: "60614", home_type: "apartment", ownership: "rent" })
  })
})
