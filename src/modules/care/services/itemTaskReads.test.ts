/**
 * The item page's task reads — the rows CareBlock asks getTaskInstances for,
 * and the Activity timeline's completion + tier-change history — pinned
 * against the home with history in src/lib/dashboardReads.fixture.ts plus a
 * tier-change log.
 *
 * Audit 2026-09-29 (B, Part 1): the item page read the ENTIRE taskInstances
 * collection (four times — two calls, two trees) to find one item's rows,
 * every done instance in the home for one item's history, and ran one getDoc
 * per tier-log entry. The snapshots were written by that implementation, so
 * the narrowed reads must reproduce them exactly; `reads` records the cost.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("firebase/firestore", async () => (await import("@/test/fakeFirestore")).fakeFirestoreModule)
vi.mock("@/integrations/firebase", () => ({ db: {}, auth: { currentUser: null }, callable: vi.fn(() => vi.fn()) }))

const { fakeDb, Timestamp } = await import("@/test/fakeFirestore")
const { getTaskInstances, getCompletionHistory, getTierChangeHistory } = await import("./taskService")
const { HOME_ID, FIXTURE_NOW, homeWithHistory } = await import("@/lib/dashboardReads.fixture")

const at = (iso: string) => Timestamp.fromDate(new Date(iso))
const log = (id: string, taskTemplateId: string | null, oldTier: string, newTier: string, createdAtIso: string) => [
  `homes/${HOME_ID}/tierChangeLog/${id}`,
  { taskTemplateId, changedBy: "u1", oldTier, newTier, source: "manual", createdAt: at(createdAtIso) },
] as const

/** The fixture home plus a tier-change log across three items, a missing template and a row with no template. */
function homeWithTierLog() {
  return {
    ...homeWithHistory(),
    ...Object.fromEntries([
      log("log-01", "tpl-filter", "recommended", "essential", "2026-03-02T10:00:00Z"),
      log("log-02", "tpl-hvac-service", "recommended", "essential", "2026-03-05T10:00:00Z"),
      log("log-03", "tpl-coils", "optional", "recommended", "2026-03-06T10:00:00Z"),
      log("log-04", "tpl-filter", "essential", "recommended", "2026-04-01T10:00:00Z"),
      log("log-05", "tpl-gone", "optional", "essential", "2026-04-02T10:00:00Z"),
      log("log-06", null, "optional", "essential", "2026-04-03T10:00:00Z"),
      log("log-07", "tpl-filter", "recommended", "essential", "2026-05-01T10:00:00Z"),
      // Two changes in the same instant — the order between them must hold too.
      log("log-08b", "tpl-hvac-service", "essential", "recommended", "2026-05-02T10:00:00Z"),
      log("log-08a", "tpl-filter", "essential", "optional", "2026-05-02T10:00:00Z"),
      log("log-09", "tpl-dryer-vent", "recommended", "essential", "2026-05-03T10:00:00Z"),
    ]),
  }
}

const reads = () => ({ queries: fakeDb.reads.queries, gets: fakeDb.reads.gets, docsRead: fakeDb.reads.docsRead })

// The snapshots hold local-calendar dates: pin the zone they were written in.
beforeAll(() => {
  vi.stubEnv("TZ", "America/Los_Angeles")
})
afterAll(() => {
  vi.unstubAllEnvs()
})
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: FIXTURE_NOW })
  fakeDb.load(homeWithTierLog())
})
afterEach(() => {
  vi.useRealTimers()
})

describe("CareBlock's two calls — one item's open and done rows", () => {
  it("open rows", async () => {
    expect(await getTaskInstances(HOME_ID, { item_unit_id: "item-fridge", status: ["scheduled", "snoozed"] })).toMatchSnapshot()
    expect(reads(), fakeDb.reads.log.join("\n")).toEqual({ queries: 1, gets: 0, docsRead: 33 })
  })

  it("done rows", async () => {
    expect(await getTaskInstances(HOME_ID, { item_unit_id: "item-fridge", status: ["done"] })).toMatchSnapshot()
    expect(reads(), fakeDb.reads.log.join("\n")).toEqual({ queries: 1, gets: 0, docsRead: 33 })
  })

  it("an item with nothing on it", async () => {
    expect(await getTaskInstances(HOME_ID, { item_unit_id: "item-none", status: ["scheduled", "snoozed"] })).toEqual({ data: [], error: null })
  })
})

describe("the whole-home callers keep their answers", () => {
  it("every open row (Schedule / Care pages)", async () => {
    expect(await getTaskInstances(HOME_ID, { status: ["scheduled", "snoozed"] })).toMatchSnapshot()
  })

  it("scheduled only (Cleaning page)", async () => {
    expect(await getTaskInstances(HOME_ID, { status: ["scheduled"] })).toMatchSnapshot()
  })

  it("no filters", async () => {
    expect(await getTaskInstances(HOME_ID)).toMatchSnapshot()
  })

  it("Care page filters, item included", async () => {
    expect(
      await getTaskInstances(HOME_ID, { status: ["scheduled", "snoozed"], care_type: "cleaning", priority_tier: "optional", item_unit_id: "item-dishwasher" }),
    ).toMatchSnapshot()
  })
})

describe("the Activity timeline", () => {
  it("completion history for one item", async () => {
    expect(await getCompletionHistory(HOME_ID, "item-fridge", 20)).toMatchSnapshot()
    expect(reads(), fakeDb.reads.log.join("\n")).toEqual({ queries: 1, gets: 0, docsRead: 14 })
  })

  it("completion history honours the limit", async () => {
    expect((await getCompletionHistory(HOME_ID, "item-fridge", 1)).data?.map((e) => e.instanceId)).toEqual(["d-coils-jun1"])
  })

  it("tier changes for one item, newest first", async () => {
    expect(await getTierChangeHistory(HOME_ID, "item-furnace", 20)).toMatchSnapshot()
    expect(reads(), fakeDb.reads.log.join("\n")).toEqual({ queries: 1, gets: 9, docsRead: 19 })
  })

  it("tier changes honour the limit", async () => {
    // Same instant → document-id order, as the whole-collection read returned them.
    expect((await getTierChangeHistory(HOME_ID, "item-furnace", 2)).data?.map((e) => e.id)).toEqual(["log-08a", "log-08b"])
  })

  it("an item with no tier changes", async () => {
    expect(await getTierChangeHistory(HOME_ID, "item-washer", 20)).toEqual({ data: [], error: null })
  })
})
