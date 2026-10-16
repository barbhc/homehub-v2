/**
 * HH-166: the Settings climate offer lists the home's winterizing tasks and
 * turns off the ones the owner confirms — with the same writes the feedback
 * sheet's "Not relevant" sweep makes on a winterizing task (template archived
 * isActive:false and kept, open instances soft-deleted, the "Hide winterizing"
 * house rule, a ledger entry) — but in ONE batch, so a failure part-way leaves
 * nothing half-done (gate-1 review). Undo puts back exactly what that batch wrote.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

type Ref = { path: string; id: string }
type Write = { path: string; data: Record<string, unknown> }
const fs = vi.hoisted(() => ({
  templates: [] as { id: string; data: Record<string, unknown> }[],
  items: {} as Record<string, Record<string, unknown>>,
  /** Writes that a successful commit made durable — the only ones that count. */
  committed: [] as Write[],
  setDocs: [] as Write[],
  commitError: null as Error | null,
  /** Throw on the Nth batch.set — a failure part-way through building the batch. */
  failOnSet: 0,
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
  where: (_f: string, _op: string, v: unknown) => v,
  serverTimestamp: () => "TS",
  getDocs: async (q: { path: string }) => {
    if (q.path.endsWith("/taskTemplates")) {
      return { docs: fs.templates.map((t) => ({ id: t.id, data: () => t.data, get: (k: string) => t.data[k] })) }
    }
    // One open and one done instance per template; only the open one is archived.
    return {
      docs: [
        { id: `inst-open-${fs.n}`, data: () => ({ status: "scheduled", deletedAt: null }) },
        { id: `inst-done-${fs.n++}`, data: () => ({ status: "done", deletedAt: null }) },
      ],
    }
  },
  getDoc: async (r: Ref) => {
    const item = fs.items[r.id]
    return { exists: () => !!item, get: (k: string) => item?.[k] }
  },
  writeBatch: () => {
    const pending: Write[] = []
    return {
      set: (r: Ref, data: Record<string, unknown>) => {
        if (fs.failOnSet && pending.length + 1 === fs.failOnSet) throw new Error("Simulated failure part-way")
        pending.push({ path: r.path, data })
      },
      commit: async () => {
        if (fs.commitError) throw fs.commitError
        fs.committed.push(...pending)
      },
    }
  },
  setDoc: async (r: Ref, data: Record<string, unknown>) => { fs.setDocs.push({ path: r.path, data }) },
}))

const { getWinterizingTasks, turnOffWinterizingTasks, undoTurnOffWinterizing } = await import("./taskFeedbackService")

const tpl = (id: string, title: string, over: Record<string, unknown> = {}) => ({
  id,
  data: {
    title, isActive: true, deletedAt: null, itemUnitId: "washer-1", scopeType: "item_unit",
    schedule: { scheduleType: "seasonal", intervalDays: null }, symptomTags: [], ...over,
  },
})

const PICKED = [
  { taskTemplateId: "t-washer", title: "Winterize the washer for cold storage" },
  { taskTemplateId: "t-faucet", title: "Winterize the outdoor faucets" },
]

beforeEach(() => {
  fs.templates = [
    tpl("t-washer", "Winterize the washer for cold storage"),
    tpl("t-faucet", "Winterize the outdoor faucets", { itemUnitId: null, scopeType: "home" }),
    tpl("t-filter", "Clean the Filter System", { schedule: { scheduleType: "monthly" } }),
    tpl("t-gone", "Winterize the Dishwasher", { isActive: false }),
  ]
  fs.items = { "washer-1": { displayName: "Washer" } }
  fs.committed = []
  fs.setDocs = []
  fs.commitError = null
  fs.failOnSet = 0
  fs.n = 0
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

describe("turnOffWinterizingTasks — the sweep's writes, in one batch", () => {
  it("archives each ticked template (kept, not deleted), soft-deletes only open instances, records rule + ledger — all in one commit", async () => {
    const res = await turnOffWinterizingTasks("h1", "u1", PICKED)
    expect(res.error).toBeNull()
    expect(fs.setDocs).toHaveLength(0) // nothing written outside the batch

    const tplWrites = fs.committed.filter((w) => w.path.includes("/taskTemplates/"))
    expect(tplWrites.map((w) => w.path)).toEqual(["homes/h1/taskTemplates/t-washer", "homes/h1/taskTemplates/t-faucet"])
    for (const w of tplWrites) {
      expect(w.data.isActive).toBe(false)
      expect(w.data).not.toHaveProperty("deletedAt") // archived, never deleted
    }
    const instWrites = fs.committed.filter((w) => w.path.includes("/taskInstances/"))
    expect(instWrites.map((w) => w.path.split("/").pop())).toEqual(res.data?.instanceIds)
    expect(instWrites.every((w) => w.data.deletedAt === "TS" && w.path.includes("inst-open"))).toBe(true)

    const rule = fs.committed.find((w) => w.path.startsWith("homes/h1/houseRules/"))
    expect(rule?.data).toMatchObject({ kind: "suppress", match: { by: "seasonalFamily", family: "freeze_prep" }, isActive: true })
    // The offer is answered in the same commit — and the profile's CAS guard
    // (`updatedAt`) is left alone.
    expect(fs.committed).toContainEqual({ path: "homes/h1", data: { winterizingOfferAnsweredAt: "TS" } })
    const ledger = fs.committed.find((w) => w.path.startsWith("homes/h1/taskFeedback/"))
    expect(ledger?.data).toMatchObject({
      chip: "not_relevant", taskTemplateId: "t-washer", via: "climate",
      resolution: { action: "suppress", sweptTemplateIds: ["t-faucet"], ruleId: rule?.path.split("/").pop() },
    })
    expect(res.data).toMatchObject({ affected: 2, templateIds: ["t-washer", "t-faucet"], ruleId: rule?.path.split("/").pop() })
  })

  it("a failure part-way through leaves NOTHING written — no task off, no rule, no ledger", async () => {
    fs.failOnSet = 3 // the second instance/template write
    const res = await turnOffWinterizingTasks("h1", "u1", PICKED)
    expect(res.error?.message).toBe("Simulated failure part-way")
    expect(res.data).toBeNull()
    expect(fs.committed).toHaveLength(0)
    expect(fs.setDocs).toHaveLength(0)
  })

  it("a refused commit leaves nothing written either", async () => {
    fs.commitError = new Error("Missing or insufficient permissions.")
    const res = await turnOffWinterizingTasks("h1", "u1", PICKED)
    expect(res.error?.message).toBe("Missing or insufficient permissions.")
    expect(fs.committed).toHaveLength(0)
  })
})

describe("undoTurnOffWinterizing", () => {
  it("puts back exactly what the turn-off wrote, in one batch, and retires the rule", async () => {
    const off = await turnOffWinterizingTasks("h1", "u1", PICKED)
    const turnedOff = off.data!
    fs.committed = []
    const res = await undoTurnOffWinterizing("h1", turnedOff)
    expect(res).toEqual({ data: true, error: null })
    expect(fs.committed).toEqual([
      { path: "homes/h1/taskTemplates/t-washer", data: { isActive: true, updatedAt: "TS" } },
      { path: "homes/h1/taskTemplates/t-faucet", data: { isActive: true, updatedAt: "TS" } },
      ...turnedOff.instanceIds.map((id) => ({ path: `homes/h1/taskInstances/${id}`, data: { deletedAt: null, updatedAt: "TS" } })),
      { path: `homes/h1/houseRules/${turnedOff.ruleId}`, data: { isActive: false, deletedAt: "TS", updatedAt: "TS" } },
    ])
  })

  it("a failed undo is an error the caller can show", async () => {
    fs.commitError = new Error("Missing or insufficient permissions.")
    const res = await undoTurnOffWinterizing("h1", {
      feedbackId: "f1", ruleId: "r1", affected: 1, templateIds: ["t-washer"], instanceIds: ["i1"],
    })
    expect(res.error?.message).toBe("Missing or insufficient permissions.")
    expect(fs.committed).toHaveLength(0)
  })
})
