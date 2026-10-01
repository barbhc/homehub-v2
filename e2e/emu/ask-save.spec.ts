import { test, expect, type Page } from "@playwright/test"
import { getApps, initializeApp } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"

/**
 * Ask → Save to knowledge base, against the seeded emulator (audit H6).
 *
 * Each answer bubble carried its own save dialog and handed its `onSaved` to
 * the page, which then opened the PAGE's dialog with the same answer and a live
 * Save: one save showed two dialogs, and a second tap wrote the answer twice.
 * This walks the real page at a phone and a desktop width and counts what the
 * EMULATOR holds afterwards — exactly one dialog, exactly one saved answer.
 *
 * The answer itself is stubbed at the network layer (no functions emulator in
 * this stack, and never a model call) — the same technique chat.spec.ts uses.
 * Everything after the answer — the dialog, the item list, the write — is real.
 */
const visible = { visible: true } as const
const HOME = "e2e-home"
const ANSWER = "Every three months, or monthly in a dusty house."

/** The admin SDK the seed uses. Refuses without FIRESTORE_EMULATOR_HOST, so it
 *  can never read a real project. */
function emulatorDb() {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error("FIRESTORE_EMULATOR_HOST is not set — this spec reads the EMULATOR only")
  }
  return getFirestore(getApps()[0] ?? initializeApp({ projectId: "demo-homehub" }))
}

async function savedAnswersFor(question: string): Promise<number> {
  const snap = await emulatorDb().collection(`homes/${HOME}/chatFaqs`).where("question", "==", question).get()
  return snap.size
}

async function askAndAnswer(page: Page, question: string) {
  await page.route("**/chatQuery", async (route) => {
    if (route.request().method() !== "POST") return route.continue()
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: `data: ${JSON.stringify({ delta: ANSWER })}\n\ndata: {"done":true,"sources":[]}\n\n`,
    })
  })
  await page.goto("/chat")
  const composer = page.getByRole("textbox", { name: "Message" }).filter(visible).first()
  await composer.fill(question)
  await composer.press("Enter")
  await expect(page.getByText(ANSWER).filter(visible).first()).toBeVisible({ timeout: 15_000 })
}

for (const vp of [
  { name: "phone", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 900 },
]) {
  test.describe(`emulator e2e — Ask, Save to knowledge base (${vp.name}, ${vp.width}px)`, () => {
    test("one save opens exactly one dialog and writes exactly one saved answer", async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height })
      // Unique per run and per width: the specs in one run share the seeded home.
      const question = `How often does the furnace filter need changing? (${vp.name} ${Date.now()})`
      await askAndAnswer(page, question)
      expect(await savedAnswersFor(question)).toBe(0)

      await page.getByRole("button", { name: "Save to knowledge base" }).filter(visible).first().click()
      const dialog = page.getByRole("dialog")
      await expect(dialog).toHaveCount(1)
      await expect(dialog).toBeVisible()
      await expect(dialog.getByText(question)).toBeVisible()

      // An unscoped question: the person picks the item it belongs to.
      await dialog.getByRole("combobox").click()
      await page.getByRole("option").first().click()
      const save = dialog.getByRole("button", { name: "Save" })
      await expect(save).toBeEnabled()
      await save.click()

      await expect(page.getByText("Saved to knowledge base").filter(visible).first()).toBeVisible({ timeout: 10_000 })
      // The dialog closes — and NO second one opens with the same answer and a
      // live Save (the bug arrived after the first dialog's close delay, so
      // look again after it).
      await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 5_000 })
      await page.waitForTimeout(1_500)
      await expect(page.getByRole("dialog")).toHaveCount(0)

      await expect.poll(() => savedAnswersFor(question), { timeout: 10_000 }).toBe(1)
      expect(await savedAnswersFor(question)).toBe(1)
    })
  })
}
