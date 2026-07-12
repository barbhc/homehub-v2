import { test, expect } from "@playwright/test"

/**
 * Ask/chat history against the seeded emulator — proves conversationService
 * reads the seeded homes/{homeId}/chatConversations docs (+ their messages
 * subcollection) from Firestore end-to-end. The seed writes 3 past
 * conversations, each with a user + a cited assistant message.
 *
 * Sending a NEW message hits the chat callable (Phase 4, still stubbed), so this
 * spec only exercises the read path: list conversations, then load one.
 */
const visible = { visible: true } as const

test.describe("emulator e2e — chat history (conversationService reads)", () => {
  test("lists a seeded conversation and loads its messages", async ({ page }) => {
    await page.goto("/chat")
    // listConversations → the rail shows a seeded conversation title.
    const convo = page.getByText("Descale Bosch dishwasher").filter(visible).first()
    await expect(convo).toBeVisible({ timeout: 20_000 })

    // getConversationMessages → clicking loads the persisted thread.
    await convo.click()
    await expect(
      page.getByText(/monthly descaling cycle/i).filter(visible).first()
    ).toBeVisible({ timeout: 10_000 })
  })
})
