/**
 * Per-field provenance (decision C, step 1) on every CLIENT editor, against the
 * emulator with the real rules: each editor stamps exactly the fields it
 * changes — as the signed-in member — and leaves every other field's stamp as
 * it was. A second household member's edit carries THEIR uid.
 *
 * Nothing reads these stamps yet; this proves the record is right before step
 * 2 starts relying on it. (The server writers — commitDraft, the reviewed
 * draft, the classifier — are proven in firebase/functions/test/provenance.emu.test.mjs.)
 *
 *   npm run emu   # then:
 *   npm run seed:emu
 *   VITE_USE_EMULATORS=true VITE_FIREBASE_PROJECT_ID=demo-homehub \
 *     npx vitest run src/modules/care/services/taskProvenance.integration.test.ts
 *
 * Writes only its own documents (ids prefixed prov-, plus the tasks the add
 * paths create, which it deletes) and one extra member row, removed after.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest"
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from "firebase/auth"
import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, where } from "firebase/firestore"
import { auth, db } from "@/integrations/firebase"
import { EMULATOR_PORTS } from "@/integrations/firebase/app"
import { setTaskReminder, setTaskCadence, updateTaskCareType } from "./taskService"
import { updateTaskSchedule } from "./taskScheduleService"
import { loadItemTasksForReview, saveItemTaskReview } from "./taskReviewService"
import { applyCleanupPlan } from "./taskCleanupService"
import { addCustomHomeTask, addLibraryTask, applyLibraryBackstop } from "./careSuggestionService"
import { saveRoutineTask } from "@/lib/cleanSession"
import { LIBRARY } from "../../../../shared/care/library"
import { PROVENANCE_FIELDS, sourceOf, type ProvenanceField } from "../../../../shared/tasks/fieldProvenance"
import { localToday } from "../../../../shared/dates/calendar"

const HOME = "e2e-home"
const ITEM = "prov-item"
const PROJECT = "demo-homehub"
const E2E = { email: "e2e@homehub.test", password: "E2eTest!2026" }
const PARTNER = { email: "prov-partner@homehub.test", password: "ProvPartner!2026" }

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

/** A stamp the seed writes for every field — "system", which a client may
 *  write — so "untouched" is a stamp that must survive byte for byte. */
const seededStamp = (value: unknown) => ({ by: "system", uid: null, at: new Date("2026-01-01T00:00:00Z"), via: "createTaskTemplate", value })
const template = (title: string, over: Record<string, unknown> = {}) => {
  const base = {
    scopeType: "item_unit", itemUnitId: ITEM, roomId: null, title, description: null,
    careType: "maintenance", careTypeOverriddenAt: null, justification: null, symptomTags: [], reCheckTriggers: [],
    priorityTier: "recommended", remindEnabled: null, riskLevel: "performance", estimatedMinutes: 15,
    defaultAssignee: null, instructionsChunkId: null, instructionsOverride: null, steps: null, sourcePage: null,
    suppliesMode: "none", supplies: [], source: "manual", isUserEditable: true, userModifiedAt: null, isActive: true,
    metadata: {}, manualId: null, externalKey: null,
    schedule: { scheduleType: "monthly", intervalDays: null, anchorDate: localToday(), season: "fall", windowDaysBefore: 7, windowDaysAfter: 14 },
    createdAt: new Date(), updatedAt: new Date(), deletedAt: null,
    ...over,
  }
  const s = base.schedule as { scheduleType: string; intervalDays: number | null; season: string | null }
  return {
    ...base,
    fieldSources: {
      priorityTier: seededStamp(base.priorityTier),
      careType: seededStamp(base.careType),
      remindEnabled: seededStamp(base.remindEnabled),
      schedule: seededStamp({ scheduleType: s.scheduleType, intervalDays: s.intervalDays, season: s.season }),
    },
  }
}

const read = async (id: string) => (await getDoc(doc(db, `homes/${HOME}/taskTemplates/${id}`))).data()!
const stampOf = (t: Record<string, unknown>, f: ProvenanceField) => (t.fieldSources as Record<string, Record<string, unknown>> | undefined)?.[f]

/** The fields an editor must have stamped as `uid` — and no others touched. */
function expectStamped(before: Record<string, unknown>, after: Record<string, unknown>, fields: ProvenanceField[], uid: string, via: string) {
  for (const f of PROVENANCE_FIELDS) {
    if (fields.includes(f)) {
      expect(stampOf(after, f), f).toMatchObject({ by: "user", uid, via })
      // The stamp describes the value now stored — the one reader rule trusts it.
      expect(sourceOf(after, f)?.uid, `${f}: sourceOf trusts it`).toBe(uid)
    } else {
      expect(stampOf(after, f), `${f} must be untouched`).toEqual(stampOf(before, f))
    }
  }
}

let me = ""
let partner = ""
const created: string[] = []

async function signInAs(who: { email: string; password: string }) {
  await signOut(auth)
  return (await signInWithEmailAndPassword(auth, who.email, who.password)).user.uid
}

describe.skipIf(import.meta.env.VITE_USE_EMULATORS !== "true")("field provenance on every client editor (emulator)", () => {
  beforeAll(async () => {
    // The household partner: an account of their own, joined to the home the
    // way acceptInvite would (Admin SDK; the emulator's owner credential).
    const cred = await createUserWithEmailAndPassword(auth, PARTNER.email, PARTNER.password)
      .catch(() => signInWithEmailAndPassword(auth, PARTNER.email, PARTNER.password))
    partner = cred.user.uid
    const res = await fetch(
      `http://127.0.0.1:${EMULATOR_PORTS.firestore}/v1/projects/${PROJECT}/databases/(default)/documents/homes/${HOME}/members/${partner}`,
      {
        method: "PATCH",
        headers: { Authorization: "Bearer owner", "Content-Type": "application/json" },
        body: JSON.stringify({ fields: { uid: { stringValue: partner }, role: { stringValue: "member" }, isPrimary: { booleanValue: true } } }),
      },
    )
    expect(res.ok).toBe(true)
    me = await signInAs(E2E)
  })

  beforeEach(async () => {
    if (auth.currentUser?.uid !== me) me = await signInAs(E2E)
    const tpls = await getDocs(query(collection(db, `homes/${HOME}/taskTemplates`), where("itemUnitId", "==", ITEM)))
    const insts = await getDocs(query(collection(db, `homes/${HOME}/taskInstances`), where("itemUnitId", "==", ITEM)))
    await Promise.all([...tpls.docs, ...insts.docs].map((d) => deleteDoc(d.ref)))
    await setDoc(doc(db, `homes/${HOME}/taskTemplates/prov-a`), template("Clean the lint filter"))
    await setDoc(doc(db, `homes/${HOME}/taskTemplates/prov-b`), template("Check the drain hose"))
  })

  afterAll(async () => {
    if (auth.currentUser?.uid !== me) me = await signInAs(E2E)
    const tpls = await getDocs(query(collection(db, `homes/${HOME}/taskTemplates`), where("itemUnitId", "==", ITEM)))
    const insts = await getDocs(query(collection(db, `homes/${HOME}/taskInstances`), where("itemUnitId", "==", ITEM)))
    const extra = await Promise.all(created.map((id) =>
      getDocs(query(collection(db, `homes/${HOME}/taskInstances`), where("taskTemplateId", "==", id)))))
    await Promise.all([...tpls.docs, ...insts.docs, ...extra.flatMap((s) => s.docs)].map((d) => deleteDoc(d.ref)))
    await Promise.all(created.map((id) => deleteDoc(doc(db, `homes/${HOME}/taskTemplates/${id}`))))
    await fetch(
      `http://127.0.0.1:${EMULATOR_PORTS.firestore}/v1/projects/${PROJECT}/databases/(default)/documents/homes/${HOME}/members/${partner}`,
      { method: "DELETE", headers: { Authorization: "Bearer owner" } },
    )
  })

  it("the reminder switch stamps only the reminder", async () => {
    const before = await read("prov-a")
    expect((await setTaskReminder(HOME, "prov-a", true)).error).toBeNull()
    expectStamped(before, await read("prov-a"), ["remindEnabled"], me, "setTaskReminder")
    // Back to the tier default is a choice too.
    expect((await setTaskReminder(HOME, "prov-a", null)).error).toBeNull()
    const after = await read("prov-a")
    expect(stampOf(after, "remindEnabled")).toMatchObject({ by: "user", value: null })
  })

  it("Your reminders' cadence stamps only the cadence — the stored season included", async () => {
    const before = await read("prov-a")
    expect((await setTaskCadence(HOME, "prov-a", "quarterly", null)).error).toBeNull()
    const after = await read("prov-a")
    expectStamped(before, after, ["schedule"], me, "setTaskCadence")
    expect(stampOf(after, "schedule")!.value).toEqual({ scheduleType: "quarterly", intervalDays: null, season: "fall" })
  })

  it("'This isn't right' stamps the tier OR the cadence it changes, not both", async () => {
    let before = await read("prov-a")
    expect((await updateTaskSchedule(HOME, "prov-a", { priorityTier: "essential" }, "feedback")).error).toBeNull()
    let after = await read("prov-a")
    expectStamped(before, after, ["priorityTier"], me, "updateTaskSchedule")

    before = after
    expect((await updateTaskSchedule(HOME, "prov-a", { schedule: { scheduleType: "seasonal", season: "spring" } }, "feedback")).error).toBeNull()
    after = await read("prov-a")
    expectStamped(before, after, ["schedule"], me, "updateTaskSchedule")
    expect(stampOf(after, "schedule")!.value).toEqual({ scheduleType: "seasonal", intervalDays: null, season: "spring" })
  })

  it("the kind override stamps only the kind", async () => {
    const before = await read("prov-a")
    expect((await updateTaskCareType(HOME, "prov-a", "cleaning")).error).toBeNull()
    expectStamped(before, await read("prov-a"), ["careType"], me, "updateTaskCareType")
  })

  it("Review tasks re-saves every row but stamps only what changed", async () => {
    const before = { a: await read("prov-a"), b: await read("prov-b") }
    const review = (await loadItemTasksForReview(HOME, ITEM)).data!
    const tasks = review.preview.tasks.map((t) =>
      t.template_id === "prov-a" ? { ...t, priority_tier: "optional" as const, remind_enabled: false } : t)
    const res = await saveItemTaskReview({
      homeId: HOME, itemUnitId: ITEM, templateIds: review.templateIds, manualById: review.manualById,
      shownTemplateIds: review.templateIds, tasks, chunks: [],
    })
    expect(res.error).toBeNull()
    expectStamped(before.a, await read("prov-a"), ["priorityTier", "remindEnabled"], me, "saveItemTaskReview")
    // The untouched row: re-written, but every stamp exactly as it was.
    expectStamped(before.b, await read("prov-b"), [], me, "saveItemTaskReview")
  })

  it("the cleanup sweep stamps the kind it reclassified and the tier it changed", async () => {
    const before = { a: await read("prov-a"), b: await read("prov-b") }
    await applyCleanupPlan(HOME, [
      { kind: "reclassify", taskTemplateId: "prov-a", title: "Clean the lint filter", itemName: null, from: "maintenance", to: "cleaning" },
      { kind: "retier", taskTemplateId: "prov-b", title: "Check the drain hose", itemName: null, from: "essential", to: "recommended", candidate: "hygiene" },
    ], new Set(["prov-b"]))
    expectStamped(before.a, await read("prov-a"), ["careType"], me, "applyCleanupPlan")
    const b = await read("prov-b")
    expectStamped(before.b, b, ["priorityTier"], me, "applyCleanupPlan")
    expect(stampOf(b, "priorityTier")!.value).toBe("essential")
  })

  it("creating tasks: hers are hers; the library's and a routine's defaults are system", async () => {
    const custom = (await addCustomHomeTask(HOME, "Flush the water heater", "annual")).data!
    created.push(custom.task_template_id)
    const c = await read(custom.task_template_id)
    for (const f of ["careType", "priorityTier", "schedule"] as const) expect(stampOf(c, f)).toMatchObject({ by: "user", uid: me })
    expect(stampOf(c, "schedule")!.via).toBe("setTaskCadence")
    expect(stampOf(c, "remindEnabled"), "never written, never stamped").toBeUndefined()

    const entry = LIBRARY.find((e) => e.key === "range_hood.charcoal")!
    const lib = (await addLibraryTask(HOME, null, entry)).data!
    created.push(lib.task_template_id)
    const l = await read(lib.task_template_id)
    for (const f of ["careType", "priorityTier", "schedule"] as const) expect(stampOf(l, f)).toMatchObject({ by: "system", uid: null, via: "library" })
    expect(sourceOf(l, "schedule")?.by).toBe("system")

    // A backstop she accepts onto an existing task is hers.
    const before = await read("prov-a")
    expect((await applyLibraryBackstop(HOME, "prov-a", entry)).error).toBeNull()
    expectStamped(before, await read("prov-a"), ["schedule"], me, "setTaskCadence")

    const routine = await saveRoutineTask(HOME, "Wipe the fridge shelves", "weekly", 10)
    if (!("task_template_id" in routine)) throw new Error(routine.error)
    created.push(routine.task_template_id)
    const r = await read(routine.task_template_id)
    expect(stampOf(r, "careType")).toMatchObject({ by: "system", via: "routineTemplate" })
    expect(stampOf(r, "priorityTier")).toMatchObject({ by: "system", via: "routineTemplate" })
    expect(stampOf(r, "schedule")).toMatchObject({ by: "user", uid: me, via: "routineTemplate" })
  })

  it("a second household member's edits carry THEIR uid, next to the first member's", async () => {
    expect((await setTaskReminder(HOME, "prov-a", true)).error).toBeNull()
    const mine = await read("prov-a")
    expect(stampOf(mine, "remindEnabled")!.uid).toBe(me)

    expect(await signInAs(PARTNER)).toBe(partner)
    expect((await updateTaskSchedule(HOME, "prov-a", { priorityTier: "optional" }, "feedback")).error).toBeNull()
    const review = (await loadItemTasksForReview(HOME, ITEM)).data!
    const res = await saveItemTaskReview({
      homeId: HOME, itemUnitId: ITEM, templateIds: review.templateIds, manualById: review.manualById,
      shownTemplateIds: review.templateIds,
      tasks: review.preview.tasks.map((t) => (t.template_id === "prov-b" ? { ...t, care_type: "cleaning" as const } : t)),
      chunks: [],
    })
    expect(res.error).toBeNull()

    const a = await read("prov-a")
    expect(stampOf(a, "priorityTier")).toMatchObject({ by: "user", uid: partner })
    expect(stampOf(a, "remindEnabled"), "the first member's stamp survives the second's save").toEqual(stampOf(mine, "remindEnabled"))
    expect(stampOf(await read("prov-b"), "careType")).toMatchObject({ by: "user", uid: partner, via: "saveItemTaskReview" })
    me = await signInAs(E2E)
  })
})
