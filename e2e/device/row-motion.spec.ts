import { test, expect, gotoStable } from "../fixtures"
import type { Page } from "@playwright/test"

/**
 * Task rows that move (Apple polish phase 2) — the approved demo's checklist,
 * measured on the real Tasks page at 390x844 against the seeded emulator
 * (https://claude.ai/artifact/1DwQLYdx2ewMk3RoYrxp8t, "Try the motion").
 *
 * Measured by sampling the DOM every animation frame inside the page, not by
 * screenshots: "it animates" means a value passes through several in-between
 * states, and "it settles" means it stops at the resting value with nothing
 * left inline. The fixture zeroes CSS transitions; the row motion is driven by
 * Motion in JS, which is exactly what is under test.
 *
 * Every Done here is undone before its 6s window runs out, so nothing is
 * written and the seed stays as it was (the CI emulator has no functions, so a
 * written Done would come back refused).
 */

const PHONE = { width: 390, height: 844 }

/** In-page helpers, installed once per page. */
async function installHelpers(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as Record<string, unknown>
    w.__rows = () =>
      [...document.querySelectorAll<HTMLElement>("[data-testid=phone-task-row]")].filter(
        (r) => r.offsetHeight > 0 && !r.hasAttribute("data-leaving"),
      )
    w.__frames = (n: number, fn: () => unknown) =>
      new Promise((resolve) => {
        const out: unknown[] = []
        const step = () => {
          out.push(fn())
          if (out.length >= n) resolve(out)
          else requestAnimationFrame(step)
        }
        requestAnimationFrame(step)
      })
  })
}

async function openTasks(page: Page) {
  await page.setViewportSize(PHONE)
  await gotoStable(page, "/maintenance")
  await page.locator("[data-testid=phone-task-row]").filter({ visible: true }).first().waitFor({ timeout: 20_000 })
  await installHelpers(page)
}

const headline = (page: Page) => page.getByText(/^\d+ to do$/).filter({ visible: true }).first()
const toDo = async (page: Page) => Number((await headline(page).textContent())!.split(" ")[0])

/** Undo the bar's Done (or Snooze) and wait until every row is whole again. */
async function undo(page: Page, title: string) {
  await page.getByTestId("undo-bar").filter({ visible: true }).getByRole("button", { name: "Undo" }).click()
  const row = page.locator("[data-testid=phone-task-row]").filter({ visible: true }).filter({ hasText: title })
  await expect(row).toHaveCount(1)
  await expect.poll(() => row.evaluate((r) => r.getAttribute("style")), { timeout: 3000 }).toBe("border-top: 0.5px solid var(--hh-line);")
}

test.describe("Task rows in motion — Tasks, phone", () => {
  test("expand: the row's height grows over several frames, then settles open", async ({ page }) => {
    await openTasks(page)
    const samples = (await page.evaluate(async () => {
      const w = window as unknown as { __rows: () => HTMLElement[]; __frames: (n: number, fn: () => unknown) => Promise<number[]> }
      const row = w.__rows()[0]
      row.querySelector<HTMLButtonElement>("button[aria-expanded]")!.click()
      return w.__frames(40, () => row.getBoundingClientRect().height)
    })) as number[]
    const rising = samples.filter((h, i) => i > 0 && h > samples[i - 1] + 0.5).length
    expect(rising, `heights ${samples.map(Math.round).join(",")}`).toBeGreaterThanOrEqual(4)
    // Settled: the last frames agree, and the open row is taller than it started.
    const tail = samples.slice(-5)
    expect(Math.max(...tail) - Math.min(...tail)).toBeLessThan(0.5)
    expect(tail[0]).toBeGreaterThan(samples[0] + 40)
    const opener = page.locator("[data-testid=phone-task-row]").filter({ visible: true }).first().locator("button[aria-expanded]")
    await expect(opener).toHaveAttribute("aria-expanded", "true")
    // At rest nothing is left inline on the expanded part.
    await expect.poll(() => opener.evaluate((b) => b.closest("[data-testid=phone-task-row]")!.querySelector("[data-testid=phone-task-row-surface]")!.nextElementSibling?.getAttribute("style") ?? "")).toBe("")
  })

  test("tap again mid-expand reverses it", async ({ page }) => {
    await openTasks(page)
    const r = (await page.evaluate(async () => {
      const w = window as unknown as { __rows: () => HTMLElement[]; __frames: (n: number, fn: () => unknown) => Promise<number[]> }
      const row = w.__rows()[0]
      const opener = row.querySelector<HTMLButtonElement>("button[aria-expanded]")!
      const start = row.getBoundingClientRect().height
      opener.click()
      const opening = await w.__frames(6, () => row.getBoundingClientRect().height)
      opener.click()
      const closing = await w.__frames(30, () => row.getBoundingClientRect().height)
      return { start, opening, closing, expanded: opener.getAttribute("aria-expanded") }
    })) as { start: number; opening: number[]; closing: number[]; expanded: string }
    const peak = r.opening[r.opening.length - 1]
    expect(peak).toBeGreaterThan(r.start + 2)
    expect(r.closing[r.closing.length - 1]).toBeCloseTo(r.start, 0)
    expect(r.expanded).toBe("false")
  })

  test("tick: the row leaves, the rows below glide up, it is gone in under 600ms, the count drops — Undo brings it back whole", async ({ page }) => {
    await openTasks(page)
    const before = await toDo(page)
    const r = (await page.evaluate(async () => {
      const w = window as unknown as { __rows: () => HTMLElement[] }
      const rows = w.__rows()
      // A row with a sibling below it in the same card.
      const row = rows.find((x) => x.nextElementSibling?.getAttribute("data-testid") === "phone-task-row")!
      const sib = row.nextElementSibling as HTMLElement
      const title = row.querySelector("button[aria-expanded] span span")!.textContent
      const t0 = performance.now()
      row.querySelector<HTMLButtonElement>("button[aria-label='Mark done']")!.click()
      const ys: number[] = []
      let leavingSeen = false
      let goneAt = -1
      await new Promise<void>((resolve) => {
        const step = () => {
          if (row.hasAttribute("data-leaving")) leavingSeen = true
          ys.push(sib.getBoundingClientRect().y)
          if (!row.isConnected && goneAt < 0) goneAt = performance.now() - t0
          if (performance.now() - t0 > 900) resolve()
          else requestAnimationFrame(step)
        }
        requestAnimationFrame(step)
      })
      return { title, ys, leavingSeen, goneAt }
    })) as { title: string; ys: number[]; leavingSeen: boolean; goneAt: number }
    expect(r.leavingSeen).toBe(true)
    expect(r.goneAt, "row removed").toBeGreaterThan(0)
    expect(r.goneAt).toBeLessThan(600)
    // Siblings glide: never move down, and pass through several in-between positions.
    for (let i = 1; i < r.ys.length; i++) expect(r.ys[i]).toBeLessThanOrEqual(r.ys[i - 1] + 0.5)
    const steps = r.ys.filter((y, i) => i > 0 && y < r.ys[i - 1] - 0.5).length
    expect(steps, `sibling y ${r.ys.map(Math.round).join(",")}`).toBeGreaterThanOrEqual(4)
    expect(r.ys[0] - r.ys[r.ys.length - 1]).toBeGreaterThan(40)
    expect(await toDo(page)).toBe(before - 1)
    await undo(page, r.title)
    expect(await toDo(page)).toBe(before)
    // Back whole: nothing left inline on the slide layer either.
    const row = page.locator("[data-testid=phone-task-row]").filter({ visible: true }).filter({ hasText: r.title })
    expect(await row.evaluate((x) => (x.querySelector("[data-testid=phone-task-row-surface]")!.parentElement as HTMLElement).getAttribute("style"))).toBe("background: var(--hh-surface);")
  })

  async function swipe(page: Page, opts: { dx: number; steps: number; stepMs: number; pauseMs: number }) {
    const surface = page.getByTestId("phone-task-row-surface").filter({ visible: true }).first()
    const title = (await surface.locator("button[aria-expanded] span span").first().textContent())!
    const box = (await surface.boundingBox())!
    const y = box.y + box.height / 2
    const x0 = box.x + 80
    await page.mouse.move(x0, y)
    await page.mouse.down()
    for (let i = 1; i <= opts.steps; i++) {
      await page.mouse.move(x0 + (opts.dx * i) / opts.steps, y)
      if (opts.stepMs) await page.waitForTimeout(opts.stepMs)
    }
    if (opts.pauseMs) await page.waitForTimeout(opts.pauseMs)
    await page.mouse.up()
    return { title, width: box.width }
  }
  const rowNamed = (page: Page, title: string) =>
    page.locator("[data-testid=phone-task-row]").filter({ hasText: title }).filter({ visible: true })

  test("swipe: a fast 60px flick commits", async ({ page }) => {
    await openTasks(page)
    // Dispatched in the page on its own clock: 60px in ~32ms (~1900 px/s), up
    // 8ms after the last move. Driven through CDP, a loaded runner can put
    // 100ms between the last move and the release — which reads, correctly,
    // as a finger that stopped before lifting, and snaps back.
    const title = (await page.evaluate(async () => {
      const surface = [...document.querySelectorAll<HTMLElement>("[data-testid=phone-task-row-surface]")].find((s) => s.offsetHeight > 0)!
      const title = surface.querySelector("button[aria-expanded] span span")!.textContent
      const r = surface.getBoundingClientRect()
      const x0 = r.x + 80
      const y = r.y + r.height / 2
      const fire = (type: string, x: number) =>
        surface.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 7, pointerType: "touch", isPrimary: true, clientX: x, clientY: y, button: 0 }))
      const tick = () => new Promise((res) => setTimeout(res, 8))
      fire("pointerdown", x0)
      for (let i = 1; i <= 4; i++) {
        await tick()
        fire("pointermove", x0 + 15 * i)
      }
      await tick()
      fire("pointerup", x0 + 60)
      return title
    }))!
    await expect(page.getByTestId("undo-bar").filter({ visible: true })).toContainText(/^Done/)
    await expect(rowNamed(page, title)).toHaveCount(0)
    await undo(page, title)
  })

  test("swipe: a slow 60px drag springs back, nothing left inline", async ({ page }) => {
    await openTasks(page)
    const { title } = await swipe(page, { dx: 60, steps: 20, stepMs: 25, pauseMs: 200 })
    const row = rowNamed(page, title)
    await expect.poll(() => row.evaluate((r) => (r.querySelector("[data-testid=phone-task-row-surface]")!.parentElement as HTMLElement).style.transform), { timeout: 2000 }).toBe("")
    await expect(row).not.toHaveAttribute("data-reveal")
    await expect(page.getByTestId("undo-bar")).toHaveCount(0)
  })

  test("swipe: a slow drag past 40% of the width commits", async ({ page }) => {
    await openTasks(page)
    const box = (await page.getByTestId("phone-task-row-surface").filter({ visible: true }).first().boundingBox())!
    const { title } = await swipe(page, { dx: box.width * 0.4, steps: 25, stepMs: 20, pauseMs: 200 })
    await expect(page.getByTestId("undo-bar").filter({ visible: true })).toContainText(/^Done/)
    await expect(rowNamed(page, title)).toHaveCount(0)
    await undo(page, title)
  })

  test("swipe: past 60% the row resists, Done shows on the left, and the icon grows once armed", async ({ page }) => {
    await openTasks(page)
    const surface = page.getByTestId("phone-task-row-surface").filter({ visible: true }).first()
    const box = (await surface.boundingBox())!
    const y = box.y + box.height / 2
    // From the title (the check circle is not a swipe handle), 80% of the row's width.
    const x0 = box.x + 70
    await page.mouse.move(x0, y)
    await page.mouse.down()
    for (let i = 1; i <= 20; i++) await page.mouse.move(x0 + (box.width * 0.8 * i) / 20, y)
    const row = page.locator("[data-testid=phone-task-row]").filter({ visible: true }).first()
    const s = await row.evaluate((r) => ({
      reveal: r.getAttribute("data-reveal"),
      armed: r.hasAttribute("data-armed"),
      tx: new DOMMatrix(getComputedStyle(r.querySelector("[data-testid=phone-task-row-surface]")!.parentElement!).transform).m41,
      w: r.getBoundingClientRect().width,
    }))
    expect(s.reveal).toBe("done")
    expect(s.armed).toBe(true)
    // 1:1 to 60%, then x0.35: 80% of travel lands at 60% + 20%*0.35 = 67%.
    expect(s.tx / s.w).toBeGreaterThan(0.64)
    expect(s.tx / s.w).toBeLessThan(0.7)
    // Back off below the threshold and let go slowly: home again.
    for (let i = 1; i <= 20; i++) await page.mouse.move(x0 + box.width * 0.8 - (box.width * 0.75 * i) / 20, y)
    await page.waitForTimeout(200)
    await page.mouse.up()
    await expect.poll(() => row.evaluate((r) => r.hasAttribute("data-reveal")), { timeout: 2000 }).toBe(false)
  })
})

test.describe("Task rows in motion — vertical drags scroll", () => {
  test.use({ hasTouch: true })
  test("a vertical touch drag scrolls the list and never moves the row sideways", async ({ page }) => {
    await openTasks(page)
    const surface = page.getByTestId("phone-task-row-surface").filter({ visible: true }).nth(1)
    const box = (await surface.boundingBox())!
    const cdp = await page.context().newCDPSession(page)
    const x = box.x + box.width / 2
    const y0 = box.y + box.height / 2
    const top0 = box.y
    const pt = (y: number) => [{ x: x + (y0 - y) * 0.05, y }]
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pt(y0) })
    const txs: number[] = []
    for (let i = 1; i <= 15; i++) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pt(y0 - i * 12) })
      txs.push(await surface.evaluate((s) => new DOMMatrix(getComputedStyle(s.parentElement!).transform).m41))
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
    await page.waitForTimeout(300)
    const top1 = (await surface.boundingBox())!.y
    expect(top0 - top1, "the list scrolled").toBeGreaterThan(40)
    expect(Math.max(...txs.map(Math.abs))).toBe(0)
    await expect(page.getByTestId("undo-bar")).toHaveCount(0)
  })
})

test.describe("Task rows in motion — Reduce Motion", () => {
  test("a leaving row fades in place: no transform, ever; Undo brings it back", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" })
    await openTasks(page)
    const r = (await page.evaluate(async () => {
      const w = window as unknown as { __rows: () => HTMLElement[] }
      const row = w.__rows()[0]
      const title = row.querySelector("button[aria-expanded] span span")!.textContent
      const slide = row.querySelector("[data-testid=phone-task-row-surface]")!.parentElement as HTMLElement
      row.querySelector<HTMLButtonElement>("button[aria-label='Mark done']")!.click()
      const tx: string[] = []
      const op: number[] = []
      await new Promise<void>((resolve) => {
        const step = () => {
          if (!row.isConnected) return resolve()
          tx.push(getComputedStyle(slide).transform)
          op.push(Number(getComputedStyle(row).opacity))
          requestAnimationFrame(step)
        }
        requestAnimationFrame(step)
      })
      return { title, tx, op }
    })) as { title: string; tx: string[]; op: number[] }
    expect(new Set(r.tx)).toEqual(new Set(["none"]))
    expect(r.op.some((o) => o > 0.05 && o < 0.95), `opacity ${r.op.map((o) => o.toFixed(2)).join(",")}`).toBe(true)
    await undo(page, r.title)
  })
})
