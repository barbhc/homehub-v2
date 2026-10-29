/**
 * Integration run of the THREE cadence editors against the emulator, holding
 * them to the owner's one rule (2026-10-28, decision doc §B):
 * "From when you last did it."
 *
 *   Your reminders     → setTaskCadence
 *   "This isn't right" → updateTaskSchedule (what the feedback sheet's cadence
 *                        and season chips resolve to)
 *   Review tasks       → loadItemTasksForReview → saveItemTaskReview
 *
 * Before this, the same monthly → quarterly change left the date alone on the
 * first, moved it to today + 3 months on the second, and left it alone on the
 * third — and a seasonal change parked the task ten years out. Each case below
 * makes the SAME change through all three and reads the documents back: the
 * date, the snooze, the template ↔ open-occurrence agreement, the completion
 * history (never rewritten), and what a SECOND household member reads.
 *
 *   npm run emu   # then:
 *   npm run seed:emu
 *   VITE_USE_EMULATORS=true VITE_FIREBASE_PROJECT_ID=demo-homehub \
 *     npx vitest run src/modules/care/services/cadenceRule.integration.test.ts
 *
 * Owns its fixtures: one item per editor (`cad-rule-*`), templates and
 * instances hard-deleted and rewritten before each case.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest"
import { deleteApp, initializeApp, type FirebaseApp } from "firebase/app"
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, signInWithEmailAndPassword } from "firebase/auth"
import {
  collection, connectFirestoreEmulator, deleteDoc, doc, getDoc, getDocs, getFirestore, query, setDoc, where,
  type DocumentData, type Firestore,
} from "firebase/firestore"
import { auth, db, firebaseApp } from "@/integrations/firebase"
import { EMULATOR_PORTS } from "@/integrations/firebase/app"
import { setTaskCadence } from "./taskService"
import { updateTaskSchedule } from "./taskScheduleService"
import { loadItemTasksForReview, saveItemTaskReview } from "./taskReviewService"
import { SEASON_NEEDED } from "./cadenceChangeService"
import { submitTaskFeedback } from "./taskFeedbackService"
import { rowsFrom } from "@/components/manuals/reviewRows"
import type { ScheduleType, Season } from "@/integrations/types"
import type { ServiceResult } from "./careNoteService"

const HOME = "e2e-home"
const PROJECT = "demo-homehub"
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

type Change = { scheduleType: ScheduleType; intervalDays?: number | null; season?: Season | null }
type Editor = { name: string; item: string; apply: (tplId: string, c: Change) => Promise<ServiceResult<unknown>> }

const EDITORS: Editor[] = [
  {
    name: "Your reminders (setTaskCadence)",
    item: "cad-rule-reminders",
    apply: (id, c) => setTaskCadence(HOME, id, c.scheduleType, c.intervalDays ?? null, c.season ?? null),
  },
  {
    name: "This isn't right (updateTaskSchedule)",
    item: "cad-rule-feedback",
    apply: (id, c) =>
      updateTaskSchedule(HOME, id, { schedule: { scheduleType: c.scheduleType, intervalDays: c.intervalDays ?? undefined, season: c.season ?? null } }, "feedback"),
  },
  {
    name: "Review tasks (saveItemTaskReview)",
    item: "cad-rule-review",
    apply: async (id, c) => {
      const loaded = await loadItemTasksForReview(HOME, "cad-rule-review")
      if (loaded.error) return loaded
      const review = loaded.data!
      const tasks = review.preview.tasks.map((t) =>
        t.template_id === id ? { ...t, schedule_type: c.scheduleType, interval_days: c.intervalDays ?? null, season: c.season ?? t.season ?? null } : t,
      )
      return saveItemTaskReview({
        homeId: HOME, itemUnitId: "cad-rule-review", templateIds: review.templateIds, manualById: review.manualById,
        shownTemplateIds: rowsFrom(review.preview, false).flatMap((r) => (r.task?.template_id ? [r.task.template_id] : [])),
        tasks, chunks: [],
      })
    },
  },
]

const template = (item: string, title: string, over: Record<string, unknown> = {}) => ({
  scopeType: "item_unit", itemUnitId: item, roomId: null, title, description: null,
  careType: "maintenance", careTypeOverriddenAt: null, justification: null, symptomTags: [], reCheckTriggers: [],
  priorityTier: "recommended", remindEnabled: null, riskLevel: "performance", estimatedMinutes: 10,
  defaultAssignee: null, instructionsChunkId: null, instructionsOverride: null, steps: null, sourcePage: null,
  suppliesMode: "none", supplies: [], source: "manual", isUserEditable: true, userModifiedAt: null, isActive: true,
  metadata: {}, manualId: null, externalKey: null,
  schedule: { scheduleType: "monthly", intervalDays: null, anchorDate: "2026-03-01", season: null, windowDaysBefore: 7, windowDaysAfter: 14 },
  createdAt: new Date("2026-03-01T18:00:00Z"), updatedAt: new Date(), deletedAt: null,
  ...over,
})
const instance = (tpl: string, item: string, status: "scheduled" | "snoozed" | "done", over: Record<string, unknown> = {}) => ({
  homeId: HOME, taskTemplateId: tpl, itemUnitId: item, status, dueDate: "2026-10-14", snoozedUntil: null,
  priorityScore: 60, isSafetyCritical: false, completedAt: null, completionNotes: null, completionPhotos: [], assignedTo: null,
  title: "Clean the pre-filter", priorityTier: "recommended", careType: "maintenance", scopeType: "item_unit", estimatedMinutes: 10,
  scheduleType: "monthly", itemName: null, roomName: null, createdAt: new Date(), updatedAt: new Date(), deletedAt: null,
  ...over,
})
/** A completion as completeTask stamps it: noon UTC of the day. */
const DONE_ON = "2026-09-14"
const done = (tpl: string, item: string, id: string) =>
  [id, instance(tpl, item, "done", { dueDate: "2026-09-10", completedAt: new Date(`${DONE_ON}T12:00:00Z`), completionNotes: "New pre-filter" })] as const

async function wipe(item: string) {
  const tpls = await getDocs(query(collection(db, `homes/${HOME}/taskTemplates`), where("itemUnitId", "==", item)))
  const insts = await getDocs(query(collection(db, `homes/${HOME}/taskInstances`), where("itemUnitId", "==", item)))
  await Promise.all([...tpls.docs, ...insts.docs].map((d) => deleteDoc(d.ref)))
}
async function seed(item: string, tplId: string, tplOver: Record<string, unknown>, instances: (readonly [string, Record<string, unknown>])[]) {
  await wipe(item)
  await setDoc(doc(db, `homes/${HOME}/taskTemplates/${tplId}`), template(item, "Clean the pre-filter", tplOver))
  await Promise.all(instances.map(([id, d]) => setDoc(doc(db, `homes/${HOME}/taskInstances/${id}`), d)))
}
const instancesOf = async (tplId: string, store: Firestore = db) =>
  (await getDocs(query(collection(store, `homes/${HOME}/taskInstances`), where("taskTemplateId", "==", tplId)))).docs
const openOf = async (tplId: string, store: Firestore = db) =>
  (await instancesOf(tplId, store)).filter((d) => d.get("deletedAt") == null && ["scheduled", "snoozed"].includes(d.get("status")))
const tplOf = async (tplId: string, store: Firestore = db) => (await getDoc(doc(store, `homes/${HOME}/taskTemplates/${tplId}`))).data()!

/** The completion record, field for field — history is never rewritten. */
const historyShape = (d: DocumentData) => ({
  status: d.status, dueDate: d.dueDate, completionNotes: d.completionNotes,
  completedAt: d.completedAt?.toDate?.().toISOString(), deletedAt: d.deletedAt,
})

describe.skipIf(import.meta.env.VITE_USE_EMULATORS !== "true")("one cadence rule across all three editors (emulator)", () => {
  let second: FirebaseApp | null = null
  let secondDb: Firestore

  beforeAll(async () => {
    await signInWithEmailAndPassword(auth, "e2e@homehub.test", "E2eTest!2026")
    second = initializeApp(firebaseApp.options, `cad-rule-second-${Date.now()}`)
    const secondAuth = getAuth(second)
    connectAuthEmulator(secondAuth, `http://127.0.0.1:${EMULATOR_PORTS.auth}`, { disableWarnings: true })
    secondDb = getFirestore(second)
    connectFirestoreEmulator(secondDb, "127.0.0.1", EMULATOR_PORTS.firestore)
    const email = "cad-rule-partner@homehub.test", password = "CadRulePartner!2026"
    const cred = await createUserWithEmailAndPassword(secondAuth, email, password)
      .catch(() => signInWithEmailAndPassword(secondAuth, email, password))
    // Joining is the acceptInvite callable (Admin SDK) in the app; the emulator's
    // owner credential stands in for it.
    const res = await fetch(
      `http://127.0.0.1:${EMULATOR_PORTS.firestore}/v1/projects/${PROJECT}/databases/(default)/documents/homes/${HOME}/members/${cred.user.uid}`,
      {
        method: "PATCH",
        headers: { Authorization: "Bearer owner", "Content-Type": "application/json" },
        body: JSON.stringify({ fields: { uid: { stringValue: cred.user.uid }, role: { stringValue: "member" }, isPrimary: { booleanValue: true }, joinedAt: { timestampValue: new Date().toISOString() } } }),
      },
    )
    expect(res.ok).toBe(true)
  })
  afterAll(async () => {
    for (const e of EDITORS) await wipe(e.item)
    if (second) await deleteApp(second)
  })

  describe("monthly → quarterly, done on Sep 14: all three land on Dec 14", () => {
    const results = new Map<string, { due: string; type: string; tplType: string }>()
    beforeEach(async () => {
      for (const e of EDITORS) {
        await seed(e.item, `${e.item}-tpl`, {}, [
          done(`${e.item}-tpl`, e.item, `${e.item}-done`),
          [`${e.item}-open`, instance(`${e.item}-tpl`, e.item, "scheduled", { dueDate: "2026-10-14" })],
        ])
      }
    })

    for (const e of EDITORS) {
      it(e.name, async () => {
        const before = historyShape((await getDoc(doc(db, `homes/${HOME}/taskInstances/${e.item}-done`))).data()!)
        const res = await e.apply(`${e.item}-tpl`, { scheduleType: "quarterly" })
        expect(res.error).toBeNull()

        const open = await openOf(`${e.item}-tpl`)
        expect(open.map((d) => [d.id, d.get("dueDate"), d.get("scheduleType"), d.get("status")]))
          .toEqual([[`${e.item}-open`, "2026-12-14", "quarterly", "scheduled"]])
        // Marked as the rule's date (rollForward leaves it alone), and re-scored
        // for its new date: recommended 60 + performance 20, not due within 14 days.
        expect([open[0].get("dueSource"), open[0].get("priorityScore")]).toEqual(["cadence_rule", 80])
        // Template ↔ open occurrence agree.
        const tpl = await tplOf(`${e.item}-tpl`)
        expect(tpl.schedule.scheduleType).toBe("quarterly")
        expect(tpl.schedule.anchorDate).toBe("2026-03-01") // the merge kept the rest of the schedule
        // History: the completion is exactly as it was.
        expect(historyShape((await getDoc(doc(db, `homes/${HOME}/taskInstances/${e.item}-done`))).data()!)).toEqual(before)
        // The other member of the household reads the same.
        const [o2] = await openOf(`${e.item}-tpl`, secondDb)
        expect([o2.get("dueDate"), o2.get("scheduleType")]).toEqual(["2026-12-14", "quarterly"])
        expect((await tplOf(`${e.item}-tpl`, secondDb)).schedule.scheduleType).toBe("quarterly")
        results.set(e.name, { due: open[0].get("dueDate"), type: open[0].get("scheduleType"), tplType: tpl.schedule.scheduleType })
      })
    }

    it("…and the three agree with each other", () => {
      expect(results.size).toBe(3)
      expect(new Set([...results.values()].map((r) => JSON.stringify(r))).size).toBe(1)
    })
  })

  describe("monthly → every 2 weeks: from the last completion, overdue if that is past", () => {
    for (const e of EDITORS) {
      it(e.name, async () => {
        await seed(e.item, `${e.item}-tpl`, {}, [
          done(`${e.item}-tpl`, e.item, `${e.item}-done`),
          [`${e.item}-open`, instance(`${e.item}-tpl`, e.item, "scheduled")],
        ])
        expect((await e.apply(`${e.item}-tpl`, { scheduleType: "every_n_days", intervalDays: 14 })).error).toBeNull()
        const [open] = await openOf(`${e.item}-tpl`)
        expect(open.get("dueDate")).toBe("2026-09-28")
        // Overdue now, and scored that way (+60), so the dashboard orders it so.
        expect(open.get("priorityScore")).toBe(140)
        expect((await tplOf(`${e.item}-tpl`)).schedule.intervalDays).toBe(14)
      })
    }
  })

  describe("snoozes: kept only when they end after the new date", () => {
    for (const e of EDITORS) {
      it(`${e.name} — a later snooze is kept`, async () => {
        await seed(e.item, `${e.item}-tpl`, {}, [
          done(`${e.item}-tpl`, e.item, `${e.item}-done`),
          [`${e.item}-open`, instance(`${e.item}-tpl`, e.item, "snoozed", { snoozedUntil: "2027-01-05" })],
        ])
        expect((await e.apply(`${e.item}-tpl`, { scheduleType: "quarterly" })).error).toBeNull()
        const [open] = await openOf(`${e.item}-tpl`)
        expect([open.get("dueDate"), open.get("status"), open.get("snoozedUntil")]).toEqual(["2026-12-14", "snoozed", "2027-01-05"])
      })
      it(`${e.name} — an earlier snooze is dropped`, async () => {
        await seed(e.item, `${e.item}-tpl`, {}, [
          done(`${e.item}-tpl`, e.item, `${e.item}-done`),
          [`${e.item}-open`, instance(`${e.item}-tpl`, e.item, "snoozed", { snoozedUntil: "2026-11-01" })],
        ])
        expect((await e.apply(`${e.item}-tpl`, { scheduleType: "quarterly" })).error).toBeNull()
        const [open] = await openOf(`${e.item}-tpl`)
        expect([open.get("dueDate"), open.get("status"), open.get("snoozedUntil")]).toEqual(["2026-12-14", "scheduled", null])
      })
    }
  })

  describe("seasonal: asks when the season is unknown; uses it when known", () => {
    for (const e of EDITORS) {
      it(`${e.name} — no season: refused, nothing written, nothing parked ten years out`, async () => {
        await seed(e.item, `${e.item}-tpl`, {}, [[`${e.item}-open`, instance(`${e.item}-tpl`, e.item, "scheduled")]])
        const res = await e.apply(`${e.item}-tpl`, { scheduleType: "seasonal" })
        expect(res.data).toBeNull()
        expect(res.error?.message).toMatch(e.item === "cad-rule-review" ? /Pick a season for/ : new RegExp(SEASON_NEEDED))
        expect((await tplOf(`${e.item}-tpl`)).schedule.scheduleType).toBe("monthly")
        const [open] = await openOf(`${e.item}-tpl`)
        expect([open.get("dueDate"), open.get("scheduleType")]).toEqual(["2026-10-14", "monthly"])
      })
      it(`${e.name} — with the season asked for: its next window after the last completion`, async () => {
        await seed(e.item, `${e.item}-tpl`, {}, [
          done(`${e.item}-tpl`, e.item, `${e.item}-done`),
          [`${e.item}-open`, instance(`${e.item}-tpl`, e.item, "scheduled")],
        ])
        expect((await e.apply(`${e.item}-tpl`, { scheduleType: "seasonal", season: "spring" })).error).toBeNull()
        const [open] = await openOf(`${e.item}-tpl`)
        expect([open.get("dueDate"), open.get("scheduleType")]).toEqual(["2027-04-15", "seasonal"])
        expect((await tplOf(`${e.item}-tpl`)).schedule).toMatchObject({ scheduleType: "seasonal", season: "spring" })
      })
    }
  })

  describe("as needed: the open occurrence goes, the completion stays", () => {
    for (const e of EDITORS) {
      it(e.name, async () => {
        await seed(e.item, `${e.item}-tpl`, {}, [
          done(`${e.item}-tpl`, e.item, `${e.item}-done`),
          [`${e.item}-open`, instance(`${e.item}-tpl`, e.item, "snoozed", { snoozedUntil: "2026-11-30" })],
        ])
        expect((await e.apply(`${e.item}-tpl`, { scheduleType: "as_needed" })).error).toBeNull()
        expect(await openOf(`${e.item}-tpl`)).toHaveLength(0)
        const all = await instancesOf(`${e.item}-tpl`)
        expect(all.find((d) => d.id === `${e.item}-open`)!.get("deletedAt")).not.toBeNull()
        const kept = all.find((d) => d.id === `${e.item}-done`)!
        expect([kept.get("status"), kept.get("deletedAt")]).toEqual(["done", null])
      })
    }
  })

  describe("a task with nothing open, never done: gets one at the day added + the cadence", () => {
    for (const e of EDITORS) {
      it(e.name, async () => {
        await seed(e.item, `${e.item}-tpl`, {
          schedule: { scheduleType: "as_needed", intervalDays: null, anchorDate: "2026-10-01", season: null, windowDaysBefore: 7, windowDaysAfter: 14 },
          createdAt: new Date("2026-10-01T18:00:00Z"),
        }, [])
        expect((await e.apply(`${e.item}-tpl`, { scheduleType: "quarterly" })).error).toBeNull()
        const open = await openOf(`${e.item}-tpl`)
        expect(open).toHaveLength(1)
        const d = open[0].data()
        expect([d.dueDate, d.status, d.scheduleType]).toEqual(["2027-01-01", "scheduled", "quarterly"])
        // The denormalized display set every surface reads (§5).
        expect([d.title, d.careType, d.priorityTier, d.scopeType, d.deletedAt]).toEqual(["Clean the pre-filter", "maintenance", "recommended", "item_unit", null])
        const [o2] = await openOf(`${e.item}-tpl`, secondDb)
        expect(o2.get("dueDate")).toBe("2027-01-01")
      })
    }
  })

  it("Review tasks: 'I've been doing this already' is kept on the task, and a LATER change elsewhere counts from it", async () => {
    const e = EDITORS[2]
    await seed(e.item, `${e.item}-tpl`, {}, [
      done(`${e.item}-tpl`, e.item, `${e.item}-done`),
      [`${e.item}-open`, instance(`${e.item}-tpl`, e.item, "scheduled")],
    ])
    const loaded = (await loadItemTasksForReview(HOME, e.item)).data!
    const res = await saveItemTaskReview({
      homeId: HOME, itemUnitId: e.item, templateIds: loaded.templateIds, manualById: loaded.manualById,
      shownTemplateIds: [`${e.item}-tpl`],
      tasks: loaded.preview.tasks.map((t) => ({ ...t, last_done_on: "2026-10-10" })), chunks: [],
    })
    expect(res.error).toBeNull()
    const tpl = await tplOf(`${e.item}-tpl`)
    expect(tpl.lastDoneClaimedOn).toBe("2026-10-10")
    expect((await openOf(`${e.item}-tpl`))[0].get("dueDate")).toBe("2026-11-10")
    // Not a completion: history is still the one Sep 14 record.
    expect((await instancesOf(`${e.item}-tpl`)).filter((d) => d.get("status") === "done").map((d) => d.id)).toEqual([`${e.item}-done`])

    // Later, from Your reminders: quarterly counts from the claim (Oct 10), not Sep 14.
    expect((await setTaskCadence(HOME, `${e.item}-tpl`, "quarterly", null)).error).toBeNull()
    expect((await openOf(`${e.item}-tpl`))[0].get("dueDate")).toBe("2027-01-10")
  })

  it("Tune this task: the season asked for fills a swept task with none, and never overwrites a swept task's own", async () => {
    const e = EDITORS[1]
    await wipe(e.item)
    await setDoc(doc(db, `homes/${HOME}/taskTemplates/${e.item}-primary`), template(e.item, "Service the AC"))
    await setDoc(doc(db, `homes/${HOME}/taskTemplates/${e.item}-blank`), template(e.item, "Service the heat pump"))
    await setDoc(doc(db, `homes/${HOME}/taskTemplates/${e.item}-own`), template(e.item, "Service the mini-split", {
      schedule: { scheduleType: "annual", intervalDays: null, anchorDate: "2026-03-01", season: "fall", windowDaysBefore: 7, windowDaysAfter: 14 },
    }))
    const res = await submitTaskFeedback({
      homeId: HOME, uid: auth.currentUser!.uid,
      primary: { taskTemplateId: `${e.item}-primary`, taskInstanceId: null, title: "Service the AC" },
      chip: "too_often",
      resolution: { action: "cadence", scheduleType: "seasonal", intervalDays: null, season: "spring" },
      note: null, sweepTemplateIds: [`${e.item}-blank`, `${e.item}-own`], match: null,
    })
    expect(res.error).toBeNull()
    expect((await tplOf(`${e.item}-primary`)).schedule).toMatchObject({ scheduleType: "seasonal", season: "spring" })
    expect((await tplOf(`${e.item}-blank`)).schedule).toMatchObject({ scheduleType: "seasonal", season: "spring" })
    expect((await tplOf(`${e.item}-own`)).schedule).toMatchObject({ scheduleType: "seasonal", season: "fall" })
    // Never done, added Mar 1: spring → Apr 15; its own fall → Oct 15.
    expect((await openOf(`${e.item}-own`))[0].get("dueDate")).toBe("2026-10-15")
    expect((await openOf(`${e.item}-blank`))[0].get("dueDate")).toBe("2026-04-15")
  })

  it("Review tasks: re-saving an UNCHANGED row moves nothing", async () => {
    const e = EDITORS[2]
    await seed(e.item, `${e.item}-tpl`, {}, [
      done(`${e.item}-tpl`, e.item, `${e.item}-done`),
      [`${e.item}-open`, instance(`${e.item}-tpl`, e.item, "snoozed", { dueDate: "2026-10-14", snoozedUntil: "2026-11-02" })],
    ])
    expect((await e.apply(`${e.item}-tpl`, { scheduleType: "monthly" })).error).toBeNull()
    const [open] = await openOf(`${e.item}-tpl`)
    expect([open.get("dueDate"), open.get("status"), open.get("snoozedUntil")]).toEqual(["2026-10-14", "snoozed", "2026-11-02"])
  })
})
