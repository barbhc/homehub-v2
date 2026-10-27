import { test, expect } from "../fixtures"
import type { Page } from "@playwright/test"
import { PAGES, removeSetupItem } from "./pages"
import { emulateIosBodySize } from "./typeScale"

/**
 * Every tap is at least 44 pt — measured by where a finger lands, not by box size.
 *
 * Apple HIG: a control needs a hit region of at least 44×44 pt. Barb's design
 * rule 4 says the same and adds HOW: grow the hit area (padding or a hit-slop),
 * not the glyph, so nothing looks bigger at the normal text size. That is why
 * this audit cannot read `getBoundingClientRect()` the way the matrix suite's
 * report does: a 36px circle with an invisible 44px `::after` slop (the
 * `hit-44` utilities in src/index.css) is a correct 44pt target whose box still
 * says 36.
 *
 * So it asks the browser the question a finger asks. For every visible
 * interactive element it scrolls the control to the middle of the screen and
 * walks `document.elementFromPoint` out from the centre, 1px at a time, up,
 * down, left and right, until a probe stops landing on the control (or a
 * descendant, or its <label>). A walk that runs off the screen counts as
 * reaching the edge. Then:
 *
 *   1. SIZE — the region must span at least 43px (44 less a pixel of
 *      rounding) on each axis. Walking rather than probing a fixed ±21 cross
 *      is what lets a region grow toward free space (`hit-44-up` and friends)
 *      instead of only around its centre.
 *   2. OVERLAP — where a walk stops on a NEIGHBOURING control, the control
 *      must have reached the midline between the two boxes (to within
 *      MIDLINE_SLACK). Short of it, the neighbour's hit area has taken taps that land nearer this
 *      control: an ambiguous tap. (This is the install-step bug: a tap 2px
 *      under step 1's circle toggled step 2.)
 *   3. A centre that lands on a neighbouring control fails outright — that is
 *      overlap at its worst. A centre under something that is NOT a control (a
 *      sheet, a sticky bar) is occlusion, not size: listed, not judged.
 *   4. Nothing reachable only on hover.
 *
 * Dense rows are the one declared exception: a control carrying
 * `data-hit-dense="<reason>"` sits in a list whose pitch is under 44 (install
 * steps, manual rows) and takes the whole row band instead. Its HEIGHT is
 * exempt from rule 1; rule 2 still holds it to its half of every gap, so the
 * rows tile with no tap belonging to two of them. Each one is printed.
 *
 * Controls skipped because their centre sits off-screen inside a clipped
 * scroller are printed too, so a skip cannot hide a control.
 *
 * Phone (390×844), iPad portrait (820×1180), and the phone at a raised iOS text
 * size (Larger Text, 1.35x) and the iPad at 200% text. iPads run the md+ layouts with
 * a finger, which is why the desktop-width exemption is `pointer: coarse`, not
 * a breakpoint.
 */

const VIEWPORTS: { name: string; width: number; height: number; bodyPx?: number }[] = [
  { name: "phone", width: 390, height: 844 },
  { name: "iPad portrait", width: 820, height: 1180 },
  // Larger Text: the phone again with the iPhone's text size at xxxLarge (Body
  // 23pt, 1.35x). Text grows there, and controls that hug it must not start
  // sharing taps with their neighbours. See typeScale.ts.
  { name: "phone, xxxLarge text", width: 390, height: 844, bodyPx: 23 },
  // And the iPad's md/lg layouts at 200% text (Body 34pt).
  { name: "iPad portrait, 200% text", width: 820, height: 1180, bodyPx: 34 },
]

/** 44pt less a pixel of sub-pixel rounding. */
const MIN_SPAN = 43
const MAX_WALK = 44
/**
 * How far short of the midline a control may stop before it counts as
 * overlapped: sub-pixel rounding, plus the unequal halves two different-sized
 * 44pt slops make (a 32px avatar's slop reaches 6px out, a 36px icon's 4px).
 * The install-step bug this rule was written for was 7px.
 */
const MIDLINE_SLACK = 2

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

type Miss = { label: string; w: number; h: number; why: string[] }
type Audit = { offenders: Miss[]; obscured: string[]; skipped: string[]; dense: string[]; hoverOnly: string[]; checked: number }

async function hitAudit(page: Page): Promise<Audit> {
  return page.evaluate(
    async ({ selector, ignored, minSpan, maxWalk, slack }) => {
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
      /** The control a probe landed on, if it is a different, unrelated one. */
      const neighbour = (el: HTMLElement, hit: Element | null): HTMLElement | null => {
        const ctl = hit?.closest<HTMLElement>(selector) ?? null
        if (!ctl || ctl === el || el.contains(ctl) || ctl.contains(el)) return null
        return ctl
      }
      const hiddenByOpacity = (el: HTMLElement) => {
        for (let a: HTMLElement | null = el; a; a = a.parentElement) if (getComputedStyle(a).opacity === "0") return true
        return false
      }
      const vw = document.documentElement.clientWidth
      const vh = window.innerHeight
      const offenders: Miss[] = []
      const obscured: string[] = []
      const skipped: string[] = []
      const dense: string[] = []
      const hoverOnly: string[] = []
      let checked = 0
      const els = Array.from(document.body.querySelectorAll<HTMLElement>(selector))
      for (const el of els) {
        if (ignored.some((sel) => el.closest(sel))) continue
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
        if (cx < 0 || cy < 0 || cx >= vw || cy >= vh) {
          skipped.push(`${labelOf(el)} (centre off-screen in a clipped scroller)`)
          continue
        }
        const centre = document.elementFromPoint(cx, cy)
        if (!owns(el, centre)) {
          const n = neighbour(el, centre)
          if (n) offenders.push({ label: labelOf(el), w: Math.round(r.width), h: Math.round(r.height), why: [`centre taken by ${describe(n)}`] })
          else obscured.push(`${labelOf(el)} (under ${describe(centre)})`)
          continue
        }
        checked++
        const why: string[] = []
        const reach: Record<string, number> = {}
        const dirs = [["up", 0, -1], ["down", 0, 1], ["left", -1, 0], ["right", 1, 0]] as const
        for (const [dir, dx, dy] of dirs) {
          let d = 1
          let stop: HTMLElement | null = null
          for (; d <= maxWalk; d++) {
            const x = cx + dx * d
            const y = cy + dy * d
            if (x < 0 || y < 0 || x >= vw || y >= vh) { d = maxWalk + 1; break } // the screen edge
            const hit = document.elementFromPoint(x, y)
            if (!owns(el, hit)) { stop = neighbour(el, hit); break }
          }
          reach[dir] = d - 1
          if (stop) {
            // Rule 2: the control must own its half of the gap to a neighbour.
            const n = stop.getBoundingClientRect()
            const ownEdge = dir === "up" ? r.top : dir === "down" ? r.bottom : dir === "left" ? r.left : r.right
            const theirEdge = dir === "up" ? n.bottom : dir === "down" ? n.top : dir === "left" ? n.right : n.left
            const sign = dir === "up" || dir === "left" ? -1 : 1
            const gap = (theirEdge - ownEdge) * sign
            const midline = ownEdge + sign * Math.max(gap, 0) / 2
            const reached = (dir === "up" || dir === "down" ? cy : cx) + sign * (d - 1)
            if ((midline - reached) * sign > slack) {
              why.push(`${dir}: ${describe(stop)} takes taps ${Math.round((midline - reached) * sign)}px short of the midline`)
            }
          }
        }
        const spanH = reach.left + reach.right + 1
        const spanV = reach.up + reach.down + 1
        const denseReason = el.getAttribute("data-hit-dense")
        if (spanH < minSpan) why.push(`width ${spanH}px`)
        if (spanV < minSpan) {
          if (denseReason) dense.push(`${labelOf(el)} — ${Math.round(spanV)}px tall: ${denseReason}`)
          else why.push(`height ${spanV}px`)
        }
        if (why.length) offenders.push({ label: labelOf(el), w: Math.round(r.width), h: Math.round(r.height), why })
      }
      window.scrollTo(0, 0)
      return { offenders, obscured, skipped, dense, hoverOnly, checked }
    },
    { selector: SELECTOR, ignored: IGNORED, minSpan: MIN_SPAN, maxWalk: MAX_WALK, slack: MIDLINE_SLACK },
  )
}

/**
 * A sentinel item with an open Setup band — install steps on their 33px pitch,
 * one of them already done (so its row carries the redo mark). The seed has no
 * saved setup steps (the microwave's are still in an unsaved review), so this
 * spec writes its own, to the EMULATOR only, and removes them afterwards.
 */
// Belt and braces: the setup-band page removes its sentinel itself; this
// catches a run that stopped between the seed and that cleanup.
test.afterAll(async () => {
  if (process.env.FIRESTORE_EMULATOR_HOST) await removeSetupItem()
})

for (const vp of VIEWPORTS) {
  test.describe(`hit targets ≥44pt @ ${vp.name} (${vp.width}×${vp.height})`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height }, hasTouch: true, isMobile: true })
    if (vp.bodyPx) {
      const bodyPx = vp.bodyPx
      test.beforeEach(async ({ page }) => {
        await emulateIosBodySize(page, bodyPx)
      })
    }

    for (const p of PAGES) {
      test.describe(p.name, () => {
        if (p.signedOut) test.use({ storageState: { cookies: [], origins: [] } })

        test(`${p.name}: every control takes a 44pt tap`, async ({ page }) => {
          let audit: Audit
          try {
            await p.open(page)
            audit = await hitAudit(page)
          } finally {
            await p.cleanup?.()
          }
          const offenders = audit.offenders.filter(
            (o) => !ALLOWLIST.some((a) => a.page.test(p.name) && a.label.test(o.label)),
          )
          const line = (o: Miss) => `${o.label} (${o.w}×${o.h}): ${o.why.join("; ")}`
          for (const [type, list] of [["obscured (not judged)", audit.obscured], ["skipped", audit.skipped], ["dense rows", audit.dense]] as const) {
            if (list.length) test.info().annotations.push({ type, description: list.join(" · ") })
          }
          console.log(
            `[hit-targets:${vp.name}:${p.name}] checked ${audit.checked}, offenders ${offenders.length}, hover-only ${audit.hoverOnly.length}, obscured ${audit.obscured.length}, skipped ${audit.skipped.length}, dense ${audit.dense.length}` +
              (offenders.length ? "\n  " + offenders.map(line).join("\n  ") : "") +
              (audit.obscured.length ? `\n  obscured (not judged): ${audit.obscured.join(" · ")}` : "") +
              (audit.skipped.length ? `\n  skipped: ${audit.skipped.join(" · ")}` : "") +
              (audit.dense.length ? `\n  dense rows: ${audit.dense.join(" · ")}` : ""),
          )
          expect(audit.checked, `${p.name}: the audit found no controls — the page did not render`).toBeGreaterThan(0)
          expect(audit.hoverOnly, `${p.name} @ ${vp.name}: controls only visible on hover (no hover on touch)`).toEqual([])
          expect(offenders.map(line), `${p.name} @ ${vp.name}: these controls do not take a clean 44pt tap`).toEqual([])
        })
      })
    }
  })
}
