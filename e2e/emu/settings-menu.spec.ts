import { test, expect, type Page } from "@playwright/test"

/**
 * Settings is one short menu, and what left it has a home
 * (design/settings-your-home.md), end to end on the seeded emulator:
 *  - the menu's rows say what was READ from the seed, and each opens a page
 *    with a way back;
 *  - Rooms is reached from Items ("Edit rooms") and writes through the real
 *    homeService;
 *  - a task in her own words is added from Tasks ("Add your own task"), and
 *    "Shows in" decides what is written: an upkeep task or a cleaning one.
 *
 * The two entry links are in a phone tree and a desktop tree that are both
 * mounted, so every locator here is filtered to the visible one.
 *
 * Shared emulator: each walk removes what it added (a room, two tasks).
 */
const visible = { visible: true } as const
const PHONE = { width: 390, height: 844 }

const FIRESTORE = process.env.FIRESTORE_EMULATOR_HOST
  ?? `127.0.0.1:${process.env.VITE_EMULATOR_FIRESTORE_PORT ?? "8080"}`
const DOCS = `http://${FIRESTORE}/v1/projects/demo-homehub/databases/(default)/documents`
type RestValue = { stringValue?: string; nullValue?: null; integerValue?: string; timestampValue?: string }
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
const templatesTitled = async (title: string) =>
  (await seedHomeDocs("taskTemplates")).filter((d) => d.fields?.title?.stringValue === title)

const row = (page: Page, key: string) => page.getByTestId(`settings-row-${key}`)

test.describe("emulator e2e — the settings menu", () => {
  test("the menu says what the seed holds, and every row opens a page with a way back", async ({ page }) => {
    await page.setViewportSize(PHONE)
    await page.goto("/settings")
    await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible({ timeout: 20_000 })

    // Values that were read: the seeded name, four providers, one member, the
    // home's name. The home never chose a task level, which behaves as Everything.
    await expect(row(page, "account")).toContainText("E2E Tester", { timeout: 20_000 })
    await expect(row(page, "account")).toContainText("e2e@homehub.test")
    await expect(row(page, "providers")).toContainText("4 saved", { timeout: 20_000 })
    await expect(row(page, "members")).toContainText("Just you", { timeout: 20_000 })
    await expect(row(page, "task-level")).toContainText("Everything", { timeout: 20_000 })
    await expect(row(page, "homes")).toContainText("E2E Test Home")
    await expect(row(page, "appearance")).toContainText("System")
    await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible()

    // This build carries no web-push key, so there is no Notifications row
    // (not rendered); the seeded person has no dev_tools, so no Internal row.
    await expect(row(page, "notifications")).toHaveCount(0)
    await expect(row(page, "internal")).toHaveCount(0)
    // What left the menu is not on it (not rendered).
    for (const gone of ["Feature tour", "Custom tasks", "Your reminders", "Rooms", "House rules", "On this page"]) {
      await expect(page.getByText(gone, { exact: true })).toHaveCount(0)
    }
    await expect(page.getByRole("button", { name: /^(Simple|Standard|Advanced)/ })).toHaveCount(0)

    // Each row opens its own page; "Settings" comes back.
    const pages: [string, RegExp, string][] = [
      ["account", /\/settings\/account$/, "Account"],
      ["members", /\/settings\/members$/, "Members"],
      ["task-level", /\/settings\/task-level$/, "Task level"],
      ["homes", /\/settings\/homes$/, "Homes"],
      ["appearance", /\/settings\/appearance$/, "Appearance"],
      ["export", /\/settings\/export$/, "Export your data"],
      ["privacy", /\/settings\/privacy$/, "Data & privacy"],
      ["help", /\/settings\/help$/, "Report a problem"],
    ]
    for (const [key, url, heading] of pages) {
      await row(page, key).click()
      await expect(page).toHaveURL(url)
      await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible({ timeout: 20_000 })
      await page.getByRole("link", { name: "Settings", exact: true }).filter(visible).first().click()
      await expect(page).toHaveURL(/\/settings$/)
    }
    await row(page, "your-home").click()
    await expect(page).toHaveURL(/\/your-home$/)
    await page.goBack()
    await row(page, "providers").click()
    await expect(page).toHaveURL(/\/providers$/)
  })

  test("an address that is not a page goes back to the menu; internal tools are not reachable without the flag", async ({ page }) => {
    await page.goto("/settings/no-such-page")
    await expect(page).toHaveURL(/\/settings$/, { timeout: 20_000 })
    await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible({ timeout: 20_000 })

    await page.goto("/settings/internal")
    await expect(page).toHaveURL(/\/settings$/, { timeout: 20_000 })
    await expect(page.getByRole("heading", { name: "Internal tools" })).toHaveCount(0)
    await expect(page.getByText("Admin tools")).toHaveCount(0)
  })

  test("old anchors land where each section lives now", async ({ page }) => {
    for (const [anchor, url] of [
      ["rooms", /\/inventory\/rooms$/],
      ["tasks", /\/maintenance\/custom$/],
      ["home-profile", /\/your-home\?part=basics$/],
      ["house-rules", /\/your-home\?part=rules$/],
      ["data", /\/settings\/export$/],
      ["notifications", /\/settings\/notifications$/],
    ] as const) {
      await page.goto(`/settings#${anchor}`)
      await expect(page, `/settings#${anchor}`).toHaveURL(url, { timeout: 20_000 })
    }
  })
})

test.describe("emulator e2e — rooms, from Items", () => {
  for (const [name, viewport] of [["phone", PHONE], ["desktop", { width: 1440, height: 900 }]] as const) {
    test(`${name}: “Edit rooms” follows the list and opens Rooms`, async ({ page }) => {
      await page.setViewportSize(viewport)
      await page.goto("/inventory")
      await expect(page.getByText("Bosch 800 Series Dishwasher").filter(visible).first()).toBeVisible({ timeout: 20_000 })
      const link = page.getByRole("link", { name: "Edit rooms" }).filter(visible)
      await expect(link).toHaveCount(1)
      await link.click()
      await expect(page).toHaveURL(/\/inventory\/rooms$/)
      await expect(page.getByRole("heading", { level: 1, name: "Rooms" })).toBeVisible({ timeout: 20_000 })
      await expect(page.getByRole("link", { name: "Items", exact: true }).filter(visible).first()).toHaveAttribute("href", "/inventory")
    })
  }

  test("the Warranties view has no “Edit rooms”", async ({ page }) => {
    await page.setViewportSize(PHONE)
    await page.goto("/inventory?view=warranties")
    await expect(page.getByRole("tab", { name: "Warranties" }).filter(visible).first()).toBeVisible({ timeout: 20_000 })
    await expect(page.getByRole("link", { name: "Edit rooms" })).toHaveCount(0)
  })

  test("a room is added and deleted through the real service", async ({ page }) => {
    await page.setViewportSize(PHONE)
    await page.goto("/inventory/rooms")
    const rooms = page.getByTestId("rooms-manager")
    await expect(rooms.getByRole("button", { name: "Kitchen", exact: true })).toBeVisible({ timeout: 20_000 })
    // The seeded kitchen holds items, and the row says how many.
    await expect(rooms.getByText(/\d+ items?/).first()).toBeVisible()

    await rooms.getByRole("button", { name: "Add room" }).click()
    await rooms.getByLabel("Room name").fill("Zz Walk Attic")
    await rooms.getByRole("button", { name: "Add", exact: true }).click()
    await expect(rooms.getByRole("button", { name: "Zz Walk Attic", exact: true })).toBeVisible({ timeout: 20_000 })
    await expect.poll(async () => (await seedHomeDocs("rooms")).filter(live).some((d) => d.fields?.name?.stringValue === "Zz Walk Attic"), { timeout: 20_000 }).toBe(true)

    // Read back on a fresh load, then removed again.
    await page.reload()
    await expect(rooms.getByRole("button", { name: "Zz Walk Attic", exact: true })).toBeVisible({ timeout: 20_000 })
    await rooms.getByRole("button", { name: "Delete Zz Walk Attic" }).click()
    await page.getByRole("dialog").getByRole("button", { name: "Delete", exact: true }).click()
    await expect(rooms.getByRole("button", { name: "Zz Walk Attic", exact: true })).toHaveCount(0, { timeout: 20_000 })
    await expect(rooms.getByRole("alert")).toHaveCount(0)
    await expect.poll(async () => (await seedHomeDocs("rooms")).filter(live).some((d) => d.fields?.name?.stringValue === "Zz Walk Attic"), { timeout: 20_000 }).toBe(false)
  })
})

test.describe("emulator e2e — your own tasks, from Tasks", () => {
  for (const [name, viewport] of [["phone", PHONE], ["desktop", { width: 1440, height: 900 }]] as const) {
    test(`${name}: “Add your own task” closes the Upkeep list and opens the page`, async ({ page }) => {
      await page.setViewportSize(viewport)
      await page.goto("/maintenance")
      await expect(page.getByText("Replace HVAC furnace filter").filter(visible).first()).toBeVisible({ timeout: 20_000 })
      const link = page.getByRole("link", { name: "Add your own task" }).filter(visible)
      await expect(link).toHaveCount(1)
      await link.click()
      await expect(page).toHaveURL(/\/maintenance\/custom$/)
      await expect(page.getByRole("heading", { level: 1, name: "Your own tasks" })).toBeVisible({ timeout: 20_000 })
      await expect(page.getByRole("link", { name: "Tasks", exact: true }).filter(visible).first()).toHaveAttribute("href", "/maintenance")
    })
  }

  test("the Cleaning view has no “Add your own task”", async ({ page }) => {
    await page.setViewportSize(PHONE)
    await page.goto("/maintenance?view=cleaning")
    await expect(page.getByRole("button", { name: /Start cleaning/ }).filter(visible).first()).toBeVisible({ timeout: 20_000 })
    await expect(page.getByRole("link", { name: "Add your own task" }).filter(visible)).toHaveCount(0)
  })

  test("Shows in decides what is written: Upkeep makes an upkeep task, Cleaning a cleaning one; both can be deleted", async ({ page }) => {
    await page.setViewportSize(PHONE)
    await page.goto("/maintenance/custom")
    const own = page.getByTestId("own-tasks")
    await expect(own.getByLabel("Task name")).toBeVisible({ timeout: 20_000 })
    // Upkeep is where a task goes unless she says otherwise.
    await expect(own.getByRole("radio", { name: "Upkeep" })).toHaveAttribute("aria-checked", "true")

    // Yearly, so neither task lands on this run's agenda for the other specs.
    await own.getByLabel("Task name").fill("Zz walk oil the gate hinges")
    await own.getByLabel("How often").selectOption({ label: "Yearly" })
    await own.getByLabel("Minutes").fill("20")
    await own.getByRole("button", { name: "Add task" }).click()
    await expect(own.getByRole("status")).toContainText("Added Zz walk oil the gate hinges to your Tasks.", { timeout: 20_000 })
    await expect(own.getByLabel("Task name")).toHaveValue("")
    await expect(own.getByTestId("own-tasks-list")).toContainText("Zz walk oil the gate hinges", { timeout: 20_000 })

    await own.getByLabel("Task name").fill("Zz walk mop the hall")
    await own.getByLabel("How often").selectOption({ label: "Yearly" })
    await own.getByRole("radio", { name: "Cleaning" }).click()
    await own.getByRole("button", { name: "Add task" }).click()
    await expect(own.getByRole("status")).toContainText("Added Zz walk mop the hall to your Tasks.", { timeout: 20_000 })
    await expect(own.getByTestId("own-tasks-list")).toContainText("Zz walk mop the hall", { timeout: 20_000 })

    // What was written, read from Firestore.
    await expect.poll(async () => {
      const [upkeep] = (await templatesTitled("Zz walk oil the gate hinges")).filter(live)
      const [cleaning] = (await templatesTitled("Zz walk mop the hall")).filter(live)
      return {
        upkeep: [upkeep?.fields?.careType?.stringValue, upkeep?.fields?.scopeType?.stringValue, upkeep?.fields?.source?.stringValue, upkeep?.fields?.estimatedMinutes?.integerValue],
        cleaning: [cleaning?.fields?.careType?.stringValue, cleaning?.fields?.scopeType?.stringValue, cleaning?.fields?.source?.stringValue],
      }
    }, { timeout: 20_000 }).toEqual({
      upkeep: ["maintenance", "home", "user", "20"],
      cleaning: ["cleaning", "home", "user"],
    })

    // Both survive a reload (read from Firestore, not remembered), and delete.
    await page.reload()
    const list = page.getByTestId("own-tasks-list")
    await expect(list).toContainText("Zz walk oil the gate hinges", { timeout: 20_000 })
    await expect(list).toContainText("Zz walk mop the hall")
    for (const title of ["Zz walk oil the gate hinges", "Zz walk mop the hall"]) {
      await list.getByRole("button", { name: `Delete ${title}` }).click()
      await expect(list.getByText(title)).toHaveCount(0, { timeout: 20_000 })
    }
    await expect(page.getByTestId("own-tasks").getByRole("alert")).toHaveCount(0)
    await expect.poll(async () => [
      ...(await templatesTitled("Zz walk oil the gate hinges")),
      ...(await templatesTitled("Zz walk mop the hall")),
    ].filter(live).length, { timeout: 20_000 }).toBe(0)
  })
})
