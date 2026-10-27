/**
 * Larger Text: the pre-paint script in index.html is the ONE place the app's
 * text scale is set (src/index.css multiplies the root by --type-scale). It is
 * inline — it must run before first paint — so it is tested here by running the
 * exact text from index.html against a stubbed browser.
 *
 * What must hold (owner, 2026-10-26: "I prefer the original text size"):
 *   - at the iPhone's normal setting (Body 17pt) the scale is exactly 1;
 *   - it only grows: a smaller setting, or a desktop Safari reporting 13px for
 *     the same system font, never shrinks the app;
 *   - off iOS WebKit nothing is measured at all;
 *   - it follows the setting when the person comes back from Settings.
 */
import { afterEach, describe, expect, it, vi } from "vitest"
import { readFileSync } from "node:fs"

const html = readFileSync("index.html", "utf8")
const script = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
  .map((m) => m[1])
  .find((s) => s.includes("-apple-system-body"))

type Env = { ios: boolean; bodyPx: number }

function boot(env: Env) {
  const root = document.documentElement
  root.removeAttribute("style")
  root.removeAttribute("data-larger-text")
  vi.stubGlobal("CSS", {
    supports: (a: string, b?: string) =>
      env.ios && (a === "-webkit-touch-callout" || (a === "font" && b === "-apple-system-body")),
  })
  const real = window.getComputedStyle.bind(window)
  vi.spyOn(window, "getComputedStyle").mockImplementation((el: Element, p?: string | null) => {
    if (el instanceof HTMLSpanElement && el.parentNode === root) {
      return { fontSize: `${env.bodyPx}px` } as CSSStyleDeclaration
    }
    return real(el, p)
  })
  // Each boot is a fresh page: run the script as the browser would.
  new Function(script!)()
  return {
    scale: () => root.style.getPropertyValue("--type-scale"),
    larger: () => root.hasAttribute("data-larger-text"),
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("Larger Text pre-paint script", () => {
  it("is in index.html", () => {
    expect(script).toBeTruthy()
  })

  it("leaves the app at exactly 1x at the iPhone's normal text size", () => {
    const page = boot({ ios: true, bodyPx: 17 })
    expect(page.scale()).toBe("1")
    expect(page.larger()).toBe(false)
  })

  it("grows by the measured Body size over 17 (xxxLarge = 23pt)", () => {
    const page = boot({ ios: true, bodyPx: 23 })
    expect(page.scale()).toBe(String(Math.round((23 / 17) * 1000) / 1000))
    expect(page.larger()).toBe(true)
  })

  it("never shrinks: a smaller setting, or 13px from desktop Safari, stays 1", () => {
    expect(boot({ ios: true, bodyPx: 14 }).scale()).toBe("1")
    expect(boot({ ios: true, bodyPx: 13 }).scale()).toBe("1")
  })

  it("caps at 3.2x (the largest accessibility size is 53pt = 3.12x)", () => {
    expect(boot({ ios: true, bodyPx: 53 }).scale()).toBe(String(Math.round((53 / 17) * 1000) / 1000))
    expect(boot({ ios: true, bodyPx: 80 }).scale()).toBe("3.2")
  })

  it("measures nothing off iOS WebKit, whatever the system font reports", () => {
    const page = boot({ ios: false, bodyPx: 40 })
    expect(page.scale()).toBe("1")
    expect(page.larger()).toBe(false)
    expect(window.getComputedStyle).not.toHaveBeenCalled()
  })

  it("re-measures when the person comes back from Settings", () => {
    const env = { ios: true, bodyPx: 17 }
    const page = boot(env)
    expect(page.scale()).toBe("1")
    env.bodyPx = 34
    document.dispatchEvent(new Event("visibilitychange"))
    expect(page.scale()).toBe("2")
    expect(page.larger()).toBe(true)
    env.bodyPx = 17
    window.dispatchEvent(new Event("resize"))
    expect(page.scale()).toBe("1")
    expect(page.larger()).toBe(false)
  })
})
