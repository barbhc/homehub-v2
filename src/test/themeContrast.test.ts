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
 *
 * Filled teal controls with white on them use --hh-teal-fill (the light-mode
 * teal, in both themes). The source scan below fails if a new one reaches for
 * the bright --hh-teal / bg-primary instead — 2.70 / 3.43:1 under white in dark.
 * The 2026-10-26 pass did the same for the other tiers (--hh-clay-fill,
 * --hh-slate-fill, --hh-gold-fill) and pinned the rest of the dark-mode finish:
 * teal-deep as text, chevrons, the wizard's calm errors, the retired palette
 * classes. oklch tokens (exact Tailwind steps) are converted the way the
 * browser does, so a palette-class retirement is measured, not assumed.
 */
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
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

/** oklch() → sRGB 0–255 (Björn Ottosson's OKLab matrices, gamut-clipped). */
function oklch(l: number, c: number, hDeg: number, alpha: number): RGBA {
  const h = (hDeg * Math.PI) / 180
  const a = c * Math.cos(h), b = c * Math.sin(h)
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3
  const lin = [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ]
  const enc = (x: number) => {
    const v = Math.min(Math.max(x, 0), 1)
    return 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055)
  }
  return [enc(lin[0]), enc(lin[1]), enc(lin[2]), alpha]
}

function parse(value: string): RGBA {
  const v = value.trim()
  const ok = v.match(/^oklch\(\s*([\d.]+)%\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+))?\s*\)$/i)
  if (ok) return oklch(Number(ok[1]) / 100, Number(ok[2]), Number(ok[3]), ok[4] ? Number(ok[4]) : 1)
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
  // Every filled teal control carrying white text or a white glyph (Mark done,
  // Save, primary buttons, selected pills/days, toggles, checked boxes, Ask).
  ["white on a filled teal control", "#FFFFFF", "--hh-teal-fill"],
  ["primary-foreground on a filled teal control", "--t-primary-foreground", "--hh-teal-fill"],

  // ── 2026-10-26 dark-mode finish ─────────────────────────────────────────
  // --hh-teal-deep as TEXT: the "when" pill, the Done receipt, reminder notes,
  // the manual link, warranty links. Was 4.14 / 3.19 / 3.57:1 in dark.
  ["teal-deep text on the surface (when pill, Done receipt)", "--hh-teal-deep", "--hh-surface"],
  ["teal-deep text on a card", "--hh-teal-deep", "--t-card"],
  ["teal-deep text on a teal wash (reminder notes, ManualBlurb)", "--hh-teal-deep", "--hh-teal-wash", "--hh-surface"],
  ["teal-deep text on the wash band over the page", "--hh-teal-deep", "--hh-teal-wash", "--hh-bg"],
  ["teal-deep text on a wash over the raised surface", "--hh-teal-deep", "--hh-teal-wash", "--hh-surface2"],
  // Everything that puts white (--hh-on-fill) on a fill.
  ["on-fill on the teal fill", "--hh-on-fill", "--hh-teal-fill"],
  ["on-fill on the clay fill (Essential pill, Start-here flag)", "--hh-on-fill", "--hh-clay-fill"],
  ["on-fill on the slate fill (Optional pill)", "--hh-on-fill", "--hh-slate-fill"],
  ["on-fill on the gold fill (Snooze swipe)", "--hh-on-fill", "--hh-gold-fill"],
  ["white on the destructive fill (Delete)", "#FFFFFF", "--t-destructive-fill"],
  ["white on the destructive fill over a dialog", "#FFFFFF", "--t-destructive-fill", "--t-popover"],
  // Item page bands: header in the band's tone, count in faint, on its wash.
  ["Usage band header (violet) on its wash", "--hh-violet", "--hh-violet-soft", "--hh-surface"],
  ["Care band header (teal) on its wash", "--hh-teal", "--hh-teal-wash", "--hh-surface"],
  ["Setup band header (gold) on its wash", "--hh-gold", "--hh-gold-soft", "--hh-surface"],
  ["Reference band header (slate) on its wash", "--hh-slate", "--hh-slate-soft", "--hh-surface"],
  ["band count (faint) on the teal wash", "--hh-faint", "--hh-teal-wash", "--hh-surface"],
  ["band count (faint) on the gold wash", "--hh-faint", "--hh-gold-soft", "--hh-surface"],
  ["band count (faint) on the violet wash", "--hh-faint", "--hh-violet-soft", "--hh-surface"],
  ["band count (faint) on the slate wash", "--hh-faint", "--hh-slate-soft", "--hh-surface"],
  ["care step text (was literal #3C4A47)", "--hh-ink-soft", "--hh-surface"],
  // The wizard's required marks and "Not found in your photo" — calm clay on its card.
  ["wizard clay text on a card", "--hh-clay", "--t-card"],
  // Warranties
  ["Lapsed label on its tile", "--hh-neutral", "--hh-neutral-soft", "--hh-surface"],
  ["Lapsed stat on the surface", "--hh-neutral", "--hh-surface"],
  ["Expiring-soon coverage line on the gold card", "--hh-gold-sub", "--hh-gold-soft", "--hh-bg"],
  ["Expiring-soon kicker on the gold card", "--hh-gold", "--hh-gold-soft", "--hh-bg"],
  // Find-manual card's Beta tag (its tokens were referenced but never defined).
  ["Beta tag on its amber wash", "--hh-amber", "--hh-amber-wash", "--hh-surface"],
  ["mismatch note on the clay wash", "--hh-ink", "--hh-clay-wash", "--hh-surface"],
  // Retired palette classes (light = the exact Tailwind step it replaced).
  ["admin role badge", "--hh-info", "--hh-info-soft", "--t-card"],
  ["guest role badge", "--hh-warn", "--hh-warn-soft", "--t-card"],
  ["Saved (home profile)", "--hh-success", "--t-card"],
  ["chat 'About:' line", "--hh-warn", "--t-card"],
  ["caution callout text", "--hh-caution-ink", "--hh-caution-soft", "--t-card"],
  ["AI source chip", "--hh-ai-ink", "--hh-ai-soft", "--t-card"],
  ["web source chip", "--hh-web-ink", "--hh-web-soft", "--t-card"],
  ["Search the web button", "--hh-web-ink", "--t-card"],
  // Signed-out and tour text on the surface.
  ["tour Back button / sign-in labels (sub)", "--hh-sub", "--hh-surface"],
]

// [what, foreground, ...backgrounds] — icons, switch tracks and fill markers:
// WCAG 1.4.11 asks 3:1 of anything that carries meaning without being text.
const NON_TEXT: [string, string, ...string[]][] = [
  ["chevron / muted bell on the surface", "--hh-icon-faint", "--hh-surface"],
  ["chevron on the raised surface", "--hh-icon-faint", "--hh-surface2"],
  ["chevron on the page", "--hh-icon-faint", "--hh-bg"],
  ["chevron on a card", "--hh-icon-faint", "--t-card"],
  ["switch off-track on the surface", "--hh-toggle-off", "--hh-surface"],
  ["switch off-track on a card", "--hh-toggle-off", "--t-card"],
  ["caution icon on its wash", "--hh-caution-icon", "--hh-caution-soft", "--t-card"],
  ["active Essential pill vs the surface", "--hh-clay-fill", "--hh-surface"],
  ["active Optional pill vs the surface", "--hh-slate-fill", "--hh-surface"],
  ["snooze swipe vs the surface", "--hh-gold-fill", "--hh-surface"],
  ["Optional dot (slate) on a sheet", "--hh-slate", "--t-background"],
]

/** Every .tsx under src/, tests excluded, as [path, lines]. */
function sources(): [string, string[]][] {
  return (readdirSync("src", { recursive: true }) as string[])
    .filter((f) => f.endsWith(".tsx") && !/\.test\.tsx$/.test(f))
    .map((f) => [join("src", f), readFileSync(join("src", f), "utf8").split("\n")])
}

const WHITE = /text-white|text-primary-foreground|bg-white|var\(--hh-on-fill\)|(?:color:\s*|\?\s*)"(?:#fff|#ffffff|white)"/i
/** A FILL in one of the theme's bright TEXT tones — the teals (--hh-teal /
 *  --t-primary) and, since 2026-10-26, the other tiers' text tones. */
const BRIGHT_FILL = [
  /background:\s*[^,}\n]*"var\(--hh-(?:teal|clay|slate|gold)\)"/,
  /linear-gradient\([^)]*var\(--hh-(?:teal|clay|slate|gold)\)/,
  /(?:^|[\s"'`])bg-primary(?=[\s"'`])/,
  /bg-\[var\(--hh-(?:teal|clay|slate|gold)\)\]/,
]
/** `background: TEAL` counts only where the file's TEAL is the bright token. */
const TEAL_FILL = /background:\s*[^,}\n]*\bTEAL\b/

/** file:line of every bright-teal fill with white within its element (±a few lines). */
function whiteOnBrightTeal(): string[] {
  const hits: string[] = []
  for (const [file, lines] of sources()) {
    const def = lines.join("\n").match(/\bTEAL\s*=\s*"([^"]+)"/)
    const tealIsBright = !def || def[1].includes("--hh-teal")
    lines.forEach((line, i) => {
      const fill = BRIGHT_FILL.some((re) => re.test(line)) || (tealIsBright && TEAL_FILL.test(line))
      if (fill && lines.slice(Math.max(0, i - 4), i + 10).some((l) => WHITE.test(l))) hits.push(`${file}:${i + 1}`)
    })
  }
  return hits
}

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

  it("the teal fill is the light-mode teal, so light mode does not move", () => {
    expect(light["--hh-teal-fill"]).toBe(light["--hh-teal"])
    expect(light["--hh-teal-fill"]).toBe(light["--t-primary"])
  })

  // WCAG 1.4.11 (non-text, 3:1): a selected calendar day or active filter pill
  // is marked by the fill alone, so the fill must stand off what surrounds it.
  for (const [what, a, ...bgs] of [
    ["fill vs the surface", "--hh-teal-fill", "--hh-surface"],
    ["fill vs the page", "--hh-teal-fill", "--hh-bg"],
    ["fill vs a card (FilterBar)", "--hh-teal-fill", "--t-card"],
    ["fill vs the sheet/page background", "--hh-teal-fill", "--t-background"],
    ["selected-day ring vs today's wash", "--hh-teal", "--hh-teal-wash", "--hh-surface"],
  ] as [string, string, ...string[]][]) {
    it(`dark: ${what} ≥ 3:1`, () => {
      expect(contrast(dark, a, ...bgs), `${a} on ${bgs.join(" over ")}`).toBeGreaterThanOrEqual(3)
    })
  }

  it("dark: the fill alone is under 3:1 against today's wash, so the ring is needed", () => {
    expect(contrast(dark, "--hh-teal-fill", "--hh-teal-wash", "--hh-surface")).toBeLessThan(3)
  })

  it("both calendars draw the selected day with the dark ring", () => {
    expect(readFileSync("src/components/home/tasks/shared.ts", "utf8"))
      .toMatch(/SELECTED_DAY_RING =\s*"[^"]*dark:outline-\[color:var\(--hh-teal\)\]/)
    for (const f of ["src/components/home/RefinedWeek.tsx", "src/components/home/DesktopTasks.tsx"]) {
      expect(readFileSync(f, "utf8"), f).toContain("${on ? SELECTED_DAY_RING : \"\"}")
    }
  })

  it("the dark bright teals fail under white, so this test can tell the difference", () => {
    expect(contrast(dark, "#FFFFFF", "--hh-teal")).toBeLessThan(4.5)
    expect(contrast(dark, "#FFFFFF", "--t-primary")).toBeLessThan(4.5)
  })

  it("no filled control puts white on a bright teal — they use --hh-teal-fill", () => {
    expect(whiteOnBrightTeal()).toEqual([])
  })

  for (const [name, theme] of [["light", light], ["dark", dark]] as const) {
    for (const [what, fg, ...bgs] of NON_TEXT) {
      it(`${name}: ${what} ≥ 3:1`, () => {
        expect(contrast(theme, fg, ...bgs), `${name} ${fg} on ${bgs.join(" over ")}`).toBeGreaterThanOrEqual(3)
      })
    }
  }

  it("light mode does not move: each new token's light value is the literal it replaced", () => {
    const was: Record<string, string> = {
      "--hh-clay-fill": "#C2410C", "--hh-slate-fill": "#455C72", "--hh-gold-fill": "#8A6D1E",
      "--hh-teal-fill-hover": "#155549", "--hh-teal-fill-active": "#0F3D37",
      "--hh-fill-disabled": "#C9D4D0", "--hh-toggle-off": "#7D8984",
      "--hh-line-input": "rgba(15,23,42,0.14)", "--hh-teal-line": "#D4E7E0", "--hh-gold-line": "#EFE0C2",
      "--hh-gold-sub": "#6B5E3E", "--hh-neutral": "#5B666F", "--hh-neutral-soft": "#F1F4F6",
      "--hh-neutral-line": "#E4E9ED", "--hh-amber-wash": "#F6EFDC", "--hh-clay-wash": "#F7E7DE",
      "--t-destructive-fill": "#DC2626", "--t-secondary-hover": "#D4EDE9", "--t-secondary-active": "#C0E4DF",
      "--hh-teal-deep": "#15564A", "--hh-on-fill": "#FFFFFF",
    }
    for (const [token, value] of Object.entries(was)) expect(light[token], token).toBe(value)
    expect(light["--t-destructive-fill"]).toBe(light["--t-destructive"])
  })

  it("the old values fail, so these tests can tell the difference", () => {
    // dark --hh-teal-deep before this pass, as text on the wash
    expect(contrast({ ...dark, "--hh-teal-deep": "#2A8C76" }, "--hh-teal-deep", "--hh-teal-wash", "--hh-surface")).toBeLessThan(4.5)
    // white on the dark TEXT tones — why the fills exist
    for (const tone of ["--hh-clay", "--hh-slate", "--hh-teal"]) expect(contrast(dark, "#FFFFFF", tone), tone).toBeLessThan(4.5)
    // white on the dark destructive TEXT red — why Delete has its own fill.
    // (The old button only passed at 6.1:1 because a 70% alpha let the dark
    // dialog through; on any lighter surface it fell toward 3.76.)
    expect(contrast(dark, "#FFFFFF", "--t-destructive")).toBeLessThan(4.5)
    // the old chevron and muted-bell greys
    expect(contrast(light, "#C2CBD4", "--hh-surface")).toBeLessThan(3)
    expect(contrast(light, "#9AA29C", "--hh-surface")).toBeLessThan(3)
    // the old violet on its wash, at the band header's 12.5px
    expect(contrast(light, "#7C5CBF", "--hh-violet-soft")).toBeLessThan(4.5)
  })

  it("the sign-in hairline is no fainter in dark than in light (it was 1.01:1 there)", () => {
    const l = contrast(light, "--hh-line-input", "--hh-surface")
    const d = contrast(dark, "--hh-line-input", "--hh-surface")
    expect(d).toBeGreaterThanOrEqual(l)
  })

  it("the tier pills and Start-here flags fill with the fill tokens", () => {
    for (const f of ["src/components/home/DesktopTasks.tsx", "src/components/home/RefinedWeek.tsx"]) {
      expect(readFileSync(f, "utf8"), f).toContain("background: fillFor(insight.tone)")
    }
    expect(readFileSync("src/components/home/DesktopTasks.tsx", "utf8")).toContain("background: active ? fillFor(color) : SURFACE")
    expect(readFileSync("src/components/ui/button.tsx", "utf8")).toMatch(/destructive:\s*\n(?:\s*\/\/.*\n)*\s*"bg-destructive-fill /)
  })

  it("the UndoBar draws Undo with the token this file checks", () => {
    const bar = readFileSync("src/components/ui/UndoBar.tsx", "utf8")
    expect(bar).toContain('background: "var(--hh-ink)"')
    expect(bar).toContain('color: "var(--hh-accent-on-ink)"')
  })
})
