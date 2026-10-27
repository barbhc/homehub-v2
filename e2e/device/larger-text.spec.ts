import { test, expect, gotoStable } from "../fixtures"
import type { Page } from "@playwright/test"
import { PAGES, removeSetupItem, type Setup } from "./pages"
import { appliedTypeScale, emulateIosBodySize } from "./typeScale"
import { SEED_TODAY } from "../seed-config"
import { readFileSync, writeFileSync } from "node:fs"

/**
 * Larger Text (HIG Dynamic Type): text grows with the iPhone's text-size
 * setting, and the layout makes room for it.
 *
 * The owner's constraint (2026-10-26): at the NORMAL size every screen stays as
 * it was; text grows only when someone raises the setting. The normal-size half
 * of that is a pixel comparison against main, which needs main served beside
 * this branch — see the LT_BASE_URL test at the bottom. This file's always-on
 * half drives the app at two raised sizes through the production measuring
 * script (typeScale.ts plays the iPhone) and asks four questions of every page:
 *
 *   1. Did it grow? The root is 16px x the scale.
 *   2. No sideways scroll: no text sits past either edge of the screen, except
 *      inside a container built to scroll sideways (chip rows).
 *   3. Nothing clipped: no text runs past the edge of an `overflow: hidden`
 *      box. A box that truncates ON PURPOSE (ellipsis or line-clamp) is printed,
 *      not failed — that is a design choice the setting does not change.
 *   4. Nothing spilling: no text runs out of the control or tinted box that
 *      holds it — a fixed-height pill or button whose label grew past it.
 *
 * Plus the dense rows: tab-bar labels stop at 1.5x their normal size.
 */

const SCALES = [
  { name: "xxxLarge", scale: 1.35 },
  { name: "AX (200%)", scale: 2 },
] as const

const JUDGED = ["home", "tasks", "task page", "your week", "items", "item page", "ask", "settings", "sign-in"]

/** Ask before a question: the launcher cards and the item filter (the answer
 *  state in PAGES hides them). */
const ASK_EMPTY: Setup = {
  name: "ask (empty)",
  open: async (page) => {
    await gotoStable(page, "/chat")
    await page.getByRole("button", { name: /Troubleshoot/ }).filter({ visible: true }).first().waitFor({ timeout: 20_000 })
  },
}

/** Tab label at the normal size (src/index.css --hh-tabbar-label), and its cap. */
const TAB_LABEL_PX = 12
const TAB_LABEL_CAP = 1.5

type Finding = { kind: "offscreen" | "clipped" | "spills" | "truncated"; text: string; detail: string }

async function textAudit(page: Page): Promise<Finding[]> {
  return page.evaluate(() => {
    const out: { kind: "offscreen" | "clipped" | "spills" | "truncated"; text: string; detail: string }[] = []
    const vw = document.documentElement.clientWidth
    const TOL = 1
    const label = (el: Element) => {
      const cls = typeof el.className === "string" ? el.className.split(/\s+/).slice(0, 6).join(".") : ""
      return `<${el.tagName.toLowerCase()}${cls ? "." + cls : ""}>`
    }
    const isBox = (el: Element, cs: CSSStyleDeclaration) => {
      if (el.matches("button, a[href], [role='button'], [role='tab'], input, select, textarea, label")) return true
      const bg = cs.backgroundColor
      const hasBg = bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent"
      const hasBorder = ["Top", "Right", "Bottom", "Left"].every(
        (s) => parseFloat(cs.getPropertyValue(`border-${s.toLowerCase()}-width`)) > 0,
      )
      return hasBg || hasBorder
    }
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    const seen = new Set<string>()
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const text = (n.textContent ?? "").trim()
      if (!text) continue
      const host = n.parentElement
      if (!host || host.closest(".sr-only, [aria-hidden='true'], script, style, svg, [data-sonner-toaster]")) continue
      const hcs = getComputedStyle(host)
      if (hcs.visibility === "hidden" || parseFloat(hcs.opacity) === 0) continue
      const range = document.createRange()
      range.selectNodeContents(n)
      const rects = [...range.getClientRects()].filter((r) => r.width > 0.5 && r.height > 0.5)
      if (!rects.length) continue
      const r = {
        left: Math.min(...rects.map((x) => x.left)),
        right: Math.max(...rects.map((x) => x.right)),
        top: Math.min(...rects.map((x) => x.top)),
        bottom: Math.max(...rects.map((x) => x.bottom)),
      }
      const short = text.slice(0, 40)
      const push = (kind: "offscreen" | "clipped" | "spills" | "truncated", detail: string) => {
        const key = `${kind}|${short}|${detail}`
        if (!seen.has(key)) { seen.add(key); out.push({ kind, text: short, detail }) }
      }
      let scrollsX = false
      let scrollsY = false
      let boxChecked = false
      let hidden = false
      for (let el: Element | null = host; el && el !== document.body; el = el.parentElement) {
        const cs = getComputedStyle(el)
        if (cs.display === "none" || (el as HTMLElement).inert) { hidden = true; break }
        const b = el.getBoundingClientRect()
        const intent = cs.textOverflow === "ellipsis" || (cs.webkitLineClamp && cs.webkitLineClamp !== "none")
        const ox = cs.overflowX, oy = cs.overflowY
        // A box that hides overflow: text past its edge is lost. Report it, then
        // judge the outer boxes by what is left visible (the clipped rect).
        if (ox === "hidden" || ox === "clip") {
          if (!scrollsX && (r.right > b.right + TOL || r.left < b.left - TOL)) {
            push(intent ? "truncated" : "clipped", `${label(el)} width ${Math.round(b.width)}, text ${Math.round(r.right - r.left)}`)
          }
          r.left = Math.max(r.left, b.left)
          r.right = Math.min(r.right, b.right)
        }
        if (oy === "hidden" || oy === "clip") {
          if (!scrollsY && (r.bottom > b.bottom + TOL || r.top < b.top - TOL)) {
            push(intent ? "truncated" : "clipped", `${label(el)} height ${Math.round(b.height)}, text ${Math.round(r.bottom - r.top)}`)
          }
          r.top = Math.max(r.top, b.top)
          r.bottom = Math.min(r.bottom, b.bottom)
        }
        if (r.right <= r.left || r.bottom <= r.top) { hidden = true; break }
        if (ox === "auto" || ox === "scroll") scrollsX = true
        if (oy === "auto" || oy === "scroll") scrollsY = true
        if (!boxChecked && isBox(el, cs)) {
          boxChecked = true
          const outX = !scrollsX && !intent && (r.right > b.right + TOL || r.left < b.left - TOL)
          const outY = !scrollsY && (r.bottom > b.bottom + TOL || r.top < b.top - TOL)
          if (outX || outY) push("spills", `${label(el)} ${Math.round(b.width)}x${Math.round(b.height)}, text ${Math.round(r.right - r.left)}x${Math.round(r.bottom - r.top)}`)
        }
      }
      if (hidden) continue
      if (!scrollsX && (r.right > vw + TOL || r.left < -TOL)) push("offscreen", `x ${Math.round(r.left)}..${Math.round(r.right)} of ${vw}`)
    }
    return out
  })
}

test.afterAll(async () => {
  if (process.env.FIRESTORE_EMULATOR_HOST) await removeSetupItem()
})

for (const s of SCALES) {
  test.describe(`Larger Text @ ${s.name} (${s.scale}x), phone 390x844`, () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
    test.beforeEach(async ({ page }) => {
      await emulateIosBodySize(page, 17 * s.scale)
    })

    for (const p of [...PAGES.filter((x) => JUDGED.includes(x.name)), ASK_EMPTY]) {
      test.describe(p.name, () => {
        if (p.signedOut) test.use({ storageState: { cookies: [], origins: [] } })

        test(`${p.name}: text grows, nothing clipped, spilled or off-screen`, async ({ page }) => {
          let findings: Finding[]
          try {
            await p.open(page)
            expect(await appliedTypeScale(page), "the root did not grow to the emulated setting").toBeCloseTo(s.scale, 2)
            await expect(page.locator("html")).toHaveAttribute("data-larger-text", "")
            findings = await textAudit(page)
          } finally {
            await p.cleanup?.()
          }
          const fail = findings.filter((f) => f.kind !== "truncated")
          const trunc = findings.filter((f) => f.kind === "truncated")
          console.log(
            `[larger-text:${s.scale}:${p.name}] failures ${fail.length}, truncated-by-design ${trunc.length}` +
              (fail.length ? "\n  " + fail.map((f) => `${f.kind}: "${f.text}" — ${f.detail}`).join("\n  ") : "") +
              (trunc.length ? "\n  truncated: " + trunc.map((f) => `"${f.text}"`).join(" · ") : ""),
          )
          expect(fail.map((f) => `${f.kind}: "${f.text}" — ${f.detail}`), `${p.name} @ ${s.scale}x`).toEqual([])
        })
      })
    }

    test("tab-bar labels stop at 1.5x", async ({ page }) => {
      await PAGES.find((x) => x.name === "home")!.open(page)
      const sizes = await page
        .locator("nav.fixed a span")
        .evaluateAll((els) => els.map((e) => parseFloat(getComputedStyle(e).fontSize)))
      expect(sizes.length).toBeGreaterThan(2)
      for (const px of sizes) {
        expect(px).toBeLessThanOrEqual(TAB_LABEL_PX * TAB_LABEL_CAP + 0.01)
        expect(px).toBeCloseTo(Math.min(TAB_LABEL_PX * s.scale, TAB_LABEL_PX * TAB_LABEL_CAP), 1)
      }
    })
  })
}

test.describe("Larger Text @ normal size", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test("an iPhone at the normal setting (17pt Body) renders at exactly 1x", async ({ page }) => {
    await emulateIosBodySize(page, 17)
    await PAGES.find((x) => x.name === "home")!.open(page)
    expect(await appliedTypeScale(page)).toBe(1)
    await expect(page.locator("html")).not.toHaveAttribute("data-larger-text", /.*/)
  })

  test("a smaller iPhone setting never shrinks the app", async ({ page }) => {
    await emulateIosBodySize(page, 14)
    await PAGES.find((x) => x.name === "home")!.open(page)
    expect(await appliedTypeScale(page)).toBe(1)
  })

  test("off iOS (this browser, unpatched) the scale is 1", async ({ page }) => {
    await PAGES.find((x) => x.name === "home")!.open(page)
    expect(await appliedTypeScale(page)).toBe(1)
  })
})

/**
 * The owner's constraint, measured: at the normal text size every judged screen
 * is pixel-for-pixel what main renders. Needs main served beside this branch
 * against the SAME seeded emulator, so it runs only when LT_BASE_URL names that
 * server (CI has no second checkout; the PR records a local run):
 *
 *   git worktree add --detach ../lt-base origin/main && (cd ../lt-base && \
 *     ln -s "$OLDPWD/node_modules" && npm run dev:emu -- --port 5296 --strictPort)
 *   LT_BASE_URL=http://localhost:5296 npx playwright test --config \
 *     playwright.device.config.ts e2e/device/larger-text.spec.ts -g "pixel"
 *
 * LT_ALLOW_DIFF=1 reports differences without failing — for reviewing a PR
 * that changes the normal size ON PURPOSE (the 12px text floor): every diff
 * image is attached for a person to look at.
 */
const BASE_URL = process.env.LT_BASE_URL

test.describe("Larger Text @ normal size: pixel-identical to main", () => {
  test.skip(!BASE_URL, "set LT_BASE_URL to main's dev server on the same emulator")
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  for (const p of PAGES.filter((x) => JUDGED.includes(x.name))) {
    test.describe(p.name, () => {
      if (p.signedOut) test.use({ storageState: { cookies: [], origins: [] } })

      test(`pixel: ${p.name} matches main at the normal size`, async ({ page, browser, storageState }, info) => {
        const shoot = async (target: Page) => {
          await p.open(target)
          await target.waitForTimeout(1500) // late images and fonts settle
          // A full-page capture places fixed bars (the tab bar) by the scroll
          // position at capture time, and the chat auto-scrolls: pin it.
          await target.evaluate(() => window.scrollTo(0, 0))
          // Masked: Settings' measured boot time (a timing, not layout).
          const timing = target.getByRole("button", { name: /Startup diagnostics/ }).locator(".font-mono")
          return target.screenshot({ fullPage: true, animations: "disabled", caret: "hide", mask: [timing] })
        }
        let ours: Buffer
        let theirs: Buffer
        try {
          ours = await shoot(page)
          // main, signed in as the same user: the same auth snapshot, moved to its origin.
          const state = typeof storageState === "string" ? JSON.parse(readFileSync(storageState, "utf8")) : storageState
          const moved = state ? JSON.parse(JSON.stringify(state).replaceAll(new URL(info.project.use.baseURL!).origin, BASE_URL!)) : undefined
          const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, baseURL: BASE_URL, storageState: moved })
          const base = await ctx.newPage()
          await base.clock.setFixedTime(new Date(`${SEED_TODAY}T10:00:00`))
          await base.addInitScript(() => {
            const style = document.createElement("style")
            style.textContent = "*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition-duration:0s!important;transition-delay:0s!important;scroll-behavior:auto!important}"
            const apply = () => document.documentElement.appendChild(style)
            if (document.documentElement) apply()
            else document.addEventListener("DOMContentLoaded", apply)
          })
          theirs = await shoot(base)
          await ctx.close()
        } finally {
          await p.cleanup?.()
        }
        const diff = await page.evaluate(async ([a, b]) => {
          const load = async (src: string) => createImageBitmap(await (await fetch(src)).blob())
          const [ia, ib] = await Promise.all([load(a), load(b)])
          const w = Math.max(ia.width, ib.width), h = Math.max(ia.height, ib.height)
          const px = (img: ImageBitmap) => {
            const c = new OffscreenCanvas(w, h)
            const g = c.getContext("2d")!
            g.drawImage(img, 0, 0)
            return g.getImageData(0, 0, w, h).data
          }
          const da = px(ia), db = px(ib)
          const out = new OffscreenCanvas(w, h)
          const og = out.getContext("2d")!
          const marks = og.createImageData(w, h)
          let n = 0, top = h, bottom = -1
          for (let i = 0; i < da.length; i += 4) {
            const same = da[i] === db[i] && da[i + 1] === db[i + 1] && da[i + 2] === db[i + 2] && da[i + 3] === db[i + 3]
            marks.data[i] = same ? da[i] * 0.3 + 178 : 255
            marks.data[i + 1] = same ? da[i + 1] * 0.3 + 178 : 0
            marks.data[i + 2] = same ? da[i + 2] * 0.3 + 178 : 0
            marks.data[i + 3] = 255
            if (!same) { n++; const y = Math.floor(i / 4 / w); top = Math.min(top, y); bottom = Math.max(bottom, y) }
          }
          og.putImageData(marks, 0, 0)
          const blob = await out.convertToBlob()
          const bytes = new Uint8Array(await blob.arrayBuffer())
          let bin = ""
          for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
          return { n, top, bottom, sizeA: [ia.width, ia.height], sizeB: [ib.width, ib.height], png: btoa(bin) }
        }, [`data:image/png;base64,${ours!.toString("base64")}`, `data:image/png;base64,${theirs!.toString("base64")}`] as const)
        await info.attach(`${p.name} — this branch`, { body: ours!, contentType: "image/png" })
        await info.attach(`${p.name} — main`, { body: theirs!, contentType: "image/png" })
        if (diff.n) {
          await info.attach(`${p.name} — differences in red`, { body: Buffer.from(diff.png, "base64"), contentType: "image/png" })
          writeFileSync(info.outputPath("diff.png"), Buffer.from(diff.png, "base64"))
          writeFileSync(info.outputPath("branch.png"), ours!)
          writeFileSync(info.outputPath("main.png"), theirs!)
        }
        console.log(`[larger-text:pixel:${p.name}] branch ${diff.sizeA.join("x")} main ${diff.sizeB.join("x")}: ${diff.n} px differ${diff.n ? ` (rows ${diff.top}–${diff.bottom})` : ""}`)
        if (!process.env.LT_ALLOW_DIFF) expect(diff.n, `${p.name}: pixels that differ from main at the normal size`).toBe(0)
      })
    })
  }
})
