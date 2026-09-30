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
process.env.TZ = "America/Los_Angeles"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("firebase/firestore", async () => (await import("@/test/fakeFirestore")).fakeFirestoreModule)
vi.mock("@/integrations/firebase", () => ({ db: {}, auth: { currentUser: null }, callable: vi.fn(() => vi.fn()) }))

const { fakeDb } = await import("@/test/fakeFirestore")
const { getCleaningTasks, getDeepCleanGuides, getRoutineTemplates } = await import("./cleanSession")
const { HOME_ID, FIXTURE_NOW, homeWithHistory } = await import("./dashboardReads.fixture")

const reads = () => ({ queries: fakeDb.reads.queries, gets: fakeDb.reads.gets, docsRead: fakeDb.reads.docsRead })

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
    expect(reads(), fakeDb.reads.log.join("\n")).toEqual({ queries: 4, gets: 8, docsRead: 84 })
  })

  it("getCleaningTasks — maintenance", async () => {
    expect(await getCleaningTasks(HOME_ID, "maintenance")).toMatchSnapshot()
  })

  it("getDeepCleanGuides", async () => {
    expect(await getDeepCleanGuides(HOME_ID)).toMatchSnapshot()
    expect(reads(), fakeDb.reads.log.join("\n")).toEqual({ queries: 5, gets: 8, docsRead: 105 })
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
