import { test, expect, gotoStable } from "../fixtures"
import type { Page } from "@playwright/test"

/**
 * Every tap is at least 44 pt — measured by where a finger lands, not by box size.
 *
 * Apple HIG: a control needs a hit region of at least 44×44 pt. Barb's design
 * rule 4 says the same and adds HOW: grow the hit area (padding or a hit-slop),
 * not the glyph, so nothing looks bigger at the normal text size. That is why
 * this audit cannot read `getBoundingClientRect()` the way the matrix suite's
 * report does: a 36px circle with an invisible 44px `::after` slop (the
 * `hit-44` utility in src/index.css) is a correct 44pt target whose box still
 * says 36.
 *
 * So it asks the browser the question a finger asks. For every visible
 * interactive element it scrolls the control to the middle of the screen and
 * calls `document.elementFromPoint` at the centre and at ±21px horizontally
 * and vertically (a 42px cross — inside the 44px square with a pixel of
 * rounding to spare), clamped to the viewport. Each probe must land on the
 * control, a descendant of it, or its <label>. A probe that lands on empty
 * page means the target is too small; a probe that lands on a NEIGHBOURING
 * control means two hit areas overlap and the tap is ambiguous — both fail.
 *
 * A control whose centre is not itself (it sits under a sheet, a sticky bar,
 * or an overlay) is not judged here — that is occlusion, not size — and is
 * listed in the test's annotations so it cannot vanish silently.
 *
 * Phone (390×844) and iPad portrait (820×1180): iPads run the md+ layouts with
 * a finger, which is why the desktop-width exemption is `pointer: coarse`, not
 * a breakpoint.
 */

const VIEWPORTS = [
  { name: "phone", width: 390, height: 844 },
  { name: "iPad portrait", width: 820, height: 1180 },
] as const

const PROBE = 21

/**
 * Genuine exceptions, each with its reason. Match is by page + accessible label.
 * Only inline links inside running text belong here (WCAG 2.5.8 exempts a
 * target "in a sentence or block of text": padding it to 44 would break the
 * line height of the paragraph it lives in).
 */
const ALLOWLIST: { page: RegExp; label: RegExp; reason: string }[] = [
  {
    page: /^sign-in$/,
    label: /^(terms|privacy|terms of service|privacy policy)$/i,
    reason: "inline links inside the sign-in legal sentence (WCAG 2.5.8 inline exception)",
  },
]

const IGNORED = ["[aria-hidden='true']", "[data-radix-focus-guard]", "[data-sonner-toaster]", ".sr-only", "[inert]"]

const SELECTOR = [
  "button",
  "a[href]",
  "[role='button']",
  "[role='tab']",
  "[role='switch']",
  "[role='radio']",
  "[role='checkbox']",
  "input[type='checkbox']",
  "input[type='radio']",
  "summary",
].join(", ")

type Miss = { label: string; w: number; h: number; misses: string[]; hitBy: string[] }
type Audit = { offenders: Miss[]; obscured: string[]; hoverOnly: string[]; checked: number }

async function hitAudit(page: Page): Promise<Audit> {
  return page.evaluate(
    async ({ selector, ignored, probe }) => {
      const describe = (el: Element | null): string => {
        if (!el) return "(nothing)"
        const h = el as HTMLElement
        const name = (h.getAttribute("aria-label") || h.textContent || "").trim().replace(/\s+/g, " ").slice(0, 30)
        return `${el.tagName.toLowerCase()}${name ? ` "${name}"` : ""}`
      }
      const labelOf = (el: HTMLElement) =>
        (el.getAttribute("aria-label") || el.textContent || el.getAttribute("title") || el.tagName)
          .trim()
          .replace(/\s+/g, " ")
          .slice(0, 60)
      const owns = (el: HTMLElement, hit: Element | null) => {
        if (!hit) return false
        if (hit === el || el.contains(hit)) return true
        const labels = (el as HTMLInputElement).labels
        if (labels) for (const l of Array.from(labels)) if (l === hit || l.contains(hit)) return true
        return false
      }
      const hiddenByOpacity = (el: HTMLElement) => {
        for (let a: HTMLElement | null = el; a; a = a.parentElement) if (getComputedStyle(a).opacity === "0") return true
        return false
      }
      const vw = document.documentElement.clientWidth
      const vh = window.innerHeight
      const offenders: Miss[] = []
      const obscured: string[] = []
      const hoverOnly: string[] = []
      let checked = 0
      const els = Array.from(document.body.querySelectorAll<HTMLElement>(selector))
      for (const el of els) {
        if (ignored.some((sel) => el.closest(sel))) continue
        // An input drawn by its <label> (a visually hidden checkbox) is judged
        // through the label: the probe accepts a hit on it.
        const s = getComputedStyle(el)
        if (s.display === "none" || s.visibility === "hidden") continue
        let r = el.getBoundingClientRect()
        if (r.width === 0 || r.height === 0) continue
        if (hiddenByOpacity(el)) {
          // Reachable only by hover (opacity-0 until :hover / group-hover)
          // fails "nothing reachable only on hover" — a touch iPad has no hover.
          if (el.tagName !== "INPUT") hoverOnly.push(labelOf(el))
          continue
        }
        el.scrollIntoView({ block: "center", inline: "center" })
        await new Promise((res) => requestAnimationFrame(() => res(null)))
        r = el.getBoundingClientRect()
        const cx = r.left + r.width / 2
        const cy = r.top + r.height / 2
        if (cx < 0 || cy < 0 || cx > vw || cy > vh) continue // off-screen in a clipped scroller
        const centre = document.elementFromPoint(cx, cy)
        if (!owns(el, centre)) {
          obscured.push(`${labelOf(el)} (under ${describe(centre)})`)
          continue
        }
        checked++
        const clampX = (x: number) => Math.min(Math.max(x, 0), vw - 1)
        const clampY = (y: number) => Math.min(Math.max(y, 0), vh - 1)
        const probes: [string, number, number][] = [
          ["left", clampX(cx - probe), cy],
          ["right", clampX(cx + probe), cy],
          ["up", cx, clampY(cy - probe)],
          ["down", cx, clampY(cy + probe)],
        ]
        const misses: string[] = []
        const hitBy: string[] = []
        for (const [dir, x, y] of probes) {
          const hit = document.elementFromPoint(x, y)
          if (!owns(el, hit)) {
            misses.push(dir)
            hitBy.push(describe(hit))
          }
        }
        if (misses.length) offenders.push({ label: labelOf(el), w: Math.round(r.width), h: Math.round(r.height), misses, hitBy })
      }
      window.scrollTo(0, 0)
      return { offenders, obscured, hoverOnly, checked }
    },
    { selector: SELECTOR, ignored: IGNORED, probe: PROBE },
  )
}

const visible = { visible: true } as const
const TASK_TITLE = "Replace HVAC furnace filter"
const ANSWER = "Swap the furnace filter every three months, or monthly in a dusty house."

type Setup = { name: string; signedOut?: boolean; open: (page: Page) => Promise<void> }

const PAGES: Setup[] = [
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
      // The room filter loads on its own; judge the page with it in.
      await page.getByRole("button", { name: "Kitchen" }).filter(visible).first().waitFor({ timeout: 20_000 })
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
      ["deep clean", "/clean", /start cleaning|cleaning guides/i],
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

for (const vp of VIEWPORTS) {
  test.describe(`hit targets ≥44pt @ ${vp.name} (${vp.width}×${vp.height})`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height }, hasTouch: true, isMobile: true })

    for (const p of PAGES) {
      test.describe(p.name, () => {
        if (p.signedOut) test.use({ storageState: { cookies: [], origins: [] } })

        test(`${p.name}: every control takes a 44pt tap`, async ({ page }) => {
          await p.open(page)
          const audit = await hitAudit(page)
          const offenders = audit.offenders.filter(
            (o) => !ALLOWLIST.some((a) => a.page.test(p.name) && a.label.test(o.label)),
          )
          if (audit.obscured.length) {
            test.info().annotations.push({ type: "obscured (not judged)", description: audit.obscured.join(" · ") })
          }
          console.log(
            `[hit-targets:${vp.name}:${p.name}] checked ${audit.checked}, offenders ${offenders.length}, hover-only ${audit.hoverOnly.length}, obscured ${audit.obscured.length}` +
              (offenders.length
                ? "\n  " + offenders.map((o) => `${o.label} (${o.w}×${o.h}) misses ${o.misses.join("/")} → ${o.hitBy.join(", ")}`).join("\n  ")
                : "") +
              (audit.obscured.length ? `\n  obscured (not judged): ${audit.obscured.join(" · ")}` : ""),
          )
          expect(audit.checked, `${p.name}: the audit found no controls — the page did not render`).toBeGreaterThan(0)
          expect(audit.hoverOnly, `${p.name} @ ${vp.name}: controls only visible on hover (no hover on touch)`).toEqual([])
          expect(
            offenders.map((o) => `${o.label} (${o.w}×${o.h}) misses ${o.misses.join("/")} → ${o.hitBy.join(", ")}`),
            `${p.name} @ ${vp.name}: taps 21px from these controls' centres miss them`,
          ).toEqual([])
        })
      })
    }
  })
}
