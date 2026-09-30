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
const { getTaskInstances, getTaskInstancesForItem, getCompletionHistory, getTierChangeHistory } = await import("./taskService")
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
    // Was 33: the whole home's instances, to keep this item's three.
    expect(reads(), fakeDb.reads.log.join("\n")).toEqual({ queries: 1, gets: 0, docsRead: 3 })
    expect(fakeDb.reads.log).toEqual([
      'query homes/h1/taskInstances [itemUnitId == "item-fridge", status in ["scheduled","snoozed"]] → 3',
    ])
  })

  it("done rows", async () => {
    expect(await getTaskInstances(HOME_ID, { item_unit_id: "item-fridge", status: ["done"] })).toMatchSnapshot()
    expect(reads(), fakeDb.reads.log.join("\n")).toEqual({ queries: 1, gets: 0, docsRead: 4 })
  })

  it("getTaskInstancesForItem is the same read, by name", async () => {
    const open = await getTaskInstances(HOME_ID, { item_unit_id: "item-fridge", status: ["scheduled", "snoozed"] })
    const done = await getTaskInstances(HOME_ID, { item_unit_id: "item-fridge", status: ["done"] })
    const all = await getTaskInstances(HOME_ID, { item_unit_id: "item-fridge" })
    fakeDb.resetCounters()
    expect(await getTaskInstancesForItem(HOME_ID, "item-fridge", { status: ["scheduled", "snoozed"] })).toEqual(open)
    expect(await getTaskInstancesForItem(HOME_ID, "item-fridge", { status: ["done"] })).toEqual(done)
    expect(await getTaskInstancesForItem(HOME_ID, "item-fridge")).toEqual(all)
    expect(fakeDb.reads.log).toEqual([
      'query homes/h1/taskInstances [itemUnitId == "item-fridge", status in ["scheduled","snoozed"]] → 3',
      'query homes/h1/taskInstances [itemUnitId == "item-fridge", status in ["done"]] → 4',
      'query homes/h1/taskInstances [itemUnitId == "item-fridge"] → 8',
    ])
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
    // Was 14: every done row in the home.
    expect(reads(), fakeDb.reads.log.join("\n")).toEqual({ queries: 1, gets: 0, docsRead: 4 })
  })

  it("completion history honours the limit", async () => {
    expect((await getCompletionHistory(HOME_ID, "item-fridge", 1)).data?.map((e) => e.instanceId)).toEqual(["d-coils-jun1"])
  })

  it("tier changes for one item, newest first", async () => {
    expect(await getTierChangeHistory(HOME_ID, "item-furnace", 20)).toMatchSnapshot()
    // Was 1 query + 9 gets = 19: every log entry, then one getDoc per entry.
    expect(reads(), fakeDb.reads.log.join("\n")).toEqual({ queries: 2, gets: 0, docsRead: 8 })
    expect(fakeDb.reads.log).toEqual([
      'query homes/h1/taskTemplates [itemUnitId == "item-furnace"] → 2',
      'query homes/h1/tierChangeLog [taskTemplateId in ["tpl-filter","tpl-hvac-service"]] → 6',
    ])
  })

  it("tier changes for an item with more than 30 templates: 30 ids per query, one list", async () => {
    const extra: Record<string, Record<string, unknown>> = {}
    for (let i = 0; i < 35; i++) {
      const tpl = `tpl-many-${String(i).padStart(2, "0")}`
      extra[`homes/${HOME_ID}/taskTemplates/${tpl}`] = { itemUnitId: "item-many", title: `Task ${i}`, deletedAt: null }
      if (i % 2 === 0) {
        extra[`homes/${HOME_ID}/tierChangeLog/many-${String(i).padStart(2, "0")}`] = {
          taskTemplateId: tpl, oldTier: "optional", newTier: "recommended", source: "manual",
          createdAt: at(`2026-06-${String(1 + (i % 20)).padStart(2, "0")}T10:00:00Z`),
        }
      }
    }
    fakeDb.load({ ...homeWithTierLog(), ...extra })

    const res = await getTierChangeHistory(HOME_ID, "item-many", 50)
    expect(fakeDb.reads.log.map((l) => l.replace(/\[.*\]/, "[…]"))).toEqual([
      "query homes/h1/taskTemplates […] → 35",
      "query homes/h1/tierChangeLog […] → 15", // tpl-many-00 … -29
      "query homes/h1/tierChangeLog […] → 3", // tpl-many-30 … -34
    ])
    expect(res.data).toHaveLength(18)
    const when = res.data!.map((e) => e.changedAt)
    expect(when).toEqual([...when].sort().reverse())
    expect(res.data![0]).toMatchObject({ id: "many-18", taskTemplateId: "tpl-many-18", taskTitle: "Task 18" })
    expect((await getTierChangeHistory(HOME_ID, "item-many", 5)).data).toHaveLength(5)
  })

  it("tier changes honour the limit", async () => {
    // Same instant → document-id order, as the whole-collection read returned them.
    expect((await getTierChangeHistory(HOME_ID, "item-furnace", 2)).data?.map((e) => e.id)).toEqual(["log-08a", "log-08b"])
  })

  it("an item with no tier changes", async () => {
    expect(await getTierChangeHistory(HOME_ID, "item-washer", 20)).toEqual({ data: [], error: null })
  })
})
