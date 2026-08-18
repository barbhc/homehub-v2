/**
 * Two tap-blocking regressions from the 2026-08-18 beta round, pinned.
 *
 * Both were invisible to behavioural tests: jsdom does no hit-testing and
 * applies no Tailwind CSS, so a click always reaches its handler and every
 * computed z-index is "". These assertions are therefore structural on
 * purpose — they pin the two class names that decide, in a real browser,
 * whether a control can be tapped at all.
 */
import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const read = (p: string) => readFileSync(resolve(__dirname, p), "utf8")

describe("decorative overlays never take pointer events", () => {
  it("the swipe-reveal layer behind a task row is pointer-events-none", () => {
    // `absolute inset-0` on the row CONTAINER, which grows to include the
    // expanded detail panel. The layer is positioned and the panel is not, so
    // the layer paints on top — and opacity:0 is still a hit target. Without
    // pointer-events-none, "View full guide", "Mark done" and "Snooze" inside
    // the expanded card silently do nothing.
    const src = read("../components/home/RefinedWeek.tsx")
    const layer = src.match(/className="[^"]*absolute inset-0 flex"/)
    expect(layer, "the swipe-reveal layer moved — re-point this test").not.toBeNull()
    expect(layer![0]).toContain("pointer-events-none")
  })
})

describe("modal surfaces sit above the tab bar", () => {
  // AppLayout's bottom nav is `fixed bottom-0 z-50`. Anything modal that is
  // (a) rendered inline rather than portalled, or (b) not above z-50, loses to
  // it: the nav painted over TaskEditSheet's Save and Cancel buttons.
  const NAV_Z = 50

  it("the task edit sheet portals to <body>", () => {
    const src = read("../components/tasks/TaskEditSheet.tsx")
    expect(src).toContain("createPortal")
    expect(src).toContain("document.body")
  })

  it("the task edit sheet's overlay and panel outrank the nav", () => {
    const src = read("../components/tasks/TaskEditSheet.tsx")
    const zIndexes = [...src.matchAll(/\bz-\[(\d+)\]/g)].map((m) => Number(m[1]))
    expect(zIndexes.length, "expected explicit z-[n] on the overlay and the panel").toBe(2)
    for (const z of zIndexes) expect(z).toBeGreaterThan(NAV_Z)
  })

  it("the nav is still the z-50 this test is calibrated against", () => {
    // If the nav's own z-index moves, the two assertions above stop meaning
    // what they claim. Fail loudly here rather than passing vacuously.
    const nav = read("../components/AppLayout.tsx").match(/<nav className="fixed bottom-0 inset-x-0 z-(\d+)/)
    expect(nav, "the bottom nav moved — recheck the modal layering").not.toBeNull()
    expect(Number(nav![1])).toBe(NAV_Z)
  })
})

describe("modal children are allowed to shrink", () => {
  /**
   * Radix DialogContent is `display: grid` and SheetContent is `display: flex`.
   * Their children default to `min-width: auto`, which means they refuse to go
   * narrower than their max-content width — so one `truncate` line (which is
   * `white-space: nowrap`, i.e. enormous max-content) widened the whole dialog
   * past the viewport. Measured 2026-08-18: a 343px dialog with 527px of
   * content, clipped on the right. `min-w-0` on the inner span was useless,
   * because the GRID ITEM above it never shrank.
   */
  it("dialog content lets its children shrink below max-content", () => {
    expect(read("../components/ui/dialog.tsx")).toContain("[&>*]:min-w-0")
  })

  it("sheet content does too", () => {
    expect(read("../components/ui/sheet.tsx")).toContain("[&>*]:min-w-0")
  })
})
