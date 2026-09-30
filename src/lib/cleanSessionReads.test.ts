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
const { getCleaningTasks, getDeepCleanGuides, getRoutineTemplates } = await import("./cleanSession")
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
    expect(reads(), fakeDb.reads.log.join("\n")).toEqual({ queries: 4, gets: 6, docsRead: 66 })
  })

  it("getCleaningTasks — maintenance", async () => {
    expect(await getCleaningTasks(HOME_ID, "maintenance")).toMatchSnapshot()
  })

  it("getDeepCleanGuides", async () => {
    expect(await getDeepCleanGuides(HOME_ID)).toMatchSnapshot()
    // Was 5 queries + 8 gets = 105: templates twice, every instance, every
    // completion and every item (a guide shows no room).
    expect(reads(), fakeDb.reads.log.join("\n")).toEqual({ queries: 3, gets: 6, docsRead: 54 })
  })

  it("getRoutineTemplates", async () => {
    expect(await getRoutineTemplates(HOME_ID)).toEqual([])
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
