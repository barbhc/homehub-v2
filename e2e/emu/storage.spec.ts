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

    // Drive the hidden photo file input (image/* only — not the receipt input).
    const input = page.locator('input[type="file"][accept="image/*"]').first()
    await input.setInputFiles({ name: "furnace.png", mimeType: "image/png", buffer: Buffer.from(PNG_BASE64, "base64") })

    // uploadItemPhoto → Storage emulator + item.photoPath persisted → getPhotoUrl
    // yields an emulator URL the <img> renders from. Assert the element is in the
    // DOM (the page renders mobile+desktop copies; only one is visible).
    await expect(page.locator('img[src*="127.0.0.1:9199"]').first()).toBeAttached({ timeout: 15_000 })
  })
})
