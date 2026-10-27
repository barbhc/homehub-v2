/**
 * The boot splash is the first screen's background and nothing else
 * (Apple-polish phase 3, owner-approved; HIG "Launching": no logo, no text, no
 * animation, match the first screen and the device's appearance).
 *
 * Its colours are the one place index.html restates a token — they must paint
 * before the stylesheet applies — so they are pinned to --hh-bg here. The iOS
 * shell's AppBackground colour asset (barbhc/homehub) carries the same two
 * values; change one and change both, or the cold start shows a seam.
 */
import indexHtml from "../../index.html?raw"
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

// Read from disk, as themeContrast.test.ts does: a `?raw` CSS import comes back
// empty under vitest's CSS handling.
const indexCss = readFileSync("src/index.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "")

function hhBg(block: "light" | "dark"): string {
  // Light lives in the first :root block that defines it, dark in the .dark one.
  const all = [...indexCss.matchAll(/--hh-bg:\s*(#[0-9A-Fa-f]{6})/g)].map((m) => m[1].toUpperCase())
  expect(all.length).toBeGreaterThanOrEqual(2)
  return block === "light" ? all[0] : all[1]
}

const splashCss = (() => {
  const style = indexHtml.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? ""
  // Comments out, so a colour or word QUOTED in the explanation is never read as a rule.
  return style.replace(/\/\*[\s\S]*?\*\//g, "")
})()

describe("boot splash", () => {
  it("is an empty element — no mark, no wordmark, nothing to read", () => {
    expect(indexHtml).toMatch(/<div id="boot-splash" aria-hidden="true"><\/div>/)
    expect(indexHtml).not.toContain("bs-mark")
    expect(indexHtml).not.toContain("bs-word")
  })

  it("does not animate (only the one-off fade out, and none under Reduce Motion)", () => {
    expect(splashCss).not.toMatch(/@keyframes|animation\s*:/)
    expect(splashCss).toMatch(/prefers-reduced-motion:\s*reduce\)\s*{\s*#boot-splash\s*{\s*transition:\s*none/)
  })

  it("is the page colour, light and dark, from the token with a matching fallback", () => {
    const light = splashCss.match(/#boot-splash\s*{[^}]*background:\s*var\(--hh-bg,\s*(#[0-9A-Fa-f]{6})\)/)?.[1]
    const dark = splashCss.match(/html\.dark #boot-splash\s*{[^}]*background:\s*var\(--hh-bg,\s*(#[0-9A-Fa-f]{6})\)/)?.[1]
    expect(light?.toUpperCase()).toBe(hhBg("light"))
    expect(dark?.toUpperCase()).toBe(hhBg("dark"))
    expect(splashCss).not.toMatch(/gradient/)
  })

  it("is no longer brand teal anywhere in the cold-start markup", () => {
    expect(splashCss.toUpperCase()).not.toContain("#1B6B5A")
    expect(splashCss.toUpperCase()).not.toContain("#2D9B82")
  })
})
