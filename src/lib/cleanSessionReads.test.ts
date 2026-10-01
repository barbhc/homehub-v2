/**
 * The cleaning reads Home shares with the Deep Clean page and Settings —
 * getCleaningTasks (the session list), getDeepCleanGuides (the guides grid)
 * and getRoutineTemplates (Settings' routines) — pinned against the home with
 * history in dashboardReads.fixture.ts.
 *
 * The snapshots were written by the implementation that read whole
 * collections (commit "test(clean): pin…"), so narrowing the reads must
 * reproduce them exactly — and `reads` records what each call costs.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("firebase/firestore", async () => (await import("@/test/fakeFirestore")).fakeFirestoreModule)
vi.mock("@/integrations/firebase", () => ({ db: {}, auth: { currentUser: null }, callable: vi.fn(() => vi.fn()) }))

const { fakeDb } = await import("@/test/fakeFirestore")
const { getCleaningTasks, getDeepCleanGuides, getRoutineTemplates, isOpenInstance } = await import("./cleanSession")
const { HOME_ID, FIXTURE_NOW, homeWithHistory } = await import("./dashboardReads.fixture")

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
})
afterEach(() => {
  vi.useRealTimers()
})

describe("no user routines", () => {
  beforeEach(() => fakeDb.load(homeWithHistory()))

  it("getCleaningTasks — cleaning", async () => {
    expect(await getCleaningTasks(HOME_ID, "cleaning")).toMatchSnapshot()
    // Was 4 queries + 8 gets = 84: every instance (done ones twice) and a
    // template probe for the as-needed and after-each-use cleaning templates.
    // The 3 gets are generateTaskInstances starting the instance "Wipe dryer
    // drum" lost (template, item, room) — 6 until a snoozed instance counted
    // as open, when "Wash fridge shelves" was given a second one.
    expect(reads(), fakeDb.reads.log.join("\n")).toEqual({ queries: 4, gets: 3, docsRead: 63 })
  })

  it("getCleaningTasks — maintenance", async () => {
    expect(await getCleaningTasks(HOME_ID, "maintenance")).toMatchSnapshot()
  })

  it("getDeepCleanGuides", async () => {
    expect(await getDeepCleanGuides(HOME_ID)).toMatchSnapshot()
    // Was 5 queries + 8 gets = 105: templates twice, every instance, every
    // completion and every item (a guide shows no room). Gets as above.
    expect(reads(), fakeDb.reads.log.join("\n")).toEqual({ queries: 3, gets: 3, docsRead: 51 })
  })

  it("getRoutineTemplates", async () => {
    expect(await getRoutineTemplates(HOME_ID)).toEqual([])
  })
})

describe("a snoozed instance is an open one — never a reason to make another", () => {
  // The fixture's "Wash fridge shelves" (tpl-fridge-shelves, quarterly) has ONE
  // open instance, and it is snoozed. completeTask on the server counts snoozed
  // as open; the cleaning fallback counted only `scheduled`, read the template
  // as having no instance, and generated a second, scheduled one — on every
  // Home load (the deep-clean guides fallback) and every Deep Clean visit.
  beforeEach(() => fakeDb.load(homeWithHistory()))

  const createdFor = () =>
    fakeDb.writes
      .filter((w) => w.path.startsWith(`homes/${HOME_ID}/taskInstances/`))
      .map((w) => w.data.taskTemplateId)

  it("creates no second instance for a template whose only open one is snoozed", async () => {
    await getCleaningTasks(HOME_ID, "cleaning")
    expect(createdFor()).not.toContain("tpl-fridge-shelves")
    // The one recurring template that really lost its instance still gets one.
    expect(createdFor()).toEqual(["tpl-lost-instance"])
  })

  it("the guides fallback (Home) agrees", async () => {
    await getDeepCleanGuides(HOME_ID)
    expect(createdFor()).toEqual(["tpl-lost-instance"])
  })

  it("so the next read lists the snoozed job once, not twice", async () => {
    // The user-visible half: the duplicate surfaced on the NEXT read.
    await getCleaningTasks(HOME_ID, "cleaning")
    const again = await getCleaningTasks(HOME_ID, "cleaning")
    expect(again.filter((t) => t.title === "Wash fridge shelves").map((t) => t.id)).toEqual(["i-fridge-shelves"])
    // …and a second pass creates nothing at all.
    expect(createdFor()).toEqual(["tpl-lost-instance"])
  })

  it("open means scheduled or snoozed, and not deleted — the server's rule", () => {
    expect(isOpenInstance({ status: "scheduled", deletedAt: null })).toBe(true)
    expect(isOpenInstance({ status: "snoozed", deletedAt: null })).toBe(true)
    expect(isOpenInstance({ status: "done", deletedAt: null })).toBe(false)
    expect(isOpenInstance({ status: "skipped", deletedAt: null })).toBe(false)
    expect(isOpenInstance({ status: "snoozed", deletedAt: { seconds: 1 } })).toBe(false)
  })
})

describe("with user routines", () => {
  beforeEach(() => fakeDb.load(homeWithHistory({ withRoutine: true })))

  it("getDeepCleanGuides comes from the routines", async () => {
    expect(await getDeepCleanGuides(HOME_ID)).toMatchSnapshot()
    expect(reads(), fakeDb.reads.log.join("\n")).toEqual({ queries: 1, gets: 0, docsRead: 23 })
  })

  it("getRoutineTemplates", async () => {
    expect(await getRoutineTemplates(HOME_ID)).toMatchSnapshot()
  })
})
