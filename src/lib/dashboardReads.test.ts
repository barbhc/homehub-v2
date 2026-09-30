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
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("firebase/firestore", async () => (await import("@/test/fakeFirestore")).fakeFirestoreModule)
vi.mock("@/integrations/firebase", () => ({ db: {}, auth: { currentUser: null }, callable: vi.fn(() => vi.fn()) }))

const { fakeDb, Timestamp } = await import("@/test/fakeFirestore")
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

  it("reads each collection once — items, open instances, 90 days of completions, templates", async () => {
    await loadHome()
    // Was 12 queries + 9 gets = 224 documents: items ×5, taskInstances ×5 (three
    // of them every instance, done history included), taskTemplates ×2, and a
    // template probe for each as-needed/after-each-use cleaning template.
    expect(readCounts(), fakeDb.reads.log.join("\n")).toEqual({
      queries: 4,
      gets: 7, // profile + the instance generateTaskInstances still starts (template, item, room) ×2
      docsRead: 62,
      byCollection: { items: 1, taskInstances: 2, taskTemplates: 1 },
    })
    expect(fakeDb.reads.log.filter((l) => l.startsWith("query"))).toEqual([
      "query homes/h1/items [deletedAt == null] → 7",
      'query homes/h1/taskInstances [status in ["scheduled","snoozed"], deletedAt == null] → 17',
      'query homes/h1/taskInstances [completedAt >= "ts:2026-03-25T00:00:00.000Z"] → 10',
      "query homes/h1/taskTemplates → 21",
    ])
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
    // Was 8 queries = 142 documents (items ×4, taskInstances ×3).
    expect(readCounts(), fakeDb.reads.log.join("\n")).toEqual({
      queries: 4,
      gets: 1,
      docsRead: 58,
      byCollection: { items: 1, taskInstances: 2, taskTemplates: 1 },
    })
  })
})

describe("fields Home never renders", () => {
  beforeEach(() => fakeDb.load(homeWithHistory()))

  it("suggested + neverCompleted look back DONE_HISTORY_DAYS", async () => {
    const { core } = await loadHome()
    expect({
      suggested: core.tasks.suggested.map((t) => t.id),
      neverCompleted: Object.fromEntries(
        [...core.tasks.overdue, ...core.tasks.dueSoon].map((t) => [t.id, t.neverCompleted]),
      ),
    }).toMatchSnapshot()
    // The one change from whole-history reads: the smoke alarms were last tested
    // 2025-05-01, outside the window, so this flag — which nothing renders — now
    // says never. The task view's "Start anytime" asks getTaskDetail, not this.
    expect(core.tasks.overdue.find((t) => t.id === "i-smoke")?.neverCompleted).toBe(true)
  })
})

describe("revalidation rounds", () => {
  beforeEach(() => fakeDb.load(homeWithHistory()))

  it("a later round reads again — the refetch after a check-off sees the write", async () => {
    const first = await loadHome()
    expect(first.core.stats.completedThisMonth).toBe(3)

    // What completeTask does: the essential filter is done today, its next one scheduled.
    const inst = `homes/${HOME_ID}/taskInstances`
    fakeDb.store.set(`${inst}/i-filter`, { ...fakeDb.store.get(`${inst}/i-filter`), status: "done", completedAt: Timestamp.fromDate(FIXTURE_NOW) })
    fakeDb.store.set(`${inst}/i-filter-next`, { ...fakeDb.store.get(`${inst}/i-filter`), status: "scheduled", completedAt: null, dueDate: "2026-07-23" })
    fakeDb.resetCounters()

    const second = await loadHome()
    expect(fakeDb.reads.queries).toBe(4)
    expect(second.core.stats.completedThisMonth).toBe(4)
    expect(second.core.tasks.overdue.map((t) => t.id)).not.toContain("i-filter")
    expect(second.extras.upcoming.map((t) => t.id)).toContain("i-filter-next")
  })

  it("a fetcher that starts on its own reads for itself", async () => {
    await fetchCore(HOME_ID)
    await new Promise((r) => setTimeout(r, 0))
    await fetchExtras(HOME_ID)
    expect(readCounts().byCollection).toEqual({ items: 2, taskInstances: 4, taskTemplates: 1 })
  })

  it("an offline, empty items read fails core — never an empty home — and extras fail soft", async () => {
    fakeDb.offline = true
    const core = fetchCore(HOME_ID)
    const extras = fetchExtras(HOME_ID)
    await expect(core).rejects.toThrow("Couldn't reach the server to load your home.")
    expect(await extras).toEqual({ upcoming: [], insights: [], expiringWarranties: [], notices: { recalls: [], missingDetails: [] }, cleaningGuides: [] })
  })
})
