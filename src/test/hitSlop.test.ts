/**
 * The hit-44 slop and Tailwind's `after:*` utilities both write an element's
 * one `::after`. On the same element whichever rule wins breaks the other: the
 * slop loses its size or position, or the drawn indicator (ui/tabs.tsx's
 * TabsTrigger underline, for one) loses its paint. jsdom applies no CSS, so no
 * behavioural test can see it — this guard reads the class strings instead.
 *
 * It flags any one class string that carries both a hit-44 utility and an
 * `after:` utility, and any `after:` class handed to the shared Button, whose
 * base class already includes hit-44 (src/components/ui/button.tsx).
 */
import { describe, expect, it } from "vitest"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative, resolve } from "node:path"

const SRC = resolve(__dirname, "..")

function sources(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...sources(p))
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p)
  }
  return out
}

const HIT = /(^|[\s"'`])hit-44(-up|-down|-left|-right)?(?=[\s"'`]|$)/
const AFTER = /(^|[\s"'`:])after:/

describe("hit-44 never shares an element with after:* utilities", () => {
  const files = sources(SRC)

  it("finds the source files", () => {
    expect(files.length).toBeGreaterThan(100)
  })

  it("no class string carries both", () => {
    const offenders: string[] = []
    for (const f of files) {
      const src = readFileSync(f, "utf8")
      for (const m of src.matchAll(/(["'`])((?:(?!\1)[^\\\n]|\\.)*)\1/g)) {
        const str = m[2]
        if (HIT.test(str) && AFTER.test(str)) offenders.push(`${relative(SRC, f)}: ${str.slice(0, 80)}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it("no Button is handed an after: class (its base class is hit-44)", () => {
    const offenders: string[] = []
    for (const f of files) {
      const src = readFileSync(f, "utf8")
      for (const m of src.matchAll(/<Button\b[^>]*?className=(["'`{])([\s\S]*?)(?:["'`}])/g)) {
        if (AFTER.test(m[2])) offenders.push(`${relative(SRC, f)}: ${m[2].slice(0, 80)}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it("the guard is live: it would catch the combination", () => {
    expect(HIT.test("hit-44 after:absolute") && AFTER.test("hit-44 after:absolute")).toBe(true)
    expect(HIT.test("hit-44-up px-2") && AFTER.test("hit-44-up px-2")).toBe(false)
  })
})
