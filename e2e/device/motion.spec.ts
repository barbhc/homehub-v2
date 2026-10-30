import { test, expect, type Page, type CDPSession } from "@playwright/test"
import { SEED_TODAY } from "../seed-config"

/**
 * Apple polish, Phase 2 — "the small ones" (motion): tab press, tab content
 * fade, skeleton → content, the scroll-edge hairline, pull to refresh.
 *
 * Plain @playwright/test, NOT e2e/fixtures: that fixture zeroes every animation
 * and transition, and motion is what is being measured here. The clock is
 * pinned the same way (setFixedTime only — timers keep running) so the seeded
 * agenda reads as it does in every other suite.
 *
 * A phone: 390x844 with touch. Touches are real Chromium touch events sent
 * over CDP, so the pull is judged through the same listeners a finger hits.
 */

const PHONE = { width: 390, height: 844 }
const TASK_TITLE = "Replace HVAC furnace filter"
const ITEM_NAME = "Bosch 800 Series Dishwasher"
const SWR_CACHE_KEY = "hh-swr-dashboard-cache"
const visible = { visible: true } as const

test.use({ viewport: PHONE, hasTouch: true })

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date(`${SEED_TODAY}T10:00:00`))
  // Count persisted SWR writes: every successful fetch of a persisted key
  // (Home's two dashboard keys, the Tasks agenda, the Items list) writes the
  // snapshot exactly once (swrPersist.persistSwrSnapshot). That is the count
  // of SWR fetches that landed — what "one refresh" has to mean.
  await page.addInitScript((key) => {
    const w = window as unknown as { __persistWrites: number }
    w.__persistWrites = 0
    const orig = Storage.prototype.setItem
    Storage.prototype.setItem = function (k: string, v: string) {
      if (this === window.localStorage && k === key) w.__persistWrites++
      return orig.call(this, k, v)
    }
  }, SWR_CACHE_KEY)
})

const writes = (page: Page) => page.evaluate(() => (window as unknown as { __persistWrites: number }).__persistWrites)

/** Wait until no persisted write has landed for `quietMs` (the page's reads have settled). */
async function settled(page: Page, quietMs = 1200) {
  let last = await writes(page)
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(quietMs)
    const now = await writes(page)
    if (now === last) return
    last = now
  }
}

async function openTasks(page: Page) {
  await page.goto("/maintenance")
  await page.getByText(TASK_TITLE).filter(visible).first().waitFor({ timeout: 20_000 })
  await settled(page)
}

/** A vertical touch drag of `dy` px starting at (x, y), over `steps` moves. */
async function touchDrag(cdp: CDPSession, x: number, y: number, dy: number, opts: { steps?: number; release?: boolean } = {}) {
  const steps = opts.steps ?? 8
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] })
  for (let i = 1; i <= steps; i++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y + (dy * i) / steps }] })
  }
  if (opts.release !== false) await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
}

/** Sample <main>'s computed opacity every frame for `ms`, starting now. */
async function startOpacitySampler(page: Page, selector: string, ms = 400) {
  await page.evaluate(
    ({ selector, ms }) => {
      const w = window as unknown as { __samples: { t: number; o: number }[] }
      w.__samples = []
      const t0 = performance.now()
      const tick = () => {
        const el = document.querySelector(selector)
        const t = performance.now() - t0
        if (el) w.__samples.push({ t, o: Number(getComputedStyle(el).opacity) })
        if (t < ms) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    },
    { selector, ms },
  )
}
const samples = (page: Page) => page.evaluate(() => (window as unknown as { __samples: { t: number; o: number }[] }).__samples)

function expectFadeIn(s: { t: number; o: number }[]) {
  // It starts transparent, never steps backwards, and lands opaque after
  // roughly --dur-fade (200ms) — not in one frame, and not dragging on.
  const firstAfterNav = s.find((p) => p.o < 1)
  expect(firstAfterNav, "the fade began").toBeTruthy()
  expect(Math.min(...s.map((p) => p.o)), "starts near transparent").toBeLessThan(0.35)
  const fading = s.slice(s.indexOf(firstAfterNav!))
  for (let i = 1; i < fading.length; i++) expect(fading[i].o).toBeGreaterThanOrEqual(fading[i - 1].o - 0.001)
  const opaqueAt = fading.find((p) => p.o >= 0.999)
  expect(opaqueAt, "reached full opacity").toBeTruthy()
  const duration = opaqueAt!.t - firstAfterNav!.t
  expect(duration, `fade lasted ${Math.round(duration)}ms`).toBeGreaterThan(120)
  expect(duration).toBeLessThan(320)
}

for (const reduced of [false, true]) {
  test.describe(reduced ? "small motions · Reduce Motion" : "small motions", () => {
    // emulateMedia, not test.use({ reducedMotion }): on this pinned Playwright
    // the context option did not reach matchMedia (checked: it read false).
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ reducedMotion: reduced ? "reduce" : "no-preference" })
    })

    test("tab bar: an item dims the instant a finger lands, and comes back on release", async ({ page }) => {
      await openTasks(page)
      const tab = page.locator("nav.fixed").getByRole("link", { name: "Items" })
      const box = (await tab.boundingBox())!
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await page.mouse.down()
      await page.waitForTimeout(200)
      expect(Number(await tab.evaluate((el) => getComputedStyle(el).opacity))).toBeCloseTo(0.6, 2)
      // Move off before releasing, so this checks the press without navigating.
      await page.mouse.move(box.x + box.width / 2, box.y - 200)
      await page.mouse.up()
      await page.waitForTimeout(200)
      expect(Number(await tab.evaluate((el) => getComputedStyle(el).opacity))).toBe(1)
    })

    test("switching tabs fades the content in over ~200ms; a deep link does not fade", async ({ page }) => {
      await openTasks(page)
      // Deep link: nothing animating on <main>, opaque from the first frame.
      expect(await page.locator("main").evaluate((el) => el.getAnimations().length)).toBe(0)
      expect(Number(await page.locator("main").evaluate((el) => getComputedStyle(el).opacity))).toBe(1)

      // Long enough to cover the Home chunk loading on a cold dev server; the
      // fade is judged from its first frame, wherever that falls.
      await startOpacitySampler(page, "main", 2500)
      await page.locator("nav.fixed").getByRole("link", { name: "Home" }).click()
      await page.waitForTimeout(2700)
      expectFadeIn(await samples(page))
      // Reduce Motion keeps the fade — it moves nothing (iOS substitutes a dissolve).
      expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(reduced)
    })

    test("skeleton → content fades in; a warm revisit paints at once", async ({ page }) => {
      // Cold: no persisted snapshot, so Items must show its skeleton first.
      await page.addInitScript((key) => {
        if (!sessionStorage.getItem("motion-spec-cold")) {
          localStorage.removeItem(key)
          sessionStorage.setItem("motion-spec-cold", "1")
        }
        // Record whether the skeleton was actually on screen.
        const w = window as unknown as { __skeletonSeen: boolean }
        w.__skeletonSeen = false
        new MutationObserver(() => {
          if (document.querySelector('[data-testid="items-skeleton"]')) w.__skeletonSeen = true
        }).observe(document, { subtree: true, childList: true })
      }, SWR_CACHE_KEY)
      await page.goto("/inventory")
      const list = page.getByText(ITEM_NAME).filter(visible).first()
      await list.waitFor({ timeout: 20_000 })
      const itemsRoot = () => page.locator("main > div").first()
      expect(await page.evaluate(() => (window as unknown as { __skeletonSeen: boolean }).__skeletonSeen), "cold load showed the skeleton").toBe(true)
      await expect(itemsRoot()).toHaveClass(/hh-fade-in/)

      // Warm: leave and come back — the list is in SWR's memory, no skeleton, no content fade.
      await page.locator("nav.fixed").getByRole("link", { name: "Home" }).click()
      await page.getByRole("button", { name: "Mark done" }).filter(visible).first().waitFor({ timeout: 20_000 })
      await page.locator("nav.fixed").getByRole("link", { name: "Items" }).click()
      await list.waitFor()
      await expect(itemsRoot()).not.toHaveClass(/hh-fade-in/)

      // Warm start of Home (persisted snapshot on the first frame): a reload paints with no content fade.
      await page.goto("/home")
      await page.getByRole("button", { name: "Mark done" }).filter(visible).first().waitFor({ timeout: 20_000 })
      await expect(page.getByTestId("home-skeleton")).toHaveCount(0)
      await expect(page.locator("main > div").first()).not.toHaveClass(/hh-fade-in/)
    })

    test("scroll edge: no hairline at the top; it fades in once content passes under the header", async ({ page }) => {
      await page.goto("/__preview?s=sticky-header-scroll-edge")
      const header = page.getByTestId("scroll-edge-header")
      await header.waitFor()
      const lineOpacity = () => header.evaluate((el) => Number(getComputedStyle(el, "::after").opacity))
      await expect(header).not.toHaveAttribute("data-scrolled")
      expect(await lineOpacity()).toBe(0)

      await page.mouse.wheel(0, 500)
      await expect(header).toHaveAttribute("data-scrolled", "")
      await page.waitForTimeout(300)
      expect(await lineOpacity()).toBe(1)

      await page.mouse.wheel(0, -2000)
      await expect(header).not.toHaveAttribute("data-scrolled")
      await page.waitForTimeout(300)
      expect(await lineOpacity()).toBe(0)
    })

    for (const where of [
      { name: "Tasks", open: openTasks, perRefresh: 1 },
      {
        name: "Home",
        open: async (page: Page) => {
          await page.goto("/home")
          await page.getByRole("button", { name: "Mark done" }).filter(visible).first().waitFor({ timeout: 20_000 })
          await settled(page)
        },
        // Home's reload is its two dashboard keys (core + extras), one round.
        perRefresh: 2,
      },
    ]) {
      test(`pull to refresh on ${where.name}: 80px refreshes once, 30px does not, scrolling is untouched`, async ({ page }, info) => {
        await where.open(page)
        const cdp = await page.context().newCDPSession(page)
        const root = page.locator("[data-pull-spinner]").locator("xpath=../..")
        const spinner = page.locator("[data-pull-spinner]")

        // 30px: springs back, nothing fetched.
        let before = await writes(page)
        await touchDrag(cdp, 195, 320, 30)
        await page.waitForTimeout(1500)
        expect(await writes(page), "30px pull fetched nothing").toBe(before)
        await expect(page.getByRole("status").filter({ hasText: "Refreshing" })).toHaveCount(0)

        // 80px, held: the mid-pull frame.
        before = await writes(page)
        await touchDrag(cdp, 195, 320, 80, { release: false })
        await page.waitForTimeout(50)
        const transform = await root.evaluate((el) => (el as HTMLElement).style.transform)
        const spinnerOpacity = Number(await spinner.evaluate((el) => getComputedStyle(el).opacity))
        if (reduced) {
          expect(transform, "Reduce Motion: the page does not move").toBe("")
        } else {
          // Tracks the finger with resistance: moved, but less than the finger.
          const y = Number(/translate3d\(0px, ([\d.]+)px/.exec(transform)?.[1] ?? 0)
          expect(y).toBeGreaterThan(40)
          expect(y).toBeLessThan(80)
        }
        expect(spinnerOpacity, "spinner shown, armed").toBe(1)
        await page.screenshot({ path: info.outputPath(`mid-pull-${where.name.toLowerCase()}${reduced ? "-reduced" : ""}.png`) })
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })

        // Exactly one refresh round lands, then it springs back to rest.
        await expect.poll(() => writes(page), { timeout: 15_000 }).toBe(before + where.perRefresh)
        await page.waitForTimeout(1500)
        expect(await writes(page), "and no second round").toBe(before + where.perRefresh)
        await expect.poll(() => root.evaluate((el) => (el as HTMLElement).style.transform)).toBe("")
        await expect.poll(() => spinner.evaluate((el) => Number(getComputedStyle(el).opacity))).toBe(0)

        // Normal scrolling: a real touch scroll still moves the page, and fetches nothing.
        before = await writes(page)
        await cdp.send("Input.synthesizeScrollGesture", { x: 195, y: 600, yDistance: -300, gestureSourceType: "touch", speed: 1200 })
        await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(40)
        // …and back down from part-way: a scroll, not a pull.
        await cdp.send("Input.synthesizeScrollGesture", { x: 195, y: 300, yDistance: 400, gestureSourceType: "touch", speed: 1200 })
        await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
        await page.waitForTimeout(1500)
        expect(await writes(page), "scrolling fetched nothing").toBe(before)
      })
    }
  })
}
