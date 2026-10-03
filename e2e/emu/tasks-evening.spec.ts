import { test, expect } from "@playwright/test"
import { getApps, initializeApp } from "firebase-admin/app"
import { getFirestore, Timestamp, type Firestore } from "firebase-admin/firestore"
import { EMULATOR_PROJECT_ID, SEED_TODAY, dayOffset } from "../seed-config"

/**
 * H7a — the Tasks page counts from the DEVICE's day (shared/dates/calendar.ts),
 * walked in a real browser against the emulators.
 *
 * The browser runs in America/Los_Angeles with its clock fixed at 19:30 on the
 * seed's today — 02:30 the NEXT day in UTC, the day the page used to count
 * from. The seed has nothing due on its own today, so two tasks are written
 * here (admin SDK, emulator only) and removed afterwards:
 *
 *   · a deadline due today — "By Jun 23". Counted from UTC it was "Overdue".
 *   · a weekly task whose window (±2 days) closes today — "This week".
 *     Counted from UTC it had lapsed: "Been a while".
 *
 * The clock is fixed after sign-in (storageState carries a fresh token), as
 * e2e/fixtures.ts does for the journeys; only Date is pinned, timers run.
 */
const HOME = "e2e-home"
const EVENING = new Date(`${SEED_TODAY}T19:30:00-07:00`) // June: Pacific daylight time

const DEADLINE = { id: "inst-h7a-deadline-today", title: "Register the dehumidifier warranty", scheduleType: "as_needed", dueDate: SEED_TODAY }
const WINDOW = { id: "inst-h7a-window-closes-today", title: "Check the sump pump float", scheduleType: "weekly", dueDate: dayOffset(-2) }

function emulatorDb(): Firestore {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error("FIRESTORE_EMULATOR_HOST is not set — this spec writes to the EMULATOR only")
  }
  return getFirestore(getApps()[0] ?? initializeApp({ projectId: EMULATOR_PROJECT_ID }))
}

test.use({ timezoneId: "America/Los_Angeles" })

test.describe("Tasks at 19:30 Pacific — the device's day, not UTC's", () => {
  test.beforeAll(async () => {
    const db = emulatorDb()
    const now = Timestamp.now()
    for (const t of [DEADLINE, WINDOW]) {
      await db.doc(`homes/${HOME}/taskInstances/${t.id}`).set({
        taskTemplateId: `tpl-${t.id}`, itemUnitId: null, status: "scheduled", dueDate: t.dueDate,
        windowStart: null, windowEnd: null, snoozedUntil: null, priorityScore: 50, isSafetyCritical: false,
        completedAt: null, completionNotes: null, completionPhotos: [], assignedTo: null,
        title: t.title, priorityTier: "recommended", careType: "maintenance", scopeType: "home",
        estimatedMinutes: 10, scheduleType: t.scheduleType, itemName: null, roomName: null,
        createdAt: now, updatedAt: now, deletedAt: null,
      })
    }
  })

  test.afterAll(async () => {
    const db = emulatorDb()
    for (const t of [DEADLINE, WINDOW]) await db.doc(`homes/${HOME}/taskInstances/${t.id}`).delete()
  })

  test("a deadline due today is due today; a window closing today is still open", async ({ page }) => {
    await page.clock.setFixedTime(EVENING)
    await page.goto("/maintenance")

    // The page really is on the Pacific evening clock, where UTC is a day ahead.
    expect(
      await page.evaluate(() => [Intl.DateTimeFormat().resolvedOptions().timeZone, new Date().getHours(), new Date().toISOString().slice(0, 10)]),
    ).toEqual(["America/Los_Angeles", 19, dayOffset(1)])

    // Desktop viewport: DesktopTasks is the visible list (its rows carry this test id).
    const deadline = page.getByTestId("desktop-task-row").filter({ hasText: DEADLINE.title })
    await expect(deadline).toBeVisible({ timeout: 20_000 })
    await expect(deadline).toContainText("By Jun 23")
    await expect(deadline).not.toContainText("Overdue")

    const closing = page.getByTestId("desktop-task-row").filter({ hasText: WINDOW.title })
    await expect(closing).toBeVisible()
    await expect(closing).toContainText("This week")
    await expect(closing).not.toContainText("Been a while")
  })
})
