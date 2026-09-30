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

/**
 * HH-28 — an answer that stops before it finishes.
 *
 * The chatQuery stream is stubbed at the network layer (this run has no
 * functions emulator), the same technique the OCR specs use. The first answer
 * streams a few words and the connection closes with no `done` — the case that
 * left a blinking cursor and a locked composer until a reload. The second is
 * whole, and arrives through Try again.
 */
test.describe("emulator e2e — Ask, when an answer stops short (HH-28)", () => {
  test("a stream that closes unfinished unlocks the composer and offers Try again", async ({ page }) => {
    let answers = 0
    await page.route("**/chatQuery", async (route) => {
      if (route.request().method() !== "POST") return route.continue()
      answers += 1
      const body = answers === 1
        ? 'data: {"delta":"Run the descale"}\n\n'
        : 'data: {"delta":"Run the descale cycle once a month."}\n\ndata: {"done":true,"sources":[]}\n\n'
      await route.fulfill({ status: 200, contentType: "text/event-stream", body })
    })

    await page.goto("/chat")
    const composer = page.getByRole("textbox", { name: "Message" }).filter(visible).first()
    await composer.fill("How often should I descale the dishwasher?")
    await composer.press("Enter")

    await expect(page.getByText("The answer stopped before it finished.").filter(visible).first())
      .toBeVisible({ timeout: 15_000 })
    // Unlocked: the next question can be typed without a reload.
    await expect(page.getByRole("textbox", { name: "Message" }).filter(visible).first()).toBeEnabled()

    // The failure offers the one next step, and it asks the same question again.
    await page.getByRole("button", { name: "Try again" }).filter(visible).first().click()
    await expect(page.getByText("Run the descale cycle once a month.").filter(visible).first())
      .toBeVisible({ timeout: 15_000 })
    await expect(page.getByText("The answer stopped before it finished.")).toHaveCount(0)
    expect(answers).toBe(2)
  })
})
