/**
 * Integration run of the REAL item-review save against the emulator — task
 * IDENTITY through review → save → reload.
 *
 * The review used to map rows back to stored tasks by TITLE. Measured on the
 * emulator before the fix (origin/main 333615e):
 *   - two tasks both called "Clean the filter", one set Essential and one
 *     Optional: the save reported 2 updated, and one task was untouched — both
 *     edits had gone to the other;
 *   - a row whose title differed from the stored one deactivated its own task.
 * Each case below is the user-visible version of one of those, read back from
 * the store and — for the shared-home case — by a SECOND household member.
 *
 *   npm run emu   # then:
 *   npm run seed:emu
 *   VITE_USE_EMULATORS=true VITE_FIREBASE_PROJECT_ID=demo-homehub \
 *     npx vitest run src/modules/care/services/taskReviewIdentity.integration.test.ts
 *
 * Owns its fixtures: one item id nobody else uses (ITEM), templates/instances
 * prefixed `rid-`, hard-deleted and rewritten before each case, so a rerun or
 * another suite's leftovers cannot change the answer. Clear + reseed before a
 * browser suite anyway.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest"
import { deleteApp, initializeApp, type FirebaseApp } from "firebase/app"
import {
  connectAuthEmulator, createUserWithEmailAndPassword, getAuth, signInWithEmailAndPassword,
} from "firebase/auth"
import {
  collection, connectFirestoreEmulator, deleteDoc, doc, getDoc, getDocs, getFirestore, query, setDoc, where,
  type Firestore,
} from "firebase/firestore"
import { auth, db, firebaseApp } from "@/integrations/firebase"
import { EMULATOR_PORTS } from "@/integrations/firebase/app"
import { loadItemTasksForReview, saveItemTaskReview, type ExistingTaskReview } from "./taskReviewService"
import { rowsFrom } from "@/components/manuals/reviewRows"
import type { PreviewChunk, PreviewTask } from "@/modules/knowledge/types/previewTypes"
import { USAGE_TIP_TAG } from "../../../../shared/tasks/taxonomy"
import { localToday } from "../../../../shared/dates/calendar"

const HOME = "e2e-home"
const ITEM = "rid-review-identity-item"
const MANUAL = "rid-review-identity-manual"
const PROJECT = "demo-homehub"

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

const template = (title: string, over: Record<string, unknown> = {}) => ({
  scopeType: "item_unit", itemUnitId: ITEM, roomId: null, title, description: null,
  careType: "maintenance", careTypeOverriddenAt: null, justification: null, symptomTags: [], reCheckTriggers: [],
  priorityTier: "recommended", remindEnabled: null, riskLevel: "performance", estimatedMinutes: 15,
  defaultAssignee: null, instructionsChunkId: null, instructionsOverride: null, steps: null, sourcePage: null,
  suppliesMode: "none", supplies: [], source: "manual", isUserEditable: true, userModifiedAt: null, isActive: true,
  metadata: {}, manualId: MANUAL, externalKey: null,
  schedule: { scheduleType: "monthly", intervalDays: null, anchorDate: localToday(), season: null, windowDaysBefore: 7, windowDaysAfter: 14 },
  createdAt: new Date(), updatedAt: new Date(), deletedAt: null,
  ...over,
})
const instance = (tpl: string, title: string, status: "scheduled" | "done", over: Record<string, unknown> = {}) => ({
  homeId: HOME, taskTemplateId: tpl, itemUnitId: ITEM, status, dueDate: localToday(), snoozedUntil: null,
  priorityScore: 2, isSafetyCritical: false, completedAt: status === "done" ? new Date() : null,
  completionNotes: status === "done" ? "Did it with the new filter" : null, completionPhotos: [], assignedTo: null,
  title, priorityTier: "recommended", careType: "maintenance", scopeType: "item_unit", estimatedMinutes: 15,
  scheduleType: "monthly", itemName: null, roomName: null, createdAt: new Date(), updatedAt: new Date(), deletedAt: null,
  ...over,
})

/** The fixture: two same-titled tasks, an unrelated one, one with completion
 *  history, and a freeze-prep task the review suppresses in a freeze-free home. */
const FIXTURE: Record<string, ReturnType<typeof template>> = {
  "rid-dup-1": template("Clean the filter"),
  "rid-dup-2": template("Clean the filter"),
  "rid-drain": template("Check the drain hose"),
  "rid-gasket": template("Replace the door gasket"),
  "rid-winterize": template("Winterize the washer for cold storage", {
    schedule: { scheduleType: "seasonal", intervalDays: null, anchorDate: localToday(), season: "fall", windowDaysBefore: 7, windowDaysAfter: 14 },
  }),
}
const INSTANCES: Record<string, ReturnType<typeof instance>> = {
  "rid-i-dup-1": instance("rid-dup-1", "Clean the filter", "scheduled"),
  "rid-i-dup-2": instance("rid-dup-2", "Clean the filter", "scheduled"),
  "rid-i-drain": instance("rid-drain", "Check the drain hose", "scheduled"),
  "rid-i-gasket-open": instance("rid-gasket", "Replace the door gasket", "scheduled"),
  "rid-i-gasket-done": instance("rid-gasket", "Replace the door gasket", "done", { dueDate: "2026-01-15" }),
}

async function resetFixture() {
  const tpls = await getDocs(query(collection(db, `homes/${HOME}/taskTemplates`), where("itemUnitId", "==", ITEM)))
  const insts = await getDocs(query(collection(db, `homes/${HOME}/taskInstances`), where("itemUnitId", "==", ITEM)))
  const chunks = await getDocs(collection(db, `homes/${HOME}/manuals/${MANUAL}/chunks`))
  await Promise.all([...tpls.docs, ...insts.docs, ...chunks.docs].map((d) => deleteDoc(d.ref)))
  await setDoc(doc(db, `homes/${HOME}/manuals/${MANUAL}`), {
    itemUnitId: ITEM, title: "Review identity fixture manual", sourceType: "url", sourceRef: "https://example.test/m.pdf",
    createdAt: new Date(), updatedAt: new Date(), deletedAt: null,
  })
  await Promise.all(Object.entries(FIXTURE).map(([id, t]) => setDoc(doc(db, `homes/${HOME}/taskTemplates/${id}`), t)))
  await Promise.all(Object.entries(INSTANCES).map(([id, i]) => setDoc(doc(db, `homes/${HOME}/taskInstances/${id}`), i)))
}

const tpl = async (id: string, store: Firestore = db) => (await getDoc(doc(store, `homes/${HOME}/taskTemplates/${id}`))).data()!
const openInstances = async (templateId: string, store: Firestore = db) =>
  (await getDocs(query(collection(store, `homes/${HOME}/taskInstances`), where("taskTemplateId", "==", templateId))))
    .docs.filter((d) => d.get("deletedAt") == null && ["scheduled", "snoozed"].includes(d.get("status") as string))

/** What the sheet hands back for a row: the stored task with the reviewer's
 *  fields laid over it (TaskReviewSheet.handleSave spreads `r.task`). */
const edit = (t: PreviewTask, over: Partial<PreviewTask>): PreviewTask => ({ ...t, ...over })
/** The ids the sheet draws — the same rowsFrom call ReviewItemTasksButton makes. */
const shownIds = (review: ExistingTaskReview, freezeRiskFalse = false) =>
  rowsFrom(review.preview, freezeRiskFalse).flatMap((r) => (r.task?.template_id ? [r.task.template_id] : []))

async function load(): Promise<ExistingTaskReview> {
  const res = await loadItemTasksForReview(HOME, ITEM)
  expect(res.error).toBeNull()
  return res.data!
}

describe.skipIf(import.meta.env.VITE_USE_EMULATORS !== "true")("item review keeps task identity (emulator)", () => {
  let second: FirebaseApp | null = null
  let secondDb: Firestore

  beforeAll(async () => {
    await signInWithEmailAndPassword(auth, "e2e@homehub.test", "E2eTest!2026")

    // A second member of the same home, signed in on its own app instance —
    // the household partner opening the app on their phone.
    second = initializeApp(firebaseApp.options, `rid-second-member-${Date.now()}`)
    const secondAuth = getAuth(second)
    connectAuthEmulator(secondAuth, `http://127.0.0.1:${EMULATOR_PORTS.auth}`, { disableWarnings: true })
    secondDb = getFirestore(second)
    connectFirestoreEmulator(secondDb, "127.0.0.1", EMULATOR_PORTS.firestore)
    const email = "rid-partner@homehub.test", password = "RidPartner!2026"
    const cred = await createUserWithEmailAndPassword(secondAuth, email, password)
      .catch(() => signInWithEmailAndPassword(secondAuth, email, password))
    // Joining a home is the acceptInvite callable (Admin SDK) in the app; the
    // rules deny it to clients. The emulator's owner credential stands in.
    const res = await fetch(
      `http://127.0.0.1:${EMULATOR_PORTS.firestore}/v1/projects/${PROJECT}/databases/(default)/documents/homes/${HOME}/members/${cred.user.uid}`,
      {
        method: "PATCH",
        headers: { Authorization: "Bearer owner", "Content-Type": "application/json" },
        body: JSON.stringify({
          fields: {
            uid: { stringValue: cred.user.uid },
            role: { stringValue: "member" },
            isPrimary: { booleanValue: true },
            joinedAt: { timestampValue: new Date().toISOString() },
          },
        }),
      },
    )
    expect(res.ok).toBe(true)
  })

  afterAll(async () => {
    if (second) await deleteApp(second)
  })

  beforeEach(resetFixture)

  it("two tasks with the same title stay two tasks through review → save → reload, for both members", async () => {
    const review = await load()
    const dups = review.preview.tasks.filter((t) => t.title === "Clean the filter")
    expect(dups.map((t) => t.template_id).sort()).toEqual(["rid-dup-1", "rid-dup-2"])

    const tasks = review.preview.tasks.map((t) =>
      t.template_id === "rid-dup-1" ? edit(t, { priority_tier: "essential", schedule_type: "quarterly" })
        : t.template_id === "rid-dup-2" ? edit(t, { priority_tier: "optional", care_type: "cleaning" })
          : t,
    )
    const res = await saveItemTaskReview({
      homeId: HOME, itemUnitId: ITEM, templateIds: review.templateIds, manualById: review.manualById,
      shownTemplateIds: shownIds(review), tasks, chunks: [],
    })
    expect(res.error).toBeNull()

    // Reload as the person who saved…
    const one = await tpl("rid-dup-1"), two = await tpl("rid-dup-2")
    expect([one.priorityTier, one.schedule.scheduleType, one.careType]).toEqual(["essential", "quarterly", "maintenance"])
    expect([two.priorityTier, two.schedule.scheduleType, two.careType]).toEqual(["optional", "monthly", "cleaning"])
    expect(one.isActive && two.isActive).toBe(true)

    // …and as the other member of the household, on another device.
    const one2 = await tpl("rid-dup-1", secondDb), two2 = await tpl("rid-dup-2", secondDb)
    expect([one2.priorityTier, two2.priorityTier]).toEqual(["essential", "optional"])
    const [i1] = await openInstances("rid-dup-1", secondDb)
    const [i2] = await openInstances("rid-dup-2", secondDb)
    expect([i1.get("priorityTier"), i1.get("scheduleType"), i1.get("careType")]).toEqual(["essential", "quarterly", "maintenance"])
    expect([i2.get("priorityTier"), i2.get("scheduleType"), i2.get("careType")]).toEqual(["optional", "monthly", "cleaning"])

    // A fresh review shows both rows again, each still itself.
    const again = await load()
    const reloaded = again.preview.tasks.filter((t) => t.title === "Clean the filter")
    expect(reloaded.map((t) => [t.template_id, t.priority_tier]).sort()).toEqual([["rid-dup-1", "essential"], ["rid-dup-2", "optional"]])
  })

  it("every saved task's open occurrence agrees with its template", async () => {
    const review = await load()
    const tasks = review.preview.tasks.map((t, i) =>
      edit(t, { priority_tier: (["essential", "optional", "recommended"] as const)[i % 3], care_type: i % 2 ? "cleaning" : "maintenance" }),
    )
    const res = await saveItemTaskReview({
      homeId: HOME, itemUnitId: ITEM, templateIds: review.templateIds, manualById: review.manualById,
      shownTemplateIds: shownIds(review), tasks, chunks: [],
    })
    expect(res.error).toBeNull()
    for (const id of shownIds(review)) {
      const t = await tpl(id)
      for (const inst of await openInstances(id)) {
        expect({ id, title: inst.get("title"), tier: inst.get("priorityTier"), care: inst.get("careType"), sched: inst.get("scheduleType") })
          .toEqual({ id, title: t.title, tier: t.priorityTier, care: t.careType, sched: t.schedule.scheduleType })
      }
    }
  })

  it("a row whose title changed keeps its identity and never touches the task it now shares a name with", async () => {
    const review = await load()
    // The sheet has no title editor; this is the guard for the day a row's
    // title differs from storage anyway — including colliding with another task.
    const tasks = review.preview.tasks.map((t) =>
      t.template_id === "rid-drain" ? edit(t, { title: "Replace the door gasket", priority_tier: "essential" }) : t,
    )
    const res = await saveItemTaskReview({
      homeId: HOME, itemUnitId: ITEM, templateIds: review.templateIds, manualById: review.manualById,
      shownTemplateIds: shownIds(review), tasks, chunks: [],
    })
    expect(res.error).toBeNull()
    expect(res.data!.deactivated).toBe(0)

    const drain = await tpl("rid-drain"), gasket = await tpl("rid-gasket")
    // The edited task kept its id, its edit, its stored title, and stayed active…
    expect([drain.isActive, drain.deletedAt, drain.priorityTier, drain.title]).toEqual([true, null, "essential", "Check the drain hose"])
    // …and the task whose name it borrowed is exactly as it was.
    expect([gasket.isActive, gasket.priorityTier]).toEqual([true, "recommended"])
    const [drainOpen] = await openInstances("rid-drain")
    expect(drainOpen.get("title")).toBe("Check the drain hose")
  })

  it("skipping one of two same-titled tasks deactivates only that one; its completion history survives", async () => {
    const review = await load()
    // Skip dup-2 and the gasket task (which has a done occurrence); keep the rest.
    const tasks = review.preview.tasks.filter((t) => t.template_id !== "rid-dup-2" && t.template_id !== "rid-gasket")
    const res = await saveItemTaskReview({
      homeId: HOME, itemUnitId: ITEM, templateIds: review.templateIds, manualById: review.manualById,
      shownTemplateIds: shownIds(review), tasks, chunks: [],
    })
    expect(res.error).toBeNull()
    expect(res.data!.deactivated).toBe(2)

    expect((await tpl("rid-dup-1")).isActive).toBe(true)
    expect(await openInstances("rid-dup-1")).toHaveLength(1)
    expect((await tpl("rid-dup-2")).isActive).toBe(false)
    expect(await openInstances("rid-dup-2")).toHaveLength(0)

    // Completion history: the template is retired (soft — never deleted) and
    // its open occurrence goes, but the DONE occurrence is untouched.
    const gasket = await tpl("rid-gasket")
    expect(gasket.isActive).toBe(false)
    const done = (await getDoc(doc(db, `homes/${HOME}/taskInstances/rid-i-gasket-done`))).data()!
    expect([done.status, done.deletedAt, done.completionNotes]).toEqual(["done", null, "Did it with the new filter"])
  })

  it("converting one of two same-titled tasks to a tip retires that one and writes its tip once", async () => {
    const review = await load()
    const dup2 = review.preview.tasks.find((t) => t.template_id === "rid-dup-2")!
    const tasks = review.preview.tasks.filter((t) => t !== dup2)
    const tip: PreviewChunk = {
      chunk_type: "how_to", title: dup2.title, content: "Rinse it under the tap after each use.",
      tags: [USAGE_TIP_TAG], source_pages: [], template_id: "rid-dup-2",
    }
    const res = await saveItemTaskReview({
      homeId: HOME, itemUnitId: ITEM, templateIds: review.templateIds, manualById: review.manualById,
      shownTemplateIds: shownIds(review), tasks, chunks: [tip],
    })
    expect(res.error).toBeNull()
    expect([(await tpl("rid-dup-1")).isActive, (await tpl("rid-dup-2")).isActive]).toEqual([true, false])
    const chunks = await getDocs(collection(db, `homes/${HOME}/manuals/${MANUAL}/chunks`))
    expect(chunks.docs.map((d) => [d.get("title"), d.get("content")])).toEqual([["Clean the filter", "Rinse it under the tap after each use."]])
  })

  it("a task the review never showed is left alone, as is one added on another device after it opened", async () => {
    const review = await load()
    // Freeze-free home: the sheet suppresses the winterize row before drawing.
    const shown = shownIds(review, true)
    expect(review.templateIds).toContain("rid-winterize")
    expect(shown).not.toContain("rid-winterize")

    // The partner adds a task to this item while the review is open.
    await setDoc(doc(secondDb, `homes/${HOME}/taskTemplates/rid-added-later`), template("Clean the lint screen"))

    const tasks = review.preview.tasks.filter((t) => shown.includes(t.template_id!))
    const res = await saveItemTaskReview({
      homeId: HOME, itemUnitId: ITEM, templateIds: review.templateIds, manualById: review.manualById,
      shownTemplateIds: shown, tasks, chunks: [],
    })
    expect(res.error).toBeNull()
    expect(res.data!.deactivated).toBe(0)
    const w = await tpl("rid-winterize")
    expect([w.isActive, w.deletedAt, w.userModifiedAt]).toEqual([true, null, null])
    expect((await tpl("rid-added-later")).isActive).toBe(true)
  })

  it("refuses — writing nothing — when a reviewed task was removed on another device, or a row names a task this review didn't load", async () => {
    const review = await load()
    // The partner deletes a task while the review is open.
    await setDoc(doc(secondDb, `homes/${HOME}/taskTemplates/rid-drain`), { deletedAt: new Date(), isActive: false }, { merge: true })
    const tasks = review.preview.tasks.map((t) => edit(t, { priority_tier: "essential" }))
    const stale = await saveItemTaskReview({
      homeId: HOME, itemUnitId: ITEM, templateIds: review.templateIds, manualById: review.manualById,
      shownTemplateIds: shownIds(review), tasks, chunks: [],
    })
    expect(stale.error?.message).toMatch(/removed on another device/)
    expect((await tpl("rid-dup-1")).priorityTier).toBe("recommended")
    expect((await tpl("rid-drain")).isActive).toBe(false)

    const foreign = await saveItemTaskReview({
      homeId: HOME, itemUnitId: ITEM, templateIds: review.templateIds, manualById: review.manualById,
      shownTemplateIds: shownIds(review),
      tasks: [edit(review.preview.tasks[0], { template_id: "some-other-items-task" })], chunks: [],
    })
    expect(foreign.error?.message).toMatch(/isn't one of this item's tasks/)
    const untitled = await saveItemTaskReview({
      homeId: HOME, itemUnitId: ITEM, templateIds: review.templateIds, manualById: review.manualById,
      shownTemplateIds: shownIds(review), tasks: [edit(review.preview.tasks[0], { template_id: undefined })], chunks: [],
    })
    expect(untitled.error?.message).toMatch(/isn't one of this item's tasks/)
  })
})
