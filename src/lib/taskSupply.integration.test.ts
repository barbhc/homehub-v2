/**
 * Integration run of the REAL updateTaskSupply against the emulator — the
 * clobber test. The supplies array is written whole, so the thing worth
 * proving is that patching row 1 cannot lose a sibling row 0 the parse wrote.
 *
 * Needs emulators + seed (same contract as saveItemTaskReview.integration):
 *   npm run emu   # in another shell
 *   VITE_USE_EMULATORS=true VITE_FIREBASE_PROJECT_ID=demo-homehub \
 *     npx vitest run src/lib/taskSupply.integration.test.ts
 */
import { describe, it, expect, beforeAll } from "vitest"
import { doc, setDoc, getDoc } from "firebase/firestore"
import { signInWithEmailAndPassword } from "firebase/auth"
import { db, auth } from "@/integrations/firebase"
import { updateTaskSupply } from "@/modules/care/services/taskService"

const HOME = "e2e-home"
const TPL = "tpl-supply-integration"

describe.skipIf(import.meta.env.VITE_USE_EMULATORS !== "true")("updateTaskSupply (emulator)", () => {
  beforeAll(async () => {
    // Same seeded identity saveItemTaskReview.integration uses (e2e/seed-config
    // is node-only and must not be imported into the app program).
    await signInWithEmailAndPassword(auth, "e2e@homehub.test", "E2eTest!2026")
    await setDoc(doc(db, `homes/${HOME}/taskTemplates/${TPL}`), {
      title: "Replace the furnace filter",
      itemUnitId: "furnace",
      isActive: true,
      deletedAt: null,
      supplies: [
        { name: "Foam pre-filter", category: "filter", partNumber: "PF-1" },
        { name: "Furnace filter", category: "filter", partNumber: "FPR10" },
      ],
    })
  })

  it("patches one row and leaves the parse-written sibling untouched", async () => {
    const res = await updateTaskSupply(HOME, TPL, 1, {
      url: "https://filterbuy.com/16x25x1",
      size: "16x25x1",
      buy_ahead: true,
    })
    expect(res.error).toBeNull()
    expect(res.data?.url).toBe("https://filterbuy.com/16x25x1")

    const snap = await getDoc(doc(db, `homes/${HOME}/taskTemplates/${TPL}`))
    const rows = snap.data()!.supplies as Array<Record<string, unknown>>
    expect(rows).toHaveLength(2)
    // the sibling is byte-for-byte what the parse wrote — no invented fields
    expect(rows[0]).toEqual({ name: "Foam pre-filter", category: "filter", partNumber: "PF-1" })
    expect(rows[1].url).toBe("https://filterbuy.com/16x25x1")
    expect(rows[1].buyAhead).toBe(true)
    expect(rows[1].partNumber).toBe("FPR10")
  })

  it("refuses an index that no longer exists", async () => {
    const res = await updateTaskSupply(HOME, TPL, 7, { url: "https://x.example" })
    expect(res.data).toBeNull()
    expect(res.error?.message).toMatch(/no longer exists/)
  })
})
