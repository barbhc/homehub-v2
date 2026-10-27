import { test, expect, gotoStable } from "../fixtures"
import type { Page } from "@playwright/test"
import { PAGES } from "./pages"

/**
 * The shared bottom sheet and press feedback (Apple polish phase 2), on a phone.
 *
 * The approved demo (https://claude.ai/artifact/1DwQLYdx2ewMk3RoYrxp8t) is the
 * spec; each test below is one line of its QA checklist. The release decisions
 * themselves (30% / flick / dirty) are pinned as pure functions in
 * src/lib/sheetGesture.test.ts; this suite proves the real component wires
 * them to real pointer events, real frames and real focus.
 *
 * The fixture zeroes CSS transitions, which suits the press checks (the
 * pressed state is read without waiting out 120ms). The sheet is driven by
 * requestAnimationFrame, not CSS, so its motion is still real here.
 */
const PHONE = { width: 390, height: 844 }
const TUNE = "task-feedback-sheet"
const EDIT = "task-edit-sheet"

async function openTaskPage(page: Page) {
  await PAGES.find((p) => p.name === "task page")!.open(page)
}

const sheet = (page: Page, id: string) => page.getByTestId(id)

async function box(page: Page, id: string) {
  return sheet(page, id).evaluate((el) => {
    const r = el.getBoundingClientRect()
    return { top: r.top, bottom: r.bottom, height: r.height, vh: window.innerHeight }
  })
}

/** At rest = bottom edge on the bottom of the screen. */
async function expectAtRest(page: Page, id: string) {
  await expect.poll(async () => {
    const b = await box(page, id)
    return Math.abs(b.bottom - b.vh)
  }, { timeout: 3_000 }).toBeLessThan(1)
}

/** Drag the sheet's grabber down by `fraction` of the sheet's height. `fast`
 *  flicks it (three moves, no pause, release at speed); otherwise it moves in
 *  steps and holds still before letting go, so it releases at ~0 px/s. */
async function dragGrabber(page: Page, id: string, fraction: number, fast = false) {
  const g = (await sheet(page, id).getByTestId("sheet-grabber").boundingBox())!
  const { height } = await box(page, id)
  const x = g.x + g.width / 2
  const y = g.y + g.height / 2
  const dy = height * fraction
  await page.mouse.move(x, y)
  await page.mouse.down()
  if (fast) {
    await page.mouse.move(x, y + dy, { steps: 3 })
  } else {
    for (let i = 1; i <= 10; i++) {
      await page.mouse.move(x, y + (dy * i) / 10)
      await page.waitForTimeout(40)
    }
    await page.waitForTimeout(200)
  }
  await page.mouse.up()
}

async function openTune(page: Page) {
  await page.getByRole("button", { name: /Tune this task/ }).click()
  await expect(sheet(page, TUNE)).toBeVisible()
  await expectAtRest(page, TUNE)
}

test.describe("bottom sheet @ 390x844", () => {
  test.use({ viewport: PHONE })

  test("opening animates: the sheet rises over several frames, then settles at rest", async ({ page }) => {
    await openTaskPage(page)
    // Sample the sheet's top on every frame from before the tap.
    await page.evaluate((id) => {
      const w = window as unknown as { __tops: number[] }
      w.__tops = []
      const t0 = performance.now()
      const tick = () => {
        const el = document.querySelector(`[data-testid="${id}"]`)
        if (el) w.__tops.push(el.getBoundingClientRect().top)
        if (performance.now() - t0 < 1500) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    }, TUNE)
    await page.getByRole("button", { name: /Tune this task/ }).click()
    await page.waitForTimeout(1600)
    const tops = await page.evaluate(() => (window as unknown as { __tops: number[] }).__tops)
    const { top: rest, vh } = await box(page, TUNE)

    expect(tops.length, "sampled frames").toBeGreaterThan(10)
    expect(tops[0], "starts below the screen edge").toBeGreaterThanOrEqual(vh - 1)
    for (let i = 1; i < tops.length; i++) {
      // Strictly rising (top decreasing); half a pixel for the spring's
      // sub-pixel settle.
      expect(tops[i], `frame ${i} moved down`).toBeLessThanOrEqual(tops[i - 1] + 0.5)
    }
    const distinct = new Set(tops.map((t) => Math.round(t)))
    expect(distinct.size, "moved through several positions, not one jump").toBeGreaterThanOrEqual(6)
    const tail = tops.slice(-5)
    for (const t of tail) expect(Math.abs(t - rest), "settled at rest").toBeLessThan(0.5)
    expect(Math.abs(rest + (await box(page, TUNE)).height - vh)).toBeLessThan(1)
  })

  test("dragging the grabber down 40% and letting go closes it", async ({ page }) => {
    await openTaskPage(page)
    await openTune(page)
    await dragGrabber(page, TUNE, 0.4)
    await expect(sheet(page, TUNE)).toHaveCount(0)
  })

  test("dragging 10% slowly springs back to rest, still open", async ({ page }) => {
    await openTaskPage(page)
    await openTune(page)
    await dragGrabber(page, TUNE, 0.1)
    await expectAtRest(page, TUNE)
    await page.waitForTimeout(500)
    await expect(sheet(page, TUNE)).toBeVisible()
  })

  test("a quick flick of 15% closes it", async ({ page }) => {
    await openTaskPage(page)
    await openTune(page)
    await dragGrabber(page, TUNE, 0.15, true)
    await expect(sheet(page, TUNE)).toHaveCount(0)
  })

  test("the scrim follows the drag", async ({ page }) => {
    await openTaskPage(page)
    await openTune(page)
    const scrim = page.getByTestId("sheet-scrim")
    const atRest = Number(await scrim.evaluate((el) => getComputedStyle(el).opacity))
    const g = (await sheet(page, TUNE).getByTestId("sheet-grabber").boundingBox())!
    const { height } = await box(page, TUNE)
    await page.mouse.move(g.x + g.width / 2, g.y + 2)
    await page.mouse.down()
    await page.mouse.move(g.x + g.width / 2, g.y + 2 + height * 0.25, { steps: 5 })
    const mid = Number(await scrim.evaluate((el) => getComputedStyle(el).opacity))
    await page.mouse.move(g.x + g.width / 2, g.y + 2, { steps: 5 })
    await page.waitForTimeout(200)
    await page.mouse.up()
    expect(atRest).toBeCloseTo(1, 2)
    expect(mid).toBeGreaterThan(0.65)
    expect(mid).toBeLessThan(0.85)
  })

  test("a sheet with unsaved edits stays open and asks before discarding", async ({ page }) => {
    await openTaskPage(page)
    const opener = page.getByRole("button", { name: "Edit task" })
    await opener.click()
    await expectAtRest(page, EDIT)
    const name = sheet(page, EDIT).getByPlaceholder("What is this task called?")
    const original = await name.inputValue()
    await name.fill(`${original} (edited)`)

    // A drag that would close a clean sheet: springs back and asks.
    await dragGrabber(page, EDIT, 0.4)
    const prompt = page.getByTestId("sheet-discard-prompt")
    await expect(prompt).toBeVisible()
    await expect(prompt).toContainText("Discard changes?")
    await expectAtRest(page, EDIT)
    await page.getByRole("button", { name: "Keep editing" }).click()
    await expect(prompt).toHaveCount(0)
    await expect(name).toHaveValue(`${original} (edited)`)

    // Escape asks too; Discard closes.
    await page.keyboard.press("Escape")
    await expect(prompt).toBeVisible()
    await page.getByRole("button", { name: "Discard" }).click()
    await expect(sheet(page, EDIT)).toHaveCount(0)

    // Reopened, it starts from the saved name.
    await opener.click()
    await expect(sheet(page, EDIT).getByPlaceholder("What is this task called?")).toHaveValue(original)
  })

  test("a scrim tap on a dirty sheet asks; on a clean one it closes", async ({ page }) => {
    await openTaskPage(page)
    await page.getByRole("button", { name: "Edit task" }).click()
    await expectAtRest(page, EDIT)
    // The scrim shows above the sheet's top edge.
    await page.mouse.click(PHONE.width / 2, 20)
    await expect(sheet(page, EDIT)).toHaveCount(0)

    await page.getByRole("button", { name: "Edit task" }).click()
    await expectAtRest(page, EDIT)
    await sheet(page, EDIT).getByPlaceholder("What is this task called?").fill("Something else")
    await page.mouse.click(PHONE.width / 2, 20)
    await expect(page.getByTestId("sheet-discard-prompt")).toBeVisible()
    await expect(sheet(page, EDIT)).toBeVisible()
  })

  test("Escape closes it and focus returns to the button that opened it", async ({ page }) => {
    await openTaskPage(page)
    await openTune(page)
    // Focus moved into the sheet.
    expect(await sheet(page, TUNE).evaluate((el) => el.contains(document.activeElement))).toBe(true)
    await page.keyboard.press("Escape")
    await expect(sheet(page, TUNE)).toHaveCount(0)
    await expect.poll(() => page.evaluate(() => document.activeElement?.textContent ?? "")).toContain("Tune this task")
  })

  test("it is a modal dialog with a name, and sits above the tab bar", async ({ page }) => {
    await openTaskPage(page)
    await page.getByRole("button", { name: "Edit task" }).click()
    await expectAtRest(page, EDIT)
    const dialog = page.getByRole("dialog", { name: "Edit task" })
    await expect(dialog).toHaveAttribute("aria-modal", "true")
    // Save is at the bottom of the screen, where the tab bar is: the tap
    // must land on Save, not the bar.
    const save = sheet(page, EDIT).getByRole("button", { name: /Save changes/ })
    const b = (await save.boundingBox())!
    const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest("button")?.textContent ?? "", [b.x + b.width / 2, b.y + b.height / 2])
    expect(hit).toContain("Save changes")
  })
})

/** Reduce Motion, set on the page before the app loads (Motion reads the
 *  setting once, at its first use). The `reducedMotion` context option did not
 *  reach the page under this config's project settings; emulateMedia does. */
async function reduceMotion(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" })
}

test.describe("bottom sheet under Reduce Motion @ 390x844", () => {
  test.use({ viewport: PHONE })

  test("the sheet fades in place — no slide", async ({ page }) => {
    await reduceMotion(page)
    await openTaskPage(page)
    expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true)
    await page.evaluate((id) => {
      const w = window as unknown as { __frames: { ty: number; op: number }[] }
      w.__frames = []
      const t0 = performance.now()
      const tick = () => {
        const el = document.querySelector<HTMLElement>(`[data-testid="${id}"]`)
        if (el) {
          const m = new DOMMatrixReadOnly(getComputedStyle(el).transform)
          w.__frames.push({ ty: m.m42, op: Number(getComputedStyle(el).opacity) })
        }
        if (performance.now() - t0 < 800) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    }, TUNE)
    await page.getByRole("button", { name: /Tune this task/ }).click()
    await page.waitForTimeout(900)
    const frames = await page.evaluate(() => (window as unknown as { __frames: { ty: number; op: number }[] }).__frames)
    await expect(sheet(page, TUNE)).toHaveAttribute("data-sheet-mode", "fade")
    expect(frames.length).toBeGreaterThan(5)
    for (const f of frames) expect(f.ty, "never translated").toBe(0)
    expect(frames[0].op, "starts transparent").toBeLessThan(0.5)
    expect(frames.some((f) => f.op > 0 && f.op < 1), "fades through partial opacity").toBe(true)
    expect(frames[frames.length - 1].op).toBe(1)
  })
})

/** The shared Button (Settings' "Sign out"), held down — and slid off before
 *  release, so nothing is clicked. */
async function pressedButtonStyle(page: Page) {
  await gotoStable(page, "/settings")
  const btn = page.getByRole("button", { name: "Sign out" })
  await btn.waitFor({ timeout: 20_000 })
  await expect(btn).toHaveAttribute("data-slot", "button")
  await btn.scrollIntoViewIfNeeded()
  const b = (await btn.boundingBox())!
  // The finger lands on the button itself, not on a bar painted over it.
  const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest("button")?.textContent ?? "", [b.x + b.width / 2, b.y + b.height / 2])
  expect(hit).toContain("Sign out")
  const rest = await btn.evaluate((el) => getComputedStyle(el).transform)
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
  await page.mouse.down()
  const pressed = await btn.evaluate((el) => ({ transform: getComputedStyle(el).transform, opacity: getComputedStyle(el).opacity }))
  // Slide off before letting go: no click lands.
  await page.mouse.move(2, 2)
  await page.mouse.up()
  return { rest, pressed }
}

test.describe("press feedback", () => {
  test.use({ viewport: PHONE })

  test("a Button shrinks to 96% and dims while pressed", async ({ page }) => {
    const { rest, pressed } = await pressedButtonStyle(page)
    expect(rest).toBe("none")
    expect(pressed.transform).toBe("matrix(0.96, 0, 0, 0.96, 0, 0)")
    expect(Number(pressed.opacity)).toBeLessThan(1)
  })

  test("an Items row washes the instant it is pressed", async ({ page }) => {
    await gotoStable(page, "/inventory")
    const row = page.locator("a.hh-press-row").filter({ visible: true }).first()
    await row.waitFor({ timeout: 20_000 })
    const rest = await row.evaluate((el) => getComputedStyle(el).backgroundColor)
    const b = (await row.boundingBox())!
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
    await page.mouse.down()
    const pressed = await row.evaluate((el) => getComputedStyle(el).backgroundColor)
    const wash = await row.evaluate(() => {
      const probe = document.createElement("div")
      probe.style.backgroundColor = "var(--hh-teal-wash)"
      document.body.appendChild(probe)
      const c = getComputedStyle(probe).backgroundColor
      probe.remove()
      return c
    })
    await page.mouse.move(2, 2)
    await page.mouse.up()
    expect(pressed).not.toBe(rest)
    expect(pressed).toBe(wash)
  })
})

test.describe("press feedback under Reduce Motion", () => {
  test.use({ viewport: PHONE })

  test("a Button dims but does not shrink", async ({ page }) => {
    await reduceMotion(page)
    const { pressed } = await pressedButtonStyle(page)
    expect(pressed.transform).toBe("none")
    expect(Number(pressed.opacity)).toBeLessThan(1)
  })
})
