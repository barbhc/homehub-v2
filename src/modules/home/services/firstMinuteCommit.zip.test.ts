/**
 * The existing-home mode of the first minute's save (seventeen fixes, mock m5):
 * Home's "Add your zip" writes THIS home's profile and the picked tasks — never
 * a new home — and its read of what the home already has refuses an offline
 * cache-miss that came back empty (memory: the fromCache trap).
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { HomeProfile } from "./homeProfileService"

const svc = vi.hoisted(() => ({
  getPrimaryHome: vi.fn(),
  createHome: vi.fn(),
  upsert: vi.fn(),
  getProfile: vi.fn(),
  addLibraryTask: vi.fn(),
  getDocs: vi.fn(),
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
vi.mock("@/integrations/firebase", () => ({ db: {} }))
vi.mock("firebase/firestore", () => ({
  collection: (_db: unknown, path: string) => ({ path }),
  getDocs: (...a: unknown[]) => svc.getDocs(...a),
}))

const { readHomeForZip, saveZipToHome } = await import("./firstMinuteCommit")

const current = (over: Partial<HomeProfile> = {}) => ({
  home_id: "h1", home_type: "house", completed_at: null, zip: null, care_facts: {}, dismissed_care: [], ...over,
}) as HomeProfile
const snap = (docs: Record<string, unknown>[], fromCache = false) => ({
  empty: docs.length === 0,
  metadata: { fromCache },
  docs: docs.map((d) => ({ data: () => d })),
})

beforeEach(() => {
  vi.clearAllMocks()
  svc.upsert.mockResolvedValue({ data: {}, error: null })
  svc.addLibraryTask.mockResolvedValue({ data: { task_template_id: "t" }, error: null })
  svc.getProfile.mockResolvedValue({ data: current(), error: null })
})

describe("saveZipToHome", () => {
  const patch = { zip: "94110", climate: "mild" as const, climate_source: "zip" as const, home_type: "condo" as const, completed_at: "2026-11-25T00:00:00Z" }
  const tasks = [{ key: "home.quake_straps", due: "2026-11-28" }]

  it("writes the zip onto this home and adds the picked tasks; never creates a home", async () => {
    const r = await saveZipToHome("h1", current({ home_type: null }), patch, tasks, [])
    expect(r).toEqual({ kind: "saved", homeId: "h1", addedKeys: ["home.quake_straps"] })
    // The condo also answers own-or-rent (seventeen fixes, PR 2).
    expect(svc.upsert).toHaveBeenCalledWith("h1", { ...patch, ownership: "own" })
    expect(svc.addLibraryTask.mock.calls.map((c) => [c[0], c[1], c[2].key, c[3].firstDue])).toEqual([["h1", null, "home.quake_straps", "2026-11-28"]])
    expect(svc.createHome).not.toHaveBeenCalled()
    expect(svc.getPrimaryHome).not.toHaveBeenCalled()
  })

  it("leaves what the home already answered: its type and when its profile was completed", async () => {
    await saveZipToHome("h1", current({ home_type: "house", completed_at: "2026-10-01T00:00:00Z" }), patch, [], [])
    const written = svc.upsert.mock.calls[0][1]
    expect(written).toMatchObject({ zip: "94110" })
    expect(written).not.toHaveProperty("home_type")
    expect(written).not.toHaveProperty("completed_at")
    expect(written).not.toHaveProperty("ownership")
  })

  it("an apartment set here saves rent, but never over an own-or-rent already stored", async () => {
    const apt = { ...patch, home_type: "apartment" as const }
    await saveZipToHome("h1", current({ home_type: null }), apt, [], [])
    expect(svc.upsert.mock.calls[0][1]).toMatchObject({ home_type: "apartment", ownership: "rent" })
    await saveZipToHome("h1", current({ home_type: null, ownership: "own" }), apt, [], [])
    expect(svc.upsert.mock.calls[1][1]).not.toHaveProperty("ownership")
  })

  it("a failed profile write adds nothing and says so", async () => {
    svc.upsert.mockResolvedValue({ data: null, error: { message: "offline" } })
    const r = await saveZipToHome("h1", current(), patch, tasks, [])
    expect(r).toMatchObject({ kind: "failed", message: "Couldn't save your zip. Check your connection and try again." })
    expect(svc.addLibraryTask).not.toHaveBeenCalled()
  })

  it("a failed task is said, and a retry skips what already landed", async () => {
    const two = [...tasks, { key: "home.alarm_test", due: "2026-11-29" }]
    svc.addLibraryTask.mockImplementation(async (_h: string, _i: null, e: { key: string }) =>
      e.key === "home.alarm_test" ? { data: null, error: { message: "offline" } } : { data: {}, error: null })
    const r = await saveZipToHome("h1", current(), patch, two, [])
    expect(r).toMatchObject({ kind: "failed", addedKeys: ["home.quake_straps"] })
    svc.addLibraryTask.mockClear()
    svc.addLibraryTask.mockResolvedValue({ data: {}, error: null })
    const again = await saveZipToHome("h1", current(), patch, two, ["home.quake_straps"])
    expect(again).toMatchObject({ kind: "saved" })
    expect(svc.addLibraryTask.mock.calls.map((c) => c[2].key)).toEqual(["home.alarm_test"])
  })
})

describe("readHomeForZip", () => {
  it("returns the profile and the home's live tasks", async () => {
    svc.getDocs.mockResolvedValue(snap([
      { title: "Test the smoke alarms", schedule: { scheduleType: "semiannual" } },
      { title: "Gone", deletedAt: new Date() },
      { title: "Off", isActive: false },
    ]))
    const r = await readHomeForZip("h1")
    expect(r.error).toBeNull()
    expect(r.data?.existing).toEqual([{ title: "Test the smoke alarms", scheduleType: "semiannual" }])
  })

  it("an EMPTY task list served from the offline cache is a failure, not 'no tasks'", async () => {
    svc.getDocs.mockResolvedValue(snap([], true))
    const r = await readHomeForZip("h1")
    expect(r.data).toBeNull()
    expect(r.error).toMatch(/Couldn't reach the server/)
  })

  it("a failed profile read is a failure", async () => {
    svc.getProfile.mockResolvedValue({ data: null, error: { message: "offline" } })
    const r = await readHomeForZip("h1")
    expect(r).toEqual({ data: null, error: "offline" })
  })
})
