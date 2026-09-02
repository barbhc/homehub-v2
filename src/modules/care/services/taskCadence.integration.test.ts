/**
 * Integration run of the REAL setTaskCadence against the emulator.
 *
 * What it is here to prove is not the template write — it is that a task
 * which never had an occurrence GETS one when it is given a cadence, because
 * that occurrence is the only thing the week, the agenda and the push sweep
 * ever read. Seen live 2026-09-02: "Descale the Machine · when needed" was
 * proposed on /reminders and turned on; had a cadence been written the way
 * the page did it, the template would have said "monthly" and nothing would
 * ever have come due. Only reading the instances back proves the reminder
 * can fire.
 *
 *   npm run emu   # then:
 *   npm run seed:emu
 *   VITE_USE_EMULATORS=true VITE_FIREBASE_PROJECT_ID=demo-homehub \
 *     npx vitest run src/modules/care/services/taskCadence.integration.test.ts
 *
 * Writes its own templates into the seeded home (ids prefixed
 * tpl-cadence-integration) and wipes their occurrences first, so a rerun
 * starts from the same place; clear + reseed before a browser suite anyway.
 */
import { describe, it, expect, beforeAll, vi } from "vitest"
import { signInWithEmailAndPassword } from "firebase/auth"
import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, where } from "firebase/firestore"
import { auth, db } from "@/integrations/firebase"
import { setTaskCadence } from "./taskService"
import { computeNextDueDate } from "./nextDueDate"

const HOME = "e2e-home"
const TPL = "tpl-cadence-integration"
const today = () => new Date().toISOString().slice(0, 10)

// The first round trip to a cold emulator can take seconds (rules, indexes,
// the SDK's channel) — the default 5s ran out before the writes it was timing
// had landed, and every later test then saw them. Generous on purpose.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

const template = (title: string, scheduleType: string, over: Record<string, unknown> = {}) => ({
  scopeType: "item_unit", itemUnitId: "furnace", roomId: null, title, description: null,
  careType: "maintenance", careTypeOverriddenAt: null, justification: null, symptomTags: [], reCheckTriggers: [],
  priorityTier: "recommended", remindEnabled: null, riskLevel: "performance", estimatedMinutes: 20,
  defaultAssignee: null, instructionsChunkId: null, instructionsOverride: null, steps: null, sourcePage: null,
  suppliesMode: "none", supplies: [], source: "manual", isUserEditable: true, userModifiedAt: null, isActive: true,
  metadata: {}, manualId: null, externalKey: null,
  schedule: { scheduleType, intervalDays: null, anchorDate: today(), season: null, windowDaysBefore: 7, windowDaysAfter: 14 },
  createdAt: new Date(), updatedAt: new Date(), deletedAt: null,
  ...over,
})
const instancesOf = async (tpl: string) =>
  (await getDocs(query(collection(db, `homes/${HOME}/taskInstances`), where("taskTemplateId", "==", tpl)))).docs
/** Leftovers from a previous run of THIS suite only — never the fixture. */
const wipeOccurrences = async (tpl: string) => {
  for (const d of await instancesOf(tpl)) await deleteDoc(d.ref)
}

// Same guard as every sibling integration suite, and load-bearing: without it
// this signs in against the REAL project on a plain `npm test`.
describe.skipIf(import.meta.env.VITE_USE_EMULATORS !== "true")("setTaskCadence (emulator)", () => {
  beforeAll(async () => {
    await signInWithEmailAndPassword(auth, "e2e@homehub.test", "E2eTest!2026")
    for (const id of [TPL, `${TPL}-tip`, `${TPL}-seasonal`, `${TPL}-fall`]) await wipeOccurrences(id)
    await setDoc(doc(db, `homes/${HOME}/taskTemplates/${TPL}`), template("Descale the machine", "as_needed"))
  })

  it("gives a 'when needed' task its first occurrence, so a reminder on it can fire", async () => {
    expect(await instancesOf(TPL)).toHaveLength(0)
    const res = await setTaskCadence(HOME, TPL, "monthly", null)
    expect(res.error).toBeNull()

    const tpl = await getDoc(doc(db, `homes/${HOME}/taskTemplates/${TPL}`))
    expect(tpl.get("schedule.scheduleType")).toBe("monthly")
    // …and the merge kept the rest of the schedule object.
    expect(tpl.get("schedule.windowDaysBefore")).toBe(7)

    const inst = await instancesOf(TPL)
    expect(inst).toHaveLength(1)
    const d = inst[0].data()
    expect(d.status).toBe("scheduled")
    // One cadence from today, like a freshly parsed task — not "due today".
    expect(d.dueDate).toBe(computeNextDueDate("monthly", today()))
    expect(d.scheduleType).toBe("monthly")
    // The denormalized display set the week, the agenda and the sweep read (§5).
    expect(d.title).toBe("Descale the machine")
    expect(d.careType).toBe("maintenance")
    expect(d.scopeType).toBe("item_unit")
    expect(d.priorityTier).toBe("recommended")
    expect(d.itemName).toBe("Carrier Infinity Furnace")
    expect(d.deletedAt).toBeNull()
    expect(d.assignedTo).toBeNull()
  })

  it("a second cadence change relabels the open occurrence, keeps its date, and creates nothing", async () => {
    const before = (await instancesOf(TPL))[0]
    const res = await setTaskCadence(HOME, TPL, "quarterly", null)
    expect(res.error).toBeNull()
    const after = await instancesOf(TPL)
    expect(after).toHaveLength(1)
    expect(after[0].id).toBe(before.id)
    expect(after[0].get("scheduleType")).toBe("quarterly")
    expect(after[0].get("dueDate")).toBe(before.get("dueDate"))
  })

  it("never invents an occurrence for a cadence that does not come due", async () => {
    const id = `${TPL}-tip`
    await setDoc(doc(db, `homes/${HOME}/taskTemplates/${id}`), template("Wipe the exterior", "as_needed"))
    const res = await setTaskCadence(HOME, id, "after_each_use", null)
    expect(res.error).toBeNull()
    expect(await instancesOf(id)).toHaveLength(0)
    expect((await getDoc(doc(db, `homes/${HOME}/taskTemplates/${id}`))).get("schedule.scheduleType")).toBe("after_each_use")
  })

  it("refuses seasonal without a season rather than writing a schedule nothing can come due on", async () => {
    const id = `${TPL}-seasonal`
    await setDoc(doc(db, `homes/${HOME}/taskTemplates/${id}`), template("Check the gutters", "as_needed"))
    const res = await setTaskCadence(HOME, id, "seasonal", null)
    expect(res.data).toBeNull()
    expect(res.error?.message).toMatch(/season/)
    expect((await getDoc(doc(db, `homes/${HOME}/taskTemplates/${id}`))).get("schedule.scheduleType")).toBe("as_needed")
    expect(await instancesOf(id)).toHaveLength(0)
  })

  it("a seasonal task WITH a season lands in that season", async () => {
    const id = `${TPL}-fall`
    await setDoc(doc(db, `homes/${HOME}/taskTemplates/${id}`), template("Clear the gutters", "as_needed", {
      schedule: { scheduleType: "as_needed", intervalDays: null, anchorDate: today(), season: "fall", windowDaysBefore: 7, windowDaysAfter: 14 },
    }))
    const res = await setTaskCadence(HOME, id, "seasonal", null)
    expect(res.error).toBeNull()
    const inst = await instancesOf(id)
    expect(inst).toHaveLength(1)
    expect(inst[0].get("dueDate")).toBe(computeNextDueDate("seasonal", today(), { season: "fall" }))
  })

  it("a task the home does not have is an error, not a phantom schedule", async () => {
    const res = await setTaskCadence(HOME, "tpl-cadence-integration-missing", "monthly", null)
    expect(res.data).toBeNull()
    expect(res.error?.message).toBe("Task not found")
    expect(await instancesOf("tpl-cadence-integration-missing")).toHaveLength(0)
  })
})
