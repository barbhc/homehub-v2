import { test, expect } from "@playwright/test"

/**
 * Storage round-trip against the seeded emulator — proves storageService's
 * uploadItemPhoto works end-to-end: the file lands in the Storage emulator, the
 * item doc's photoPath is persisted, and useStorageUrl resolves a token-bearing
 * emulator URL the <img> renders from (reads are signed-in-only now — the token
 * is what lets a plain <img> fetch). Requires the storage emulator (wired into
 * test:e2e:emu).
 */

// 1x1 transparent PNG.
const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="

test.describe("emulator e2e — storage (uploadItemPhoto)", () => {
  test("uploading an item photo stores it and renders from the emulator", async ({ page }) => {
    await page.goto("/items/furnace")
    await expect(page.getByText("Carrier Infinity Furnace").filter({ visible: true }).first()).toBeVisible({ timeout: 20_000 })

    // Photo upload lives in HeroCard, which mounts only inside the Edit dialog.
    // This used to pass by driving a file input in the legacy layout — markup
    // that was `display:none` and unreachable by any user, so the test proved
    // the service worked through a path nobody could take. Drive the real one.
    await page.getByRole("button", { name: /^Edit$/ }).first().click()
    const dialog = page.getByRole("dialog")
    await expect(dialog).toBeVisible({ timeout: 10_000 })

    // The photo input (image/* only — not the receipt input).
    const input = dialog.locator('input[type="file"][accept="image/*"]').first()
    await input.setInputFiles({ name: "furnace.png", mimeType: "image/png", buffer: Buffer.from(PNG_BASE64, "base64") })

    // uploadItemPhoto → Storage emulator + item.photoPath persisted → getPhotoUrl
    // yields an emulator URL the <img> renders from. Assert the element is in the
    // DOM (the page renders mobile+desktop copies; only one is visible).
    await expect(page.locator('img[src*="127.0.0.1:9199"]').first()).toBeAttached({ timeout: 15_000 })
  })

  test("mobile: tapping Add photo uploads and renders the image", async ({ page }) => {
    // Below the lg breakpoint the desktop view (and its Edit dialog) is
    // display:none, so the phone's ONLY photo path is RefinedItemDetail's inline
    // "Add photo" tile. That button used to be inert markup — no input, no
    // handler — so adding a photo on a phone was impossible. Drive the real tile.
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto("/items/fridge")
    await expect(
      page.getByRole("heading", { name: "LG French Door Refrigerator" }).filter({ visible: true }).first()
    ).toBeVisible({ timeout: 20_000 })

    // The empty-state tile is a <label> whose visible "Add photo" caption opens
    // the native file chooser (the desktop copy renders too, but display:none).
    const chooserPromise = page.waitForEvent("filechooser")
    await page.getByText("Add photo", { exact: true }).filter({ visible: true }).first().click()
    const chooser = await chooserPromise
    await chooser.setFiles({ name: "fridge.png", mimeType: "image/png", buffer: Buffer.from(PNG_BASE64, "base64") })

    // Same round-trip as above: uploadItemPhoto → Storage emulator + persisted
    // photoPath → useStorageUrl resolves the token URL the <img> renders from.
    await expect(page.locator('img[src*="127.0.0.1:9199"]').first()).toBeAttached({ timeout: 15_000 })
  })
})
