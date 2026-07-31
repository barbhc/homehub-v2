/**
 * Integration run of the REAL saveItemTaskReview against the emulator.
 *
 * Exists because this exact function shipped a silent data-loss bug that every
 * other layer missed: set(merge) treats "schedule.scheduleType" as a literal
 * field NAME (dotted-path semantics belong to update()), so cadence edits wrote
 * a junk field and changed nothing. tsc passed, 350 unit tests passed, the save
 * reported success. Only reading the document back after calling the real
 * function caught it. The browser e2e can't cover this (the emulator's write
 * channel wedges under Playwright), so this is the authoritative save check.
 *
 * Skipped unless emulators are up:
 *   npm run emu   # then seed + inject fixtures, then:
 *   VITE_USE_EMULATORS=true VITE_FIREBASE_PROJECT_ID=demo-homehub \
 *     npx vitest run src/lib/saveItemTaskReview.integration.test.ts
 */
import { describe, it, expect } from "vitest"
import { signInWithEmailAndPassword } from "firebase/auth"
import { collection, getDocs, query, where } from "firebase/firestore"
import { auth, db } from "@/integrations/firebase"
import { loadItemTasksForReview, saveItemTaskReview } from "@/modules/care/services/taskReviewService"

const HOME = "e2e-home", ITEM = "furnace"

// Same condition as src/integrations/firebase/app.ts — and load-bearing for
// non-negotiable #7: without it, a plain `npm test` would aim this at the REAL
// project config from .env.
describe.skipIf(import.meta.env.VITE_USE_EMULATORS !== "true")("saveItemTaskReview (emulator)", () => {
  it("moves a task onto the setup schedule end to end", async () => {
    await signInWithEmailAndPassword(auth, "e2e@homehub.test", "E2eTest!2026")

    const loaded = await loadItemTasksForReview(HOME, ITEM)
    expect(loaded.error).toBeNull()
    const { preview, idByTitle, manualByTitle } = loaded.data!

    // The user's real move: "Service AC before summer" → one-time setup.
    const tasks = preview.tasks.map((t) =>
      t.title === "Service AC before summer" ? { ...t, schedule_type: "setup" as const } : t,
    )

    const res = await saveItemTaskReview({ homeId: HOME, itemUnitId: ITEM, idByTitle, manualByTitle, tasks, chunks: [] })
    expect(res.error).toBeNull()
    expect(res.data!.updated).toBeGreaterThan(0)

    // Template moved…
    const tpl = await getDocs(query(collection(db, `homes/${HOME}/taskTemplates`), where("title", "==", "Service AC before summer")))
    expect(tpl.docs[0].get("schedule.scheduleType")).toBe("setup")

    // …and its open instance is gone (the zombie that would have haunted Home).
    const tid = tpl.docs[0].id
    const inst = await getDocs(query(collection(db, `homes/${HOME}/taskInstances`), where("taskTemplateId", "==", tid)))
    const openLeft = inst.docs.filter((d) => d.get("deletedAt") == null && d.get("status") === "scheduled")
    expect(openLeft.length).toBe(0)
  }, 30_000)
})
