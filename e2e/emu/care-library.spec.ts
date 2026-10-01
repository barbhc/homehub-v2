import { test, expect } from "../fixtures"

/**
 * The care library — what an item or a home typically needs, offered where
 * the manual left a gap (design/care-library.md). Owner, 2026-09-06.
 *
 * Three surfaces, one walk each, against the seeded emulator home:
 *  - the item page's Suggested band: Add turns a suggestion into a task that
 *    carries its provenance, and "Not this one" on that task takes it back;
 *  - Your home (/home-setup): answers save as facts and unlock whole-home
 *    care, and a failed-nothing path is never shown as "nothing to set up";
 *  - the Tasks page's standing Suggested group sits LAST and never changes
 *    the groups above it.
 *
 * The old full task list at /tasks (URL-only, a retired design) was deleted in
 * the dead-code sweep (audit 2026-09-29, D5); the Tasks page is /maintenance.
 */
const visible = { visible: true } as const

// The seeded emulator home, read over the Firestore emulator's REST API (the
// same way invite.spec.ts checks what a button wrote).
const FIRESTORE = process.env.FIRESTORE_EMULATOR_HOST
  ?? `127.0.0.1:${process.env.VITE_EMULATOR_FIRESTORE_PORT ?? "8080"}`
const DOCS = `http://${FIRESTORE}/v1/projects/demo-homehub/databases/(default)/documents`
type RestValue = { stringValue?: string; nullValue?: null }
type RestDoc = { name: string; fields?: Record<string, RestValue> }
async function seedHomeDocs(collection: string): Promise<RestDoc[]> {
  const out: RestDoc[] = []
  let pageToken = ""
  do {
    const res = await fetch(`${DOCS}/homes/e2e-home/${collection}?pageSize=300${pageToken ? `&pageToken=${pageToken}` : ""}`, {
      headers: { Authorization: "Bearer owner" },
    })
    expect(res.ok, `listing ${collection}: HTTP ${res.status}`).toBe(true)
    const body = (await res.json()) as { documents?: RestDoc[]; nextPageToken?: string }
    out.push(...(body.documents ?? []))
    pageToken = body.nextPageToken ?? ""
  } while (pageToken)
  return out
}
const live = (d: RestDoc) => {
  const deletedAt = d.fields?.deletedAt
  return deletedAt === undefined || "nullValue" in deletedAt
}

test.describe("emulator e2e — care library", () => {
  test("item page: a suggestion becomes a task with visible provenance, and can be taken back", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    // The seed's dishwasher has parsed tasks but no drain-filter task, so the
    // library has exactly that to offer. The band opens by itself.
    await page.goto("/items/dishwasher")
    await expect(page.getByText("Suggested", { exact: true }).first()).toBeVisible({ timeout: 20_000 })
    const add = page.getByRole("button", { name: /^Add Clean the dishwasher filter/ }).filter(visible).first()
    await expect(add).toBeVisible()
    await add.click()

    // The task now lives in its band, and says where it came from.
    const row = page.getByTestId("care-row").filter({ hasText: "Clean the dishwasher filter" }).first()
    await expect(row).toBeVisible({ timeout: 20_000 })
    await expect(row).toContainText("Added from typical care")
    // No second offer for the same care.
    await expect(page.getByRole("button", { name: /^Add Clean the dishwasher filter/ })).toHaveCount(0)

    // The way back is one tap, on the row itself.
    await row.getByRole("button", { name: "Not this one" }).click()
    await expect(page.getByTestId("care-row").filter({ hasText: "Clean the dishwasher filter" })).toHaveCount(0, { timeout: 20_000 })
  })

  test("Your home: answers save as facts and unlock whole-home care", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/home-setup")
    await expect(page.getByRole("heading", { name: "Your home" })).toBeVisible({ timeout: 20_000 })
    // Nothing answered → nothing offered, and the page says why.
    await expect(page.getByTestId("home-suggestions")).toContainText(/Answer a category/)

    await page.getByRole("button", { name: /^Safety/ }).click()
    await expect(page.getByRole("heading", { name: "Safety" })).toBeVisible()
    const yes = page.getByRole("radio", { name: "Yes" })
    await yes.nth(0).click()
    await yes.nth(1).click()
    await page.getByRole("button", { name: "Save answers" }).click()

    await expect(page.getByText("Answered").first()).toBeVisible({ timeout: 20_000 })
    // The seed already has "Test smoke & CO detectors" — the library matches
    // it and offers only what is missing. That absence is the rule.
    const suggestions = page.getByTestId("home-suggestions")
    await expect(suggestions).toContainText("Check the fire extinguisher")
    await expect(suggestions).toContainText("Replace alarm batteries")
    await expect(suggestions).not.toContainText("Test smoke and CO alarms")

    // Facts persist: a reload reads them back from the home, not from memory.
    await page.reload()
    await expect(page.getByText("Answered").first()).toBeVisible({ timeout: 20_000 })

    await page.getByRole("button", { name: /^Add Check the fire extinguisher/ }).click()
    await expect(page.getByRole("button", { name: /^Add Check the fire extinguisher/ })).toHaveCount(0, { timeout: 20_000 })

    // …and it is a real task now: a live template carrying the library's
    // provenance, with a scheduled occurrence. (Read from Firestore: the check
    // is yearly, so it is due a year out — past the Tasks page's 31-day
    // window — and the full list that used to show it, /tasks, is gone.)
    await expect.poll(async () => {
      const templates = (await seedHomeDocs("taskTemplates")).filter(live)
        .filter((d) => d.fields?.title?.stringValue === "Check the fire extinguisher")
      const ids = new Set(templates.map((d) => d.name.split("/").pop()))
      const scheduled = (await seedHomeDocs("taskInstances")).filter(live)
        .filter((d) => ids.has(d.fields?.taskTemplateId?.stringValue) && d.fields?.status?.stringValue === "scheduled")
      return {
        templates: templates.map((d) => d.fields?.externalKey?.stringValue),
        scheduled: scheduled.length,
      }
    }, { timeout: 20_000 }).toEqual({ templates: ["library:home.extinguisher"], scheduled: 1 })
  })

  test("Tasks page: the Suggested group is last and leaves the existing groups alone", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    // The grouped week (/maintenance): the group is LAST, after every existing group.
    await page.goto("/maintenance")
    // Both layouts are in the DOM; only the one for this viewport is visible.
    const group = page.getByTestId("suggested-group").filter(visible).first()
    await expect(group).toBeVisible({ timeout: 20_000 })
    await expect(group).toContainText(/typical for your home/)
    // Rows name the item they belong to — the reminders-list gap, closed here too.
    await expect(group).toContainText("Bosch 800 Series Dishwasher")
    const groupTop = await group.evaluate((el) => el.getBoundingClientRect().top + window.scrollY)
    const existingHeaders = page.locator("main").getByText(/^(Essential|Recommended|Optional|Overdue|This week|Later|Whenever)$/)
    for (const h of await existingHeaders.all()) {
      const top = await h.evaluate((el) => el.getBoundingClientRect().top + window.scrollY)
      expect(top, "an existing group renders below Suggested").toBeLessThan(groupTop)
    }
    await expect(group).toContainText("Clean the dishwasher filter")
  })
})
