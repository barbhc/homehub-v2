import { gotoStable } from "../fixtures"
import type { Page } from "@playwright/test"
import { getApps, initializeApp } from "firebase-admin/app"
import { getFirestore, Timestamp } from "firebase-admin/firestore"

/**
 * The pages the device suite judges, each with how to open it in the state
 * worth judging. Shared by the hit-target audit (hit-targets.spec.ts) and the
 * Larger Text audit (larger-text.spec.ts) so both look at the same screens.
 */
const HOME = "e2e-home"
const SETUP_ITEM = "hit-audit-softener"
const SETUP_STEPS = ["Connect the brine line to the drain", "Set the water hardness to your area", "Run the first regeneration cycle"]
function emulatorDb() {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error("FIRESTORE_EMULATOR_HOST is not set — this spec writes to the EMULATOR only")
  }
  return getFirestore(getApps()[0] ?? initializeApp({ projectId: "demo-homehub" }))
}
async function seedSetupItem() {
  const db = emulatorDb()
  const now = Timestamp.now()
  await db.doc(`homes/${HOME}/items/${SETUP_ITEM}`).set({
    roomId: "garage", displayName: "Hit Audit Water Softener", category: "water_softener", itemCategory: "system",
    brand: "Audit", model: "WS-1", status: "active", purchaseDate: null, warrantyDurationMonths: null, categoryFields: {},
    tags: [], recallStatus: "none_found", recallCheckedAt: now, photoPath: null,
    setupRevealedAt: now, createdAt: now, updatedAt: now, deletedAt: null,
  })
  for (const [i, title] of SETUP_STEPS.entries()) {
    const tpl = `${SETUP_ITEM}-step-${i}`
    await db.doc(`homes/${HOME}/taskTemplates/${tpl}`).set({
      scopeType: "item_unit", itemUnitId: SETUP_ITEM, roomId: null, title, description: null,
      careType: "maintenance", careTypeOverriddenAt: null, justification: null, symptomTags: [], reCheckTriggers: [],
      priorityTier: "essential", remindEnabled: null, riskLevel: "performance", estimatedMinutes: 10, defaultAssignee: null,
      instructionsChunkId: null, instructionsOverride: null, steps: null, sourcePage: null, suppliesMode: "none", supplies: [],
      source: "cho_generated", isUserEditable: true, userModifiedAt: null, isActive: true, metadata: {}, manualId: null,
      externalKey: null,
      schedule: { scheduleType: "setup", intervalDays: null, anchorDate: null, season: null, windowDaysBefore: 7, windowDaysAfter: 14 },
      createdAt: now, updatedAt: now, deletedAt: null,
    })
  }
  // Step 1 done, so its row carries the redo mark.
  await db.doc(`homes/${HOME}/taskInstances/${SETUP_ITEM}-done-0`).set({
    taskTemplateId: `${SETUP_ITEM}-step-0`, itemUnitId: SETUP_ITEM, status: "done", dueDate: null,
    completedAt: now, createdAt: now, updatedAt: now, deletedAt: null,
  })
}
export async function removeSetupItem() {
  const db = emulatorDb()
  for (const i of SETUP_STEPS.keys()) {
    const tpl = `${SETUP_ITEM}-step-${i}`
    const insts = await db.collection(`homes/${HOME}/taskInstances`).where("taskTemplateId", "==", tpl).get()
    for (const d of insts.docs) await d.ref.delete()
    await db.doc(`homes/${HOME}/taskTemplates/${tpl}`).delete()
  }
  await db.doc(`homes/${HOME}/items/${SETUP_ITEM}`).delete()
}

const visible = { visible: true } as const
const TASK_TITLE = "Replace HVAC furnace filter"
const ANSWER = "Swap the furnace filter every three months, or monthly in a dusty house."

export type Setup = { name: string; signedOut?: boolean; open: (page: Page) => Promise<void>; cleanup?: () => Promise<void> }

export const PAGES: Setup[] = [
  {
    name: "home",
    open: async (page) => {
      await gotoStable(page, "/home")
      // Home opens with the first task's row expanded (Mark done / Snooze / See details).
      await page.getByRole("button", { name: "Mark done" }).filter(visible).first().waitFor({ timeout: 20_000 })
    },
  },
  {
    name: "tasks",
    open: async (page) => {
      await gotoStable(page, "/maintenance")
      await page.getByText(TASK_TITLE).filter(visible).first().waitFor({ timeout: 20_000 })
    },
  },
  {
    name: "task page",
    open: async (page) => {
      await gotoStable(page, "/maintenance")
      await page.getByText(TASK_TITLE).filter(visible).first().click()
      await page.getByRole("button", { name: /View full guide/ }).filter(visible).first().click()
      await page.waitForURL(/\/tasks\//, { timeout: 15_000 })
      await page.getByRole("button", { name: /Tune this task/ }).waitFor({ state: "visible", timeout: 20_000 })
    },
  },
  {
    name: "items",
    open: async (page) => {
      await gotoStable(page, "/inventory")
      await page.getByText(/Bosch 800 Series Dishwasher/).filter(visible).first().waitFor({ timeout: 20_000 })
    },
  },
  {
    name: "item page",
    open: async (page) => {
      await gotoStable(page, "/items/furnace")
      await page.getByText(/Carrier Infinity Furnace/).filter(visible).first().waitFor({ timeout: 20_000 })
    },
  },
  {
    name: "ask",
    open: async (page) => {
      // Stubbed at the network layer (no functions emulator, never a model call)
      // — the technique e2e/emu/chat.spec.ts uses.
      await page.route("**/chatQuery", async (route) => {
        if (route.request().method() !== "POST") return route.continue()
        await route.fulfill({
          status: 200,
          contentType: "text/event-stream",
          body: `data: ${JSON.stringify({ delta: ANSWER })}\n\ndata: {"done":true,"sources":[]}\n\n`,
        })
      })
      await gotoStable(page, "/chat")
      const composer = page.getByRole("textbox", { name: "Message" }).filter(visible).first()
      await composer.fill("How often should I change the furnace filter?")
      await composer.press("Enter")
      await page.getByText(ANSWER).filter(visible).first().waitFor({ timeout: 15_000 })
      // The room filter loads on its own; judge the page with it in. (From lg:
      // the answered page shows a "Topic" chip instead of the room filter.)
      if ((page.viewportSize()?.width ?? 0) < 1024) {
        await page.getByRole("button", { name: "Kitchen" }).filter(visible).first().waitFor({ timeout: 20_000 })
      } else {
        await page.getByText("Topic", { exact: true }).filter(visible).first().waitFor({ timeout: 20_000 })
      }
    },
  },
  {
    name: "settings",
    open: async (page) => {
      await gotoStable(page, "/settings")
      await page.getByText(/appearance/i).filter(visible).first().waitFor({ timeout: 20_000 })
      // The sections load independently; audit the page once the slow ones
      // (rooms, providers, manuals) are in, or the run judges whichever half
      // happened to arrive.
      for (const ready of ["Living Room", "Sears Appliance Repair", "Carrier Infinity Furnace"]) {
        await page.getByText(ready).filter(visible).first().waitFor({ timeout: 20_000 })
      }
    },
  },
  ...(
    [
      ["your week", "/week", /week/i],
      ["reminders", "/reminders", /reminder/i],
      ["providers", "/providers", /Ace Heating & Air/],

      ["notes", "/inventory/notes", /note/i],
    ] as const
  ).map(([name, path, ready]): Setup => ({
    name,
    open: async (page) => {
      await gotoStable(page, path)
      await page.getByText(ready).filter(visible).first().waitFor({ timeout: 20_000 })
    },
  })),
  {
    name: "deep clean",
    open: async (page) => {
      await gotoStable(page, "/clean")
      // The hub's "This week" rows load after the guides; judge them too.
      await page.getByRole("button", { name: /Mark done/ }).filter(visible).first().waitFor({ timeout: 20_000 })
    },
  },
  ...([false, true] as const).map((session): Setup => ({
    // Deep Clean's setup (rooms, time budget), then the session checklist.
    name: session ? "deep clean session" : "deep clean setup",
    open: async (page) => {
      await gotoStable(page, "/clean")
      await page.getByRole("button", { name: /Start cleaning/ }).filter(visible).first().click()
      await page.getByRole("button", { name: "Whole Home" }).filter(visible).first().waitFor({ timeout: 20_000 })
      if (session) {
        await page.getByRole("button", { name: "Whole Home" }).filter(visible).first().click()
        await page.getByRole("button", { name: /Let's clean/ }).filter(visible).first().click()
        await page.getByRole("button", { name: /Finish session/ }).filter(visible).first().waitFor({ timeout: 20_000 })
      }
    },
  })),
  {
    name: "setup band",
    open: async (page) => {
      await seedSetupItem()
      await gotoStable(page, `/items/${SETUP_ITEM}`)
      await page.getByText(SETUP_STEPS[2]).filter(visible).first().waitFor({ timeout: 20_000 })
      // The done state loads after the steps: audit once step 1 reads as done.
      await page.getByRole("button", { name: /Mark not done/ }).filter(visible).first().waitFor({ timeout: 20_000 })
    },
    // Removed as soon as this page is judged, so every other page sees the
    // seed exactly as it was, at both sizes.
    cleanup: removeSetupItem,
  },
  ...([false, true] as const).map((walk): Setup => ({
    // The seeded microwave's unsaved read: the review sheet, then its
    // one-by-one walk (Previous / Exit / Skip / Keep).
    name: walk ? "review sheet: walk" : "review sheet",
    open: async (page) => {
      await gotoStable(page, "/items/microwave")
      await page.getByRole("button", { name: /Review/ }).filter(visible).first().click()
      const walkEntry = page.getByRole("button", { name: /Go through them one by one/ }).filter(visible).first()
      await walkEntry.waitFor({ timeout: 20_000 })
      if (walk) {
        await walkEntry.click()
        await page.getByRole("button", { name: /Exit/ }).filter(visible).first().waitFor({ timeout: 10_000 })
      }
    },
  })),
  {
    // A real failure: Firestore cut off after a good first load (the technique
    // e2e/emu/inventory.spec.ts uses) leaves the item page at its dead end.
    name: "load error: item page",
    open: async (page) => {
      await gotoStable(page, "/inventory")
      await page.getByText(/Bosch 800 Series Dishwasher/).filter(visible).first().waitFor({ timeout: 20_000 })
      await page.route("**/google.firestore.v1.Firestore/**", (route) => route.abort())
      await gotoStable(page, "/items/furnace")
      await page.getByRole("button", { name: /Try again/ }).filter(visible).first().waitFor({ timeout: 45_000 })
    },
  },
  // Real components in named states (src/dev/previewScenarios.tsx) for what a
  // seeded emulator cannot reach on demand: the shared failure states — most
  // pages answer an offline read from cache, so InlineError's "Try again" is
  // never on screen — the add wizard's identify step, and lookup suggestions.
  ...(["load-states", "identify-appliance-filled", "item-suggestions-two"] as const).map((id): Setup => ({
    name: `preview: ${id}`,
    open: async (page) => {
      await gotoStable(page, "/__preview")
      await page.goto(`/__preview?s=${id}`)
      await page.locator(`[data-preview-scenario="${id}"]`).waitFor({ timeout: 20_000 })
      await page.locator(`[data-preview-scenario="${id}"] button`).first().waitFor({ timeout: 20_000 })
    },
  })),
  {
    name: "sign-in",
    signedOut: true,
    open: async (page) => {
      await gotoStable(page, "/signin")
      await page.getByText(/welcome back/i).filter(visible).first().waitFor({ timeout: 20_000 })
    },
  },
]
