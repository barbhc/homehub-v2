/**
 * Contrast of the theme tokens, computed from src/index.css itself.
 *
 * Dark mode broke the same way over and over: a colour chosen against one
 * theme's background (#15564A on the light page) got reused somewhere the
 * background flips (the --hh-ink toast), and nothing measured it until a
 * tester squinted. This reads the real :root and .dark values and holds every
 * text pairing the 2026-10-15 pass introduced at WCAG AA (4.5:1) in BOTH
 * themes. Translucent tokens are composited onto the surface they sit on, the
 * way the browser paints them.
 */
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const css = readFileSync("src/index.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "")

/** Top-level (unindented) `:root {` / `.dark {` blocks, merged in file order. */
function tokens(selector: ":root" | ".dark"): Record<string, string> {
  const out: Record<string, string> = {}
  const esc = selector.replace(".", "\\.")
  for (const block of css.matchAll(new RegExp(`(?:^|\\n)${esc}\\s*\\{([^}]*)\\}`, "g"))) {
    for (const decl of block[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[decl[1]] = decl[2].trim()
  }
  return out
}

const light = tokens(":root")
const dark = { ...light, ...tokens(".dark") }

type RGBA = [number, number, number, number]

function parse(value: string): RGBA {
  const v = value.trim()
  const hex = v.match(/^#([0-9a-f]{6})$/i)
  if (hex) {
    const n = parseInt(hex[1], 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1]
  }
  const rgba = v.match(/^rgba?\(([^)]+)\)$/i)
  if (rgba) {
    const [r, g, b, a = 1] = rgba[1].split(",").map(Number)
    return [r, g, b, a]
  }
  throw new Error(`not a flat colour: ${value}`)
}

const over = (top: RGBA, under: RGBA): RGBA => {
  const a = top[3]
  return [0, 1, 2].map((i) => top[i] * a + under[i] * (1 - a)).concat(1) as RGBA
}

const luminance = ([r, g, b]: RGBA) => {
  const lin = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

/** Contrast of `fg` on a stack of backgrounds, topmost first. */
function contrast(theme: Record<string, string>, fg: string, ...bgs: string[]): number {
  const resolve = (t: string) => parse(t.startsWith("--") ? theme[t] : t)
  let bg = resolve(bgs[bgs.length - 1])
  for (let i = bgs.length - 2; i >= 0; i--) bg = over(resolve(bgs[i]), bg)
  let text = resolve(fg)
  if (text[3] < 1) text = over(text, bg)
  const [hi, lo] = [luminance(text), luminance(bg)].sort((a, b) => b - a)
  return (hi + 0.05) / (lo + 0.05)
}

// [what, foreground, ...backgrounds topmost-first]
const PAIRS: [string, string, ...string[]][] = [
  ["UndoBar 'Undo' on the ink toast", "--hh-accent-on-ink", "--hh-ink"],
  ["Ask › Recent row title", "--hh-ink-soft", "--hh-surface"],
  ["text on a teal wash (task rationale, variant note)", "--hh-ink-soft", "--hh-teal-wash", "--hh-surface"],
  ["safety note on clay wash", "--hh-clay-ink", "--hh-clay-soft", "--hh-surface"],
  ["suggestion footnote on gold wash", "--hh-gold-ink", "--hh-gold-soft", "--hh-surface"],
  ["recall notes on the slate notice", "--hh-sub", "--hh-slate-soft", "--hh-bg"],
  ["Settings › Interface selected hint", "--hh-sub", "--hh-teal-wash", "--hh-surface"],
  ["task-detail error text", "--hh-clay", "--hh-surface"],
  ["faint text on surface", "--hh-faint", "--hh-surface"],
]

describe("theme token contrast (WCAG AA, 4.5:1)", () => {
  for (const [name, theme] of [["light", light], ["dark", dark]] as const) {
    for (const [what, fg, ...bgs] of PAIRS) {
      it(`${name}: ${what}`, () => {
        expect(contrast(theme, fg, ...bgs), `${name} ${fg} on ${bgs.join(" over ")}`).toBeGreaterThanOrEqual(4.5)
      })
    }
  }

  it("the UndoBar accent really flips (the bug was one colour for both)", () => {
    expect(light["--hh-accent-on-ink"]).not.toBe(dark["--hh-accent-on-ink"])
  })

  it("the old UndoBar colour fails, so this test can tell the difference", () => {
    expect(contrast(light, "--hh-teal-deep", "--hh-ink")).toBeLessThan(4.5)
    expect(contrast(dark, "--hh-teal-deep", "--hh-ink")).toBeLessThan(4.5)
  })

  it("the UndoBar draws Undo with the token this file checks", () => {
    const bar = readFileSync("src/components/ui/UndoBar.tsx", "utf8")
    expect(bar).toContain('background: "var(--hh-ink)"')
    expect(bar).toContain('color: "var(--hh-accent-on-ink)"')
  })
})
