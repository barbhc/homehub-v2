import type { Page } from "@playwright/test"

/**
 * Make Chromium answer the Larger Text probe the way an iPhone does.
 *
 * The app has no test hook for its text scale: index.html's pre-paint script
 * measures the iOS system Body size (`font: -apple-system-body`, 17px at the
 * normal setting) behind an iOS-only gate, and that is the only code that sets
 * `--type-scale`. So the test plays the iPhone instead — it answers the two
 * `CSS.supports` gates as iOS WebKit does and reports `bodyPx` as the probe's
 * font size — and the PRODUCTION script does the rest (ratio, clamp,
 * `data-larger-text`). Nothing here changes what ships.
 *
 * Body sizes by iOS setting: Large (default) 17 · xxxLarge 23 · AX1 28 ·
 * AX2 33 · AX3 40 · AX5 53. Pass `17 * scale` for an exact scale.
 */
export async function emulateIosBodySize(page: Page, bodyPx: number): Promise<void> {
  await page.addInitScript((px: number) => {
    const supports = CSS.supports.bind(CSS) as (a: string, b?: string) => boolean
    CSS.supports = ((a: string, b?: string) =>
      a === "-webkit-touch-callout" || (a === "font" && b === "-apple-system-body") ? true : supports(a, b)) as typeof CSS.supports
    const gcs = window.getComputedStyle.bind(window)
    window.getComputedStyle = ((el: Element, pseudo?: string | null) => {
      const style = gcs(el, pseudo)
      // The probe is the one <span> the script appends straight to <html>.
      if (el instanceof HTMLSpanElement && el.parentNode === document.documentElement) {
        return new Proxy(style, { get: (t, k) => (k === "fontSize" ? `${px}px` : Reflect.get(t, k)) })
      }
      return style
    }) as typeof window.getComputedStyle
  }, bodyPx)
}

/** The root scale the app actually applied (html font-size / 16). */
export async function appliedTypeScale(page: Page): Promise<number> {
  return page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize) / 16)
}
