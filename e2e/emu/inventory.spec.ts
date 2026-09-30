import { test, expect, type Page } from "@playwright/test"
import { getApps, initializeApp } from "firebase-admin/app"
import { getFirestore, Timestamp } from "firebase-admin/firestore"

/**
 * Items/inventory module against the seeded emulator — proves itemService
 * (getItemUnits) reads the seeded item_unit docs from Firestore end-to-end, and
 * (HH-158) that the list is cached: a revisit or a relaunch paints it at once,
 * a failed refresh keeps it, and a delete is never painted back from the cache.
 */
const visible = { visible: true } as const
const HOME = "e2e-home"

/** A seeded item's row/card on Items — its link, on whichever tree is showing. */
const itemLink = (page: Page, name: RegExp) => page.getByRole("link", { name }).filter(visible).first()

/**
 * Records whether the Items loading skeleton EVER rendered on /inventory in this
 * document — the new skeleton or the pre-redesign one ("Loading inventory").
 * A MutationObserver sees a skeleton that shows for a single frame, which a
 * visibility assertion made afterwards would miss.
 */
async function recordItemsSkeleton(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __itemsSkeletonSeen: boolean }
    w.__itemsSkeletonSeen = false
    new MutationObserver(() => {
      if (location.pathname !== "/inventory") return
      if (document.querySelector('[data-testid="items-skeleton"], [aria-label="Loading inventory"]')) w.__itemsSkeletonSeen = true
    }).observe(document, { childList: true, subtree: true })
  })
}
const itemsSkeletonSeen = (page: Page) =>
  page.evaluate(() => (window as unknown as { __itemsSkeletonSeen?: boolean }).__itemsSkeletonSeen)

test.describe("emulator e2e — inventory", () => {
  test("Inventory lists the seeded items (itemService.getItemUnits end-to-end)", async ({ page }) => {
    await page.goto("/inventory")
    // The summary reflects the seeded count/grouping (7 items, 3 rooms) — a stable
    // single-element proof that getItemUnits returned all seeded item_unit docs.
    await expect(page.getByText(/7 items across 3 rooms/i)).toBeVisible({ timeout: 20_000 })
    // And a specific seeded item card renders (targeted by its link).
    await expect(page.getByRole("link", { name: /Bosch 800 Series Dishwasher/ })).toBeVisible()
    await expect(page.getByRole("link", { name: /Carrier Infinity Furnace/ })).toBeVisible()
  })

  test("back from Home, the list is there at once — no skeleton, not even for a frame", async ({ page }) => {
    await page.goto("/inventory")
    await expect(itemLink(page, /Bosch 800 Series Dishwasher/)).toBeVisible({ timeout: 20_000 })

    await recordItemsSkeleton(page)
    await page.getByRole("link", { name: "Home", exact: true }).filter(visible).first().click()
    await expect(page).toHaveURL(/\/home$/)
    await expect(page.getByText("Replace HVAC furnace filter").filter(visible).first()).toBeVisible({ timeout: 20_000 })

    await page.goBack()
    await expect(page).toHaveURL(/\/inventory$/)
    // Painted from the cache in the same render as the route change. The
    // revalidation (a real emulator read) is still behind it.
    await expect(itemLink(page, /Bosch 800 Series Dishwasher/)).toBeVisible({ timeout: 1_000 })
    await expect(page.getByText(/7 items across 3 rooms/i)).toBeVisible()
    expect(await itemsSkeletonSeen(page), "the Items skeleton rendered on a back-navigation").toBe(false)
    await expect(page.getByTestId("items-skeleton")).toHaveCount(0)
    await expect(page.getByText("Still loading…")).toHaveCount(0)
  })

  test("a reload with Firestore unreachable still paints the seeded items, and says it's the last saved view", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/inventory")
    await expect(itemLink(page, /Bosch 800 Series Dishwasher/)).toBeVisible({ timeout: 20_000 })
    // The successful read persisted the list.
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem("hh-swr-dashboard-cache") ?? ""), { timeout: 10_000 })
      .toContain(`items:v1:${HOME}`)

    // Every Firestore request fails from here on: the list can only come from
    // the snapshot this device persisted.
    await page.route("**/google.firestore.v1.Firestore/**", (route) => route.abort())
    await page.reload()

    await expect(itemLink(page, /Bosch 800 Series Dishwasher/)).toBeVisible({ timeout: 15_000 })
    await expect(itemLink(page, /Carrier Infinity Furnace/)).toBeVisible()
    // The failed refresh surfaces as the quiet note — it must not replace the
    // list with "No items yet" (Firestore answers an offline read with an EMPTY
    // result from its cache, which the service reports as a failure).
    await expect(page.getByText(/Showing your last saved view/).filter(visible)).toBeVisible({ timeout: 30_000 })
    await expect(itemLink(page, /Bosch 800 Series Dishwasher/)).toBeVisible()
    await expect(page.getByText("No items yet")).toHaveCount(0)
  })

  test("a deleted item is gone from Items the moment the page comes back — never painted from the cache", async ({ page }) => {
    // Its own sentinel item, so the seeded fixture other specs count is untouched.
    if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error("FIRESTORE_EMULATOR_HOST is not set — this spec writes to the EMULATOR only")
    const app = getApps()[0] ?? initializeApp({ projectId: "demo-homehub" })
    const db = getFirestore(app)
    const ID = "e2e-cache-sentinel"
    const NAME = "Cache Sentinel Kettle"
    const now = Timestamp.now()
    await db.doc(`homes/${HOME}/items/${ID}`).set({
      roomId: "kitchen", displayName: NAME, category: "kettle", itemCategory: "small_appliance",
      brand: "Sentinel", model: "K-1", status: "active", categoryFields: {}, tags: [], variantTags: [],
      recallStatus: null, photoPath: null, createdAt: now, updatedAt: now, deletedAt: null,
    })

    try {
      await page.setViewportSize({ width: 390, height: 844 }) // "Delete item" lives on the phone item page
      await page.goto("/inventory")
      await expect(itemLink(page, new RegExp(NAME))).toBeVisible({ timeout: 20_000 })

      await itemLink(page, new RegExp(NAME)).click()
      await page.waitForURL(new RegExp(`/items/${ID}$`), { timeout: 15_000 })
      // Armed on the item page: from here, any render of /inventory that
      // includes the deleted item's row — even one frame before a refetch
      // lands — is recorded.
      await page.evaluate((href) => {
        const w = window as unknown as { __deletedSeen: boolean }
        w.__deletedSeen = false
        new MutationObserver(() => {
          if (location.pathname === "/inventory" && document.querySelector(`a[href="${href}"]`)) w.__deletedSeen = true
        }).observe(document, { childList: true, subtree: true })
      }, `/items/${ID}`)

      await page.getByRole("button", { name: "Delete item" }).filter(visible).first().click()
      await page.getByRole("dialog").getByRole("button", { name: "Delete", exact: true }).click()

      await page.waitForURL(/\/inventory$/, { timeout: 15_000 })
      await expect(itemLink(page, /Bosch 800 Series Dishwasher/)).toBeVisible({ timeout: 1_000 })
      await expect(page.getByRole("link", { name: new RegExp(NAME) })).toHaveCount(0)
      // Let the revalidation land, then prove the row never rendered at all.
      await page.waitForTimeout(1_500)
      expect(await page.evaluate(() => (window as unknown as { __deletedSeen?: boolean }).__deletedSeen), "the deleted item was painted from the cache").toBe(false)
      await expect(page.getByRole("link", { name: new RegExp(NAME) })).toHaveCount(0)
    } finally {
      // Hard-delete the sentinel whatever happened, so no later spec counts it.
      await db.doc(`homes/${HOME}/items/${ID}`).delete()
    }
  })
})
