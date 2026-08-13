/**
 * Integration run of the REAL task-edit writes against the emulator.
 *
 * The browser e2e can't cover this — the emulator's write channel wedges under
 * Playwright (getTaskDetail hangs at "Loading…"), which is why the sibling
 * saveItemTaskReview integration test exists too.
 *
 * The bug this is here to catch is denormalization drift, not a syntax slip.
 * `title` is copied onto every taskInstance, and Home / Tasks / the agenda all
 * read the INSTANCE copy — never the template. So an edit that updates only the
 * template type-checks, reports success, and leaves the old name on every
 * screen the owner actually looks at. That precise failure has already shipped
 * once here (a whole cleanup sweep was invisible on Home). Only reading the
 * instances back proves the sweep ran.
 *
 *   npm run emu   # then:
 *   npm run seed:emu
 *   VITE_USE_EMULATORS=true VITE_FIREBASE_PROJECT_ID=demo-homehub \
 *     npx vitest run src/modules/care/services/taskEdit.integration.test.ts
 */
import { describe, it, expect } from "vitest"
import { signInWithEmailAndPassword } from "firebase/auth"
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore"
import { auth, db } from "@/integrations/firebase"
import { updateTaskContent, rescheduleTaskInstance } from "./taskService"

const HOME = "e2e-home"

describe.skipIf(import.meta.env.VITE_USE_EMULATORS !== "true")("task edits (emulator)", () => {
  it("renames a task on the template AND every open instance", async () => {
    await signInWithEmailAndPassword(auth, "e2e@homehub.test", "E2eTest!2026")

    const openSnap = await getDocs(
      query(collection(db, `homes/${HOME}/taskInstances`), where("status", "==", "scheduled")),
    )
    expect(openSnap.size).toBeGreaterThan(0)
    const inst = openSnap.docs[0]
    const templateId = inst.get("taskTemplateId") as string
    const NEW = "Owner-renamed: swap the filter"

    const res = await updateTaskContent(HOME, templateId, {
      title: NEW,
      steps: ["Turn it off.", "Slide the old filter out.", "Note the arrow direction."],
    })
    expect(res.error).toBeNull()

    // The template took it.
    const tpl = await getDoc(doc(db, `homes/${HOME}/taskTemplates/${templateId}`))
    expect(tpl.get("title")).toBe(NEW)
    expect(tpl.get("steps")).toEqual(["Turn it off.", "Slide the old filter out.", "Note the arrow direction."])

    // …and so did the instances the agenda actually reads. This is the assertion
    // that would have failed before the sweep existed.
    const after = await getDocs(
      query(collection(db, `homes/${HOME}/taskInstances`), where("taskTemplateId", "==", templateId)),
    )
    const open = after.docs.filter((d) => ["scheduled", "snoozed"].includes(d.get("status") as string))
    expect(open.length).toBeGreaterThan(0)
    for (const d of open) expect(d.get("title")).toBe(NEW)
  })

  it("rejects a blank name instead of writing one", async () => {
    await signInWithEmailAndPassword(auth, "e2e@homehub.test", "E2eTest!2026")
    const snap = await getDocs(
      query(collection(db, `homes/${HOME}/taskInstances`), where("status", "==", "scheduled")),
    )
    const templateId = snap.docs[0].get("taskTemplateId") as string
    const before = (await getDoc(doc(db, `homes/${HOME}/taskTemplates/${templateId}`))).get("title")

    const res = await updateTaskContent(HOME, templateId, { title: "   " })
    expect(res.error?.message).toBe("A task needs a name.")
    expect((await getDoc(doc(db, `homes/${HOME}/taskTemplates/${templateId}`))).get("title")).toBe(before)
  })

  it("moves one occurrence's due date and clears any snooze", async () => {
    await signInWithEmailAndPassword(auth, "e2e@homehub.test", "E2eTest!2026")
    const snap = await getDocs(
      query(collection(db, `homes/${HOME}/taskInstances`), where("status", "==", "scheduled")),
    )
    const inst = snap.docs[0]

    const res = await rescheduleTaskInstance(HOME, inst.id, "2026-09-09")
    expect(res.error).toBeNull()

    const after = await getDoc(doc(db, `homes/${HOME}/taskInstances/${inst.id}`))
    expect(after.get("dueDate")).toBe("2026-09-09")
    expect(after.get("snoozedUntil")).toBeNull()
    expect(after.get("status")).toBe("scheduled")
  })

  it("refuses a malformed date rather than corrupting the field", async () => {
    await signInWithEmailAndPassword(auth, "e2e@homehub.test", "E2eTest!2026")
    const snap = await getDocs(
      query(collection(db, `homes/${HOME}/taskInstances`), where("status", "==", "scheduled")),
    )
    const inst = snap.docs[0]
    const res = await rescheduleTaskInstance(HOME, inst.id, "next tuesday")
    expect(res.error?.message).toBe("That date isn't valid.")
    expect((await getDoc(doc(db, `homes/${HOME}/taskInstances/${inst.id}`))).get("dueDate")).not.toBe("next tuesday")
  })
})

// Same guard as the block above, and load-bearing: without it this suite signs
// in against the REAL project on a plain `npm test`, which both fails and
// violates the never-test-against-prod rule. It was added without the guard and
// went red immediately.
describe.skipIf(import.meta.env.VITE_USE_EMULATORS !== "true")("snooze / undo (emulator)", () => {
  it("undo restores the occurrence exactly, so a swipe is never destructive", async () => {
    await signInWithEmailAndPassword(auth, "e2e@homehub.test", "E2eTest!2026")
    const { snoozeTaskInstance, unsnoozeTaskInstance } = await import("./taskService")

    const snap = await getDocs(
      query(collection(db, `homes/${HOME}/taskInstances`), where("status", "==", "scheduled")),
    )
    const inst = snap.docs[0]
    const beforeDue = inst.get("dueDate")

    const s = await snoozeTaskInstance(HOME, inst.id, "2026-09-20")
    expect(s.success).toBe(true)
    const snoozed = await getDoc(doc(db, `homes/${HOME}/taskInstances/${inst.id}`))
    expect(snoozed.get("status")).toBe("snoozed")
    expect(snoozed.get("snoozedUntil")).toBe("2026-09-20")

    const u = await unsnoozeTaskInstance(HOME, inst.id)
    expect(u.success).toBe(true)
    const restored = await getDoc(doc(db, `homes/${HOME}/taskInstances/${inst.id}`))
    expect(restored.get("status")).toBe("scheduled")
    expect(restored.get("snoozedUntil")).toBeNull()
    // The due date was never the thing snooze changed, so undo must not move it.
    expect(restored.get("dueDate")).toBe(beforeDue)
  })
})
