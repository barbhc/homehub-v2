import { test, expect } from "@playwright/test"
import { getApps, initializeApp } from "firebase-admin/app"
import { getFirestore, Timestamp } from "firebase-admin/firestore"
import { SEED_TODAY } from "../seed-config"

/**
 * /reminders against the seeded emulator — the AI-free path (the functions
 * emulator is not part of this stack, so the propose step is unit-tested
 * with a fake tool; everything after it is real here).
 *
 * The seeded "Service AC before summer" is Recommended with remindEnabled
 * null, so /week does not show it in the default mode. Turning it on through
 * the curation flow must make /week show it — the bell visibly ON, end to
 * end — while the task itself never leaves the Tasks page. (Each walk in this
 * suite turns on a DIFFERENT seeded task: they share one emulator per run.)
 */
const visible = { visible: true } as const

const HOME = "e2e-home"
const TIP_ID = "tpl-e2e-descale-coffee"
const TIP_TITLE = "Descale the coffee machine"

/**
 * A "when needed" tip the fixture does not carry — written with the admin SDK
 * the seed uses. FIRESTORE_EMULATOR_HOST is set by `emulators:exec` in CI and
 * by hand locally; without it this refuses, so it can never touch a project.
 */
async function seedWhenNeededTip() {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error("FIRESTORE_EMULATOR_HOST is not set — this spec writes to the EMULATOR only")
  const app = getApps()[0] ?? initializeApp({ projectId: "demo-homehub" })
  const db = getFirestore(app)
  const now = Timestamp.fromDate(new Date(`${SEED_TODAY}T00:00:00Z`))
  // Idempotent: a retried attempt must not inherit the occurrence a failed one wrote.
  const stale = await db.collection(`homes/${HOME}/taskInstances`).where("taskTemplateId", "==", TIP_ID).get()
  for (const d of stale.docs) await d.ref.delete()
  await db.doc(`homes/${HOME}/taskTemplates/${TIP_ID}`).set({
    scopeType: "home", itemUnitId: null, roomId: null, title: TIP_TITLE, description: null,
    careType: "maintenance", careTypeOverriddenAt: null, justification: "Scale on the heating element slows the brew.",
    symptomTags: [], reCheckTriggers: [], priorityTier: "recommended", remindEnabled: null,
    riskLevel: "performance", estimatedMinutes: 20, defaultAssignee: null, instructionsChunkId: null,
    instructionsOverride: null, steps: null, sourcePage: null, suppliesMode: "none", supplies: [],
    source: "manual", isUserEditable: true, userModifiedAt: null, isActive: true, metadata: {},
    manualId: null, externalKey: null,
    // The parse gives condition-triggered work this schedule — and no occurrence.
    schedule: { scheduleType: "as_needed", intervalDays: null, anchorDate: SEED_TODAY, season: null, windowDaysBefore: 7, windowDaysAfter: 14 },
    createdAt: now, updatedAt: now, deletedAt: null,
  })
  return db
}

test.describe("emulator e2e — your reminders", () => {
  test("pick a task from search, turn it on, and it joins the week", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })

    await page.goto("/week")
    await expect(page.getByRole("heading", { name: "Your week" }).filter(visible).first()).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText("Service AC before summer")).toHaveCount(0)

    await page.goto("/reminders")
    await expect(page.getByRole("heading", { name: "Your reminders" }).filter(visible).first()).toBeVisible({ timeout: 20_000 })
    await page.getByRole("button", { name: "Skip — pick from your tasks" }).click()
    await page.getByLabel("Search your tasks").fill("service ac")
    await page.getByRole("button", { name: "Add Service AC before summer" }).click()
    await expect(page.getByLabel("Service AC before summer")).toBeChecked()
    await page.getByRole("button", { name: /Turn these on · 1/ }).click()
    await expect(page.getByText("1 reminder on.")).toBeVisible({ timeout: 15_000 })

    await page.goto("/week")
    await expect(page.getByText("Service AC before summer").filter(visible).first()).toBeVisible({ timeout: 20_000 })

    // Corpus invariant: the task is still exactly where it always was.
    await page.goto("/maintenance")
    await expect(page.getByText("Service AC before summer").filter(visible).first()).toBeVisible({ timeout: 20_000 })
  })

  /**
   * The proposal path, seen live 2026-09-02: "Descale the Machine · Nespresso
   * Coffee · when needed" was proposed, ticked and turned on — and could never
   * notify, because a task with no recurring schedule never comes due. Only
   * the model is faked here (the functions emulator is not in this stack);
   * the template, the page, both writers, the first occurrence and /week are
   * real. The server no longer proposes such a task at all; this walks the
   * client's own guard for the window in which a page outruns the callable.
   */
  test("a proposed 'when needed' task cannot be turned on until it has a cadence — with one, it joins the week", async ({ page }) => {
    const db = await seedWhenNeededTip()
    await page.setViewportSize({ width: 390, height: 844 })
    await page.route("**/proposeReminders", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          result: {
            ok: true, total_templates: 16,
            proposals: [{
              task_template_id: TIP_ID, title: TIP_TITLE, item_name: null, reason: "You said the coffee machine.",
              current_schedule_type: "as_needed", current_interval_days: null,
              suggested_schedule_type: null, suggested_interval_days: null, remind_already_on: false, priority_tier: "recommended",
            }],
          },
        }),
      }),
    )

    await page.goto("/reminders")
    await expect(page.getByRole("heading", { name: "Your reminders" }).filter(visible).first()).toBeVisible({ timeout: 20_000 })
    await page.getByLabel("What do you want to stay on top of?").fill("Descaling the coffee machine")
    await page.getByRole("button", { name: "Propose my reminders" }).click()
    await expect(page.getByText("1 proposed · from what you told us")).toBeVisible({ timeout: 15_000 })

    // Ticked, but held: the reason is on the row, the picker is already open
    // on "Choose…", and "Turn these on" is shut until the owner decides.
    await expect(page.getByRole("checkbox", { name: TIP_TITLE, exact: true })).toBeChecked()
    await expect(page.getByText("Needs a schedule to remind you — pick how often.")).toBeVisible()
    const picker = page.getByLabel(`How often for ${TIP_TITLE}`)
    await expect(picker).toHaveValue("")
    // "When needed" is not a reminder cadence — it is not on offer.
    await expect(picker.locator("option", { hasText: "When needed" })).toHaveCount(0)
    const turnOn = page.getByRole("button", { name: /Turn these on · 1/ })
    await expect(turnOn).toBeDisabled()
    await expect(page.getByText(/needs a schedule first — pick how often, or untick it/)).toBeVisible()

    await picker.selectOption("weekly")
    await expect(turnOn).toBeEnabled()
    await turnOn.click()
    await expect(page.getByText("1 reminder on.")).toBeVisible({ timeout: 15_000 })

    // What the writers left behind: the schedule, the flag, and — the part
    // that was missing live — ONE scheduled occurrence the week can read.
    const tpl = await db.doc(`homes/${HOME}/taskTemplates/${TIP_ID}`).get()
    expect(tpl.get("schedule.scheduleType")).toBe("weekly")
    expect(tpl.get("remindEnabled")).toBe(true)
    const occurrences = await db.collection(`homes/${HOME}/taskInstances`).where("taskTemplateId", "==", TIP_ID).get()
    expect(occurrences.size).toBe(1)
    expect(occurrences.docs[0].get("status")).toBe("scheduled")
    expect(occurrences.docs[0].get("scheduleType")).toBe("weekly")

    // …and the week shows it. A week from today is inside every horizon.
    await page.goto("/week")
    await expect(page.getByText(TIP_TITLE).filter(visible).first()).toBeVisible({ timeout: 20_000 })

    // Corpus invariant: it is on Tasks too — curation never hides a task.
    await page.goto("/maintenance")
    await expect(page.getByText(TIP_TITLE).filter(visible).first()).toBeVisible({ timeout: 20_000 })
  })
})
