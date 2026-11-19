/**
 * A library task added because it is worth doing NOW gets its first date now
 * (D8, design/first-minute-onboarding.md, "Two things the build must change
 * outside onboarding", 1). Found on the emulator on 2026-11-18: an alarm test
 * added that day was first due 2027-05-18 — six months off Home's week.
 *
 * Against the emulator with the real rules:
 *   npm run emu   # then:
 *   npm run seed:emu
 *   VITE_USE_EMULATORS=true VITE_FIREBASE_PROJECT_ID=demo-homehub \
 *     npx vitest run src/modules/care/services/libraryFirstDue.integration.test.ts
 *
 * Writes only the tasks it adds, and deletes them.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { signInWithEmailAndPassword } from "firebase/auth"
import { collection, deleteDoc, doc, getDocs, query, where } from "firebase/firestore"
import { auth, db } from "@/integrations/firebase"
import { addLibraryTask } from "./careSuggestionService"
import { entryByKey } from "../../../../shared/care/library"
import { addDays, addMonths, localToday } from "../../../../shared/dates/calendar"

const HOME = "e2e-home"
const E2E = { email: "e2e@homehub.test", password: "E2eTest!2026" }
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

const created: string[] = []
async function occurrences(templateId: string) {
  const s = await getDocs(query(collection(db, `homes/${HOME}/taskInstances`), where("taskTemplateId", "==", templateId)))
  return s.docs.map((d) => ({ ref: d.ref, ...d.data() }) as { ref: typeof d.ref; dueDate: string; status: string; dueSource: string | null; deletedAt: unknown })
}

describe.skipIf(import.meta.env.VITE_USE_EMULATORS !== "true")("a library task's first due date (emulator)", () => {
  beforeAll(async () => {
    await signInWithEmailAndPassword(auth, E2E.email, E2E.password)
  })
  afterAll(async () => {
    for (const id of created) {
      for (const o of await occurrences(id)) await deleteDoc(o.ref)
      await deleteDoc(doc(db, `homes/${HOME}/taskTemplates/${id}`))
    }
  })

  it("with firstDue: ONE occurrence, on that date, inside Home's week", async () => {
    const due = addDays(localToday(), 3)
    const res = await addLibraryTask(HOME, null, entryByKey("home.alarm_test")!, { firstDue: due })
    expect(res.error).toBeNull()
    created.push(res.data!.task_template_id)
    const live = (await occurrences(res.data!.task_template_id)).filter((o) => o.deletedAt == null)
    expect(live.map((o) => [o.dueDate, o.status])).toEqual([[due, "scheduled"]])
    // Stamped as the rule's own date, so the nightly roll-forward never pushes
    // a missed weekend a whole cadence away.
    expect(live[0].dueSource).toBe("cadence_rule")
  })

  it("without it: unchanged — one full cadence out (the Settings and item-page adds)", async () => {
    const res = await addLibraryTask(HOME, null, entryByKey("home.extinguisher")!)
    expect(res.error).toBeNull()
    created.push(res.data!.task_template_id)
    const live = (await occurrences(res.data!.task_template_id)).filter((o) => o.deletedAt == null)
    expect(live.map((o) => o.dueDate)).toEqual([addMonths(localToday(), 12)])
  })

  it("a refused add leaves nothing behind: the template it had written is rolled back", async () => {
    const res = await addLibraryTask(HOME, null, entryByKey("home.water_heater")!, { firstDue: "next Saturday" })
    expect(res.error?.message).toBe("That date isn't valid.")
    const tpl = await getDocs(query(collection(db, `homes/${HOME}/taskTemplates`), where("externalKey", "==", "library:home.water_heater")))
    for (const d of tpl.docs) {
      created.push(d.id)
      expect(d.data().deletedAt, "rolled back").not.toBeNull()
      expect((await occurrences(d.id)).filter((o) => o.deletedAt == null)).toEqual([])
    }
  })
})
