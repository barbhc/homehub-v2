import { test, expect } from "../fixtures"

/**
 * The 44px item photo beside the name (HH-136) — with a real upload through
 * the storage emulator, because the defect only showed once a photo existed:
 * the tile's corner controls, built for the 132px desktop tile, landed on top
 * of the picture. Owner, 2026-09-06, QA'ing the care-library branch.
 */
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
)

test.describe("emulator e2e — the item photo thumb", () => {
  test("after an upload the thumb shows the photo with nothing drawn on top of it", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/items/dishwasher")

    const add = page.getByLabel("Add a photo")
    await expect(add).toBeVisible({ timeout: 20_000 })
    await add.locator('input[type="file"]').setInputFiles({ name: "photo.png", mimeType: "image/png", buffer: PNG_1X1 })

    // Both layouts are in the DOM (the desktop tile keeps its own "Replace
    // photo" control, hidden at this width) — address the 44px thumb itself.
    const thumb = page.getByTestId("item-photo-thumb")
    await expect(thumb).toBeVisible({ timeout: 30_000 })
    await expect(thumb.locator("img")).toBeVisible({ timeout: 30_000 })

    // Still the 44px control beside the name — not a tile.
    const box = await thumb.boundingBox()
    expect(box, "thumb has a box").toBeTruthy()
    expect(box!.width).toBeLessThanOrEqual(48)
    expect(box!.height).toBeLessThanOrEqual(48)

    // The absence that IS the requirement: no control overlays the photo.
    await expect(page.getByLabel("Find a product photo").filter({ visible: true })).toHaveCount(0)
    expect(await thumb.locator("button").count()).toBe(0)

    await page.screenshot({ path: "test-results/item-photo-thumb.png", clip: { x: 0, y: 0, width: 390, height: 320 } })
  })
})
