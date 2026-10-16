/**
 * HH-166: the Settings climate offer lists the home's winterizing tasks and
 * turns off the ones the owner confirms — by the SAME mechanism the feedback
 * sheet's "Not relevant" sweep uses on a winterizing task, so both doors reach
 * the same result: each template archived (isActive:false — kept, not
 * deleted), its open instances soft-deleted, a ledger entry, and the visible
 * "Hide winterizing" house rule.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

type Ref = { path: string; id: string }
const fs = vi.hoisted(() => ({
  templates: [] as { id: string; data: Record<string, unknown> }[],
  items: {} as Record<string, Record<string, unknown>>,
  batchSets: [] as { path: string; data: Record<string, unknown> }[],
  setDocs: [] as { path: string; data: Record<string, unknown> }[],
  commitError: null as Error | null,
  n: 0,
}))

vi.mock("@/integrations/firebase", () => ({ db: {}, callable: () => vi.fn() }))
vi.mock("firebase/firestore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("firebase/firestore")>()),
  collection: (_db: unknown, path: string) => ({ path }),
  doc: (a: unknown, b?: string): Ref => {
    if (typeof b === "string") return { path: b, id: b.split("/").pop()! }
    const id = `gen-${++fs.n}`
    return { path: `${(a as { path: string }).path}/${id}`, id }
  },
  query: (c: { path: string }) => c,
  where: () => ({}),
  serverTimestamp: () => "TS",
  getDocs: async (q: { path: string }) => {
    if (q.path.endsWith("/taskTemplates")) {
      return { docs: fs.templates.map((t) => ({ id: t.id, data: () => t.data, get: (k: string) => t.data[k] })) }
    }
    // Open instances of the archived template.
    return { docs: [{ ref: { path: `${q.path}/inst-1` }, data: () => ({ status: "scheduled", deletedAt: null }) }] }
  },
  getDoc: async (r: Ref) => {
    const item = fs.items[r.id]
    return { exists: () => !!item, get: (k: string) => item?.[k] }
  },
  writeBatch: () => ({
    set: (r: Ref, data: Record<string, unknown>) => fs.batchSets.push({ path: r.path, data }),
    commit: async () => { if (fs.commitError) throw fs.commitError },
  }),
  setDoc: async (r: Ref, data: Record<string, unknown>) => { fs.setDocs.push({ path: r.path, data }) },
}))

const { getWinterizingTasks, turnOffWinterizingTasks } = await import("./taskFeedbackService")

const tpl = (id: string, title: string, over: Record<string, unknown> = {}) => ({
  id,
  data: {
    title, isActive: true, deletedAt: null, itemUnitId: "washer-1", scopeType: "item_unit",
    schedule: { scheduleType: "seasonal", intervalDays: null }, symptomTags: [], ...over,
  },
})

beforeEach(() => {
  fs.templates = [
    tpl("t-washer", "Winterize the washer for cold storage"),
    tpl("t-faucet", "Winterize the outdoor faucets", { itemUnitId: null, scopeType: "home" }),
    tpl("t-filter", "Clean the Filter System", { schedule: { scheduleType: "monthly" } }),
    tpl("t-gone", "Winterize the Dishwasher", { isActive: false }),
  ]
  fs.items = { "washer-1": { displayName: "Washer" } }
  fs.batchSets = []
  fs.setDocs = []
  fs.commitError = null
})

describe("getWinterizingTasks", () => {
  it("lists the live freeze_prep family only, with where · cadence", async () => {
    const res = await getWinterizingTasks("h1")
    expect(res.error).toBeNull()
    expect(res.data).toEqual([
      { taskTemplateId: "t-faucet", title: "Winterize the outdoor faucets", where: "Home", cadence: "Seasonal" },
      // Cold-storage winterizing reads as the as-needed job it is.
      { taskTemplateId: "t-washer", title: "Winterize the washer for cold storage", where: "Washer", cadence: "When needed" },
    ])
  })
})

describe("turnOffWinterizingTasks — the feedback sweep's own mechanism", () => {
  it("archives each ticked template (kept, not deleted), soft-deletes open instances, records the rule and ledger", async () => {
    const res = await turnOffWinterizingTasks("h1", "u1", [
      { taskTemplateId: "t-washer", title: "Winterize the washer for cold storage" },
      { taskTemplateId: "t-faucet", title: "Winterize the outdoor faucets" },
    ])
    expect(res.error).toBeNull()
    expect(res.data?.affected).toBe(2)

    const tplWrites = fs.batchSets.filter((w) => w.path.includes("/taskTemplates/"))
    expect(tplWrites.map((w) => w.path)).toEqual(["homes/h1/taskTemplates/t-washer", "homes/h1/taskTemplates/t-faucet"])
    for (const w of tplWrites) {
      expect(w.data.isActive).toBe(false)
      expect(w.data).not.toHaveProperty("deletedAt") // archived, never deleted
    }
    expect(fs.batchSets.some((w) => w.path.endsWith("/inst-1") && w.data.deletedAt === "TS")).toBe(true)

    const rule = fs.setDocs.find((w) => w.path.startsWith("homes/h1/houseRules/"))
    expect(rule?.data).toMatchObject({ kind: "suppress", match: { by: "seasonalFamily", family: "freeze_prep" }, isActive: true })
    const ledger = fs.setDocs.find((w) => w.path.startsWith("homes/h1/taskFeedback/"))
    expect(ledger?.data).toMatchObject({
      chip: "not_relevant", taskTemplateId: "t-washer", via: "climate",
      resolution: { action: "suppress", sweptTemplateIds: ["t-faucet"] },
    })
  })

  it("a failed write is an error, and no ledger or rule claims it happened", async () => {
    fs.commitError = new Error("Missing or insufficient permissions.")
    const res = await turnOffWinterizingTasks("h1", "u1", [{ taskTemplateId: "t-washer", title: "Winterize the washer for cold storage" }])
    expect(res.error?.message).toBe("Missing or insufficient permissions.")
    expect(fs.setDocs).toHaveLength(0)
  })
})
