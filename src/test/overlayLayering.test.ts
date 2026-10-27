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

  // Every bottom sheet is now the shared BottomSheet (Apple polish phase 2).
  // It portals (Radix Dialog.Portal → <body>), is `fixed` to the screen, and
  // its "raised" layer is the explicit z-[60]/z-[70] the hand-built sheets had.
  it("the shared sheet portals, is fixed to the screen, and its raised layer outranks the nav", () => {
    const src = read("../components/ui/BottomSheet.tsx")
    expect(src).toContain("<DialogPrimitive.Portal")
    expect(src).toMatch(/className=\{cn\("fixed inset-0"/)
    expect(src).toContain('"fixed inset-x-0 bottom-0')
    const raised = src.match(/raised: \{ scrim: "z-\[(\d+)\]", panel: "z-\[(\d+)\]" \}/)
    expect(raised, "the raised layer moved — re-point this test").not.toBeNull()
    expect(Number(raised![1])).toBeGreaterThan(NAV_Z)
    expect(Number(raised![2])).toBeGreaterThan(Number(raised![1]))
  })

  // The task page's Mark done sheet and Tune sheet were `absolute` to the page
  // wrapper: opened from the bottom of a long task, the sheet sat off-screen
  // and its scrim covered the wrapper, not the screen (Apple HIG review,
  // 2026-10). The edit sheet's Save and Cancel sat behind the nav. All three
  // are the shared sheet on its raised layer.
  for (const [name, file, marker] of [
    ["the task edit sheet", "../components/tasks/TaskEditSheet.tsx", "export function TaskEditSheet"],
    ["the Mark done confirm sheet", "../components/home/RefinedTaskDetail.tsx", "function ConfirmDoneSheet"],
    ["the Tune sheet", "../components/care/TaskFeedbackSheet.tsx", "export function TaskFeedbackSheet"],
  ] as const) {
    it(`${name} is the shared sheet, above the nav`, () => {
      const src = read(file)
      const body = src.slice(src.indexOf(marker))
      const fn = body.slice(0, body.indexOf("\n}\n"))
      expect(fn).toContain("<BottomSheet")
      expect(fn).toContain('layer="raised"')
      expect(fn, "an absolute sheet is positioned against the page, not the screen").not.toMatch(/className="absolute inset/)
    })
  }

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
    expect(read("../components/ui/BottomSheet.tsx")).toContain("[&>*]:min-w-0")
  })
})

describe("HH-90 — a dialog taller than the screen must scroll", () => {
  // DialogContent is fixed and centred with a translate, so without an explicit
  // max-height + overflow it grows past BOTH viewport edges and nothing
  // scrolls. The owner hit it on the add-manual dialog the moment search
  // results rendered: "Add" below the fold, the header under the status bar,
  // and no way to reach either. Every dialog in the app shares this container.
  it("caps the shared DialogContent at the viewport and scrolls inside", () => {
    const src = read("../components/ui/dialog.tsx")
    expect(src).toContain("max-h-[calc(100dvh-32px)]")
    expect(src).toContain("overflow-y-auto")
    // dvh, not vh — iOS Safari's collapsing chrome makes vh taller than the
    // visible viewport, which would leave the bottom edge cut off again.
    expect(src).not.toContain("max-h-[calc(100vh-32px)]")
  })
})
