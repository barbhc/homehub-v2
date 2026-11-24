import { test, expect, type Page } from "@playwright/test"
import { getApps, initializeApp } from "firebase-admin/app"
import { FieldValue, getFirestore } from "firebase-admin/firestore"

/**
 * Your home › The basics · the zip for a home from before the first minute
 * (D8 edge case; mock https://claude.ai/artifact/CvrAvWEQr7wGao9wbAAtUm,
 * approved 2026-11-19), against the seeded emulator: the zip is looked up from
 * the bundled table, written through the real homeProfileService, and read
 * back from Firestore.
 *
 * The seeded home has no zip and no climate. Each walk sets the climate it
 * needs with the admin SDK and puts the seed back after, because specs in one
 * run share the emulator.
 */
const HOME = "e2e-home"
const FIELDS = ["zip", "area", "climate", "freezeRisk", "climateSource"] as const

function homeDoc() {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error("FIRESTORE_EMULATOR_HOST is not set — this spec writes to the EMULATOR only")
  const app = getApps()[0] ?? initializeApp({ projectId: "demo-homehub" })
  return getFirestore(app).doc(`homes/${HOME}`)
}

async function setClimate(fields: Partial<Record<(typeof FIELDS)[number], unknown>>) {
  const reset = Object.fromEntries(FIELDS.map((f) => [f, FieldValue.delete()]))
  await homeDoc().set({ ...reset, ...fields }, { merge: true })
}

async function openProfile(page: Page) {
  // The basics left Settings for Your home (design/settings-your-home.md).
  await page.goto("/your-home?part=basics")
  const section = page.getByTestId("your-home")
  await expect(section.getByLabel("Zip code")).toBeVisible({ timeout: 15_000 })
  return section
}

test.describe("Your home › the zip for an existing home", () => {
  test.afterAll(async () => {
    await setClimate({})
  })

  test("an owner's own climate stays hers: the zip is saved, her answer is not overwritten", async ({ page }) => {
    await setClimate({ climate: "moderate", freezeRisk: true })
    const section = await openProfile(page)
    await section.getByLabel("Zip code").fill("94110")

    await expect(section.getByText("94110 · San Francisco County")).toBeVisible()
    await expect(section.getByText("Pipes rarely freeze here")).toBeVisible()
    const offer = section.getByTestId("zip-climate-offer")
    await expect(offer).toContainText("Your zip suggests Mild — rarely freezes")
    await expect(section.getByRole("combobox", { name: "Local climate" })).toHaveText(/Moderate — some frost/)

    await section.getByRole("button", { name: "Save" }).click()
    await expect(section.getByText("Saved")).toBeVisible({ timeout: 15_000 })

    const d = (await homeDoc().get()).data()!
    expect(d.zip).toBe("94110")
    expect(d.area).toMatchObject({ county: "San Francisco County", hazards: ["earthquake"], hardinessZone: "10b" })
    expect(d.climate).toBe("moderate")
    expect(d.freezeRisk).toBe(true)
    expect(d.climateSource).toBe("owner")

    // A fresh read shows the saved zip with its county, and no offer.
    const again = await openProfile(page)
    await expect(again.getByLabel("Zip code")).toHaveValue("94110")
    await expect(again.getByText("San Francisco County. It stays in Homehub.")).toBeVisible()
    await expect(again.getByTestId("zip-climate-offer")).toHaveCount(0)
  })

  test("a home with no climate answer takes the zip's", async ({ page }) => {
    await setClimate({})
    const section = await openProfile(page)
    await section.getByLabel("Zip code").fill("94110")
    await expect(section.getByTestId("climate-from-zip")).toBeVisible()
    await expect(section.getByRole("combobox", { name: "Local climate" })).toHaveText(/Mild — rarely freezes/)

    await section.getByRole("button", { name: "Save" }).click()
    await expect(section.getByText("Saved")).toBeVisible({ timeout: 15_000 })

    const d = (await homeDoc().get()).data()!
    expect(d).toMatchObject({ zip: "94110", climate: "mild", freezeRisk: false, climateSource: "zip" })
  })
})
