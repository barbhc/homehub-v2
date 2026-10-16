/**
 * HH-166 on the Home agenda. A freeze-free home treats "Winterize Washer for
 * Cold Storage" as as-needed, so it leaves the dated agenda. A home that
 * freezes, or hasn't said, keeps it, along with any seasonal "winterize …
 * before storing" job. Nothing is hidden on a guess (gate-1 review).
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const getDocs = vi.fn()
const getDoc = vi.fn()

vi.mock("@/integrations/firebase", () => ({ db: {}, auth: { currentUser: null }, callable: vi.fn(() => vi.fn()) }))
vi.mock("firebase/firestore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("firebase/firestore")>()),
  collection: vi.fn(() => ({})),
  doc: vi.fn(() => ({})),
  query: vi.fn(() => ({})),
  where: vi.fn(() => ({})),
  getDoc: (...a: unknown[]) => getDoc(...a),
  getDocs: (...a: unknown[]) => getDocs(...a),
}))
vi.mock("@/hooks/usePushMode", () => ({ usePushMode: () => ({ mode: "curated", prefs: {} }) }))

const { getWeekAgenda } = await import("./weekAgenda")
const { localToday } = await import("../../../../shared/dates/calendar")

const instance = (id: string, title: string) => ({
  id,
  data: () => ({
    status: "scheduled", taskTemplateId: `tpl-${id}`, priorityTier: "recommended", careType: "maintenance",
    scopeType: "item_unit", itemUnitId: null, title, scheduleType: "seasonal", isSafetyCritical: false,
    estimatedMinutes: 20, itemName: null, roomName: null, deletedAt: null, dueDate: localToday(),
  }),
})
const INSTANCES = [
  instance("washer", "Winterize Washer for Cold Storage"),
  instance("pressure", "Winterize the pressure washer before storing it"),
]

async function agendaFor(home: Record<string, unknown>) {
  getDoc.mockResolvedValue({ get: (k: string) => home[k], exists: () => true, data: () => home })
  getDocs.mockResolvedValue({ metadata: { fromCache: false }, empty: false, docs: INSTANCES })
  const res = await getWeekAgenda("h1")
  if (!res.data) throw new Error(res.error?.message ?? "no agenda")
  return res.data.map((r) => r.taskInstanceId)
}

beforeEach(() => {
  getDocs.mockReset()
  getDoc.mockReset()
})

describe("cold-storage winterizing on the week agenda", () => {
  it("a mild (freeze-free) home: 'Winterize Washer for Cold Storage' is as-needed, off the dated agenda", async () => {
    const ids = await agendaFor({ climate: "mild", freezeRisk: false })
    expect(ids).not.toContain("washer")
    expect(ids).toContain("pressure")
  })

  it("a cold-climate home keeps both, including the seasonal 'winterize … before storing'", async () => {
    expect(await agendaFor({ climate: "cold", freezeRisk: true })).toEqual(expect.arrayContaining(["washer", "pressure"]))
  })

  it("a home with no climate answer keeps both — nothing is hidden on a guess", async () => {
    expect(await agendaFor({})).toEqual(expect.arrayContaining(["washer", "pressure"]))
  })
})
