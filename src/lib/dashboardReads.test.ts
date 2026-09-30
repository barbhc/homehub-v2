/**
 * What ONE Home load reads, and what it renders from those reads.
 *
 * Runs the real dashboard fetchers (useDashboard's fetchCore + fetchExtras —
 * the two SWR keys Home revalidates together) against an in-memory Firestore
 * holding a home WITH history (dashboardReads.fixture.ts), and pins:
 *
 *  · the outputs — every number and list Home renders. The snapshots were
 *    written by the implementation that read whole collections; the narrowed
 *    reads must reproduce them exactly;
 *  · the reads — how many queries/gets one load issues and how many documents
 *    come back (audit 2026-09-29 B, Part 1: one Home load read `items` five
 *    times and `taskInstances` five times, done history included).
 */
process.env.TZ = "America/Los_Angeles"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("firebase/firestore", async () => (await import("@/test/fakeFirestore")).fakeFirestoreModule)
vi.mock("@/integrations/firebase", () => ({ db: {}, auth: { currentUser: null }, callable: vi.fn(() => vi.fn()) }))

const { fakeDb } = await import("@/test/fakeFirestore")
const { fetchCore, fetchExtras } = await import("./useDashboard")
const { HOME_ID, FIXTURE_NOW, homeWithHistory } = await import("./dashboardReads.fixture")

type Core = Awaited<ReturnType<typeof fetchCore>>
type Extras = Awaited<ReturnType<typeof fetchExtras>>

/** SWR starts both keys' fetchers in the same tick (mount, focus, reconnect, refresh()) — so does this. */
async function loadHome(): Promise<{ core: Core; extras: Extras }> {
  const [core, extras] = await Promise.all([fetchCore(HOME_ID), fetchExtras(HOME_ID)])
  return { core, extras }
}

/** Query counts per collection, plus totals — `docsRead` is what Firestore bills. */
function readCounts() {
  const byCollection: Record<string, number> = {}
  for (const line of fakeDb.reads.log) {
    const m = /^query homes\/[^/]+\/(\w+)/.exec(line)
    if (m) byCollection[m[1]] = (byCollection[m[1]] ?? 0) + 1
  }
  return { queries: fakeDb.reads.queries, gets: fakeDb.reads.gets, docsRead: fakeDb.reads.docsRead, byCollection }
}

/** Everything Home renders from the core key: drops `suggested` and `neverCompleted`, which nothing renders. */
function rendered(core: Core) {
  const { suggested: _suggested, ...tasks } = core.tasks
  const strip = (list: Core["tasks"]["overdue"]) => list.map(({ neverCompleted: _n, ...t }) => t)
  return {
    stats: core.stats,
    tasks: {
      ...tasks,
      overdue: strip(tasks.overdue),
      overdueEssential: strip(tasks.overdueEssential),
      overdueRecommended: strip(tasks.overdueRecommended),
      dueSoon: strip(tasks.dueSoon),
      needsAttention: strip(tasks.needsAttention),
    },
  }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: FIXTURE_NOW })
})
afterEach(() => {
  vi.useRealTimers()
})

describe("one Home load — a home with history, no user routines (the usual case)", () => {
  beforeEach(() => fakeDb.load(homeWithHistory()))

  it("renders exactly what it always rendered", async () => {
    const { core, extras } = await loadHome()
    expect(rendered(core)).toMatchSnapshot("core")
    expect(extras).toMatchSnapshot("extras")
  })

  it("still starts the instance a recurring cleaning template lost — and writes nothing else", async () => {
    await loadHome()
    expect(fakeDb.writes.map((w) => ({ path: w.path, title: w.data.title, dueDate: w.data.dueDate, status: w.data.status }))).toMatchSnapshot()
  })

  it("reads", async () => {
    await loadHome()
    expect(readCounts(), fakeDb.reads.log.join("\n")).toEqual({
      queries: 12,
      gets: 9,
      docsRead: 224,
      byCollection: { items: 5, taskInstances: 5, taskTemplates: 2 },
    })
  })
})

describe("one Home load — with user routines (guides come from the routines)", () => {
  beforeEach(() => fakeDb.load(homeWithHistory({ withRoutine: true })))

  it("renders exactly what it always rendered", async () => {
    const { core, extras } = await loadHome()
    expect(rendered(core)).toMatchSnapshot("core")
    expect(extras).toMatchSnapshot("extras")
  })

  it("reads", async () => {
    await loadHome()
    expect(readCounts(), fakeDb.reads.log.join("\n")).toEqual({
      queries: 8,
      gets: 1,
      docsRead: 142,
      byCollection: { items: 4, taskInstances: 3, taskTemplates: 1 },
    })
  })
})

describe("fields Home never renders", () => {
  beforeEach(() => fakeDb.load(homeWithHistory()))

  it("suggested + neverCompleted", async () => {
    const { core } = await loadHome()
    expect({
      suggested: core.tasks.suggested.map((t) => t.id),
      neverCompleted: Object.fromEntries(
        [...core.tasks.overdue, ...core.tasks.dueSoon].map((t) => [t.id, t.neverCompleted]),
      ),
    }).toMatchSnapshot()
  })
})
