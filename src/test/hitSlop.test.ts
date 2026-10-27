/**
 * The hit-44 slop and Tailwind's `after:*` utilities both write an element's
 * one `::after`. On the same element whichever rule wins breaks the other: the
 * slop loses its size or position, or the drawn indicator (ui/tabs.tsx's
 * TabsTrigger underline, for one) loses its paint. jsdom applies no CSS, so no
 * behavioural test can see it — this guard reads the source instead.
 *
 * It flags any one class string that carries both a hit-44 utility and an
 * `after:` utility, and any `after:` class handed to the shared Button, whose
 * base class already includes hit-44 (src/components/ui/button.tsx) — in a
 * plain string, a `cn(...)` call or a template literal.
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

/** Every quoted or template string literal in a piece of source. */
function stringLiterals(src: string): string[] {
  return [...src.matchAll(/(["'`])((?:(?!\1)[^\\]|\\.)*)\1/g)].map((m) => m[2])
}

/**
 * The opening tag of every `<Button …>` in a file, read to its real end: a `>`
 * inside braces (an arrow function, a comparison) or inside a string does not
 * close the tag.
 */
function buttonTags(src: string): string[] {
  const tags: string[] = []
  for (const m of src.matchAll(/<Button\b/g)) {
    let depth = 0
    let quote: string | null = null
    let i = m.index! + m[0].length
    for (; i < src.length; i++) {
      const c = src[i]
      if (quote) {
        if (c === "\\") i++
        else if (c === quote) quote = null
        continue
      }
      if (c === '"' || c === "'" || c === "`") quote = c
      else if (c === "{") depth++
      else if (c === "}") depth--
      else if (c === ">" && depth === 0) break
    }
    tags.push(src.slice(m.index!, i + 1))
  }
  return tags
}

/** The className expression of an opening tag: a quoted string or a braced expression. */
function classNameOf(tag: string): string | null {
  const at = tag.search(/\bclassName=/)
  if (at < 0) return null
  const start = at + "className=".length
  const open = tag[start]
  if (open === '"' || open === "'") return tag.slice(start, tag.indexOf(open, start + 1) + 1)
  if (open !== "{") return null
  let depth = 0
  for (let i = start; i < tag.length; i++) {
    if (tag[i] === "{") depth++
    else if (tag[i] === "}" && --depth === 0) return tag.slice(start, i + 1)
  }
  return tag.slice(start)
}

function buttonAfterClasses(src: string): string[] {
  const hits: string[] = []
  for (const tag of buttonTags(src)) {
    const cls = classNameOf(tag)
    if (cls && stringLiterals(cls).some((s) => AFTER.test(s))) hits.push(cls.slice(0, 80))
  }
  return hits
}

describe("hit-44 never shares an element with after:* utilities", () => {
  const files = sources(SRC)

  it("finds the source files", () => {
    expect(files.length).toBeGreaterThan(100)
  })

  it("no class string carries both", () => {
    const offenders: string[] = []
    for (const f of files) {
      for (const str of stringLiterals(readFileSync(f, "utf8"))) {
        if (HIT.test(str) && AFTER.test(str)) offenders.push(`${relative(SRC, f)}: ${str.slice(0, 80)}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it("no Button is handed an after: class (its base class is hit-44)", () => {
    const offenders: string[] = []
    for (const f of files) {
      for (const hit of buttonAfterClasses(readFileSync(f, "utf8"))) offenders.push(`${relative(SRC, f)}: ${hit}`)
    }
    expect(offenders).toEqual([])
  })

  describe("the guards are live", () => {
    it("catch both in one class string", () => {
      const str = stringLiterals('<b className="hit-44 after:absolute" />')[0]
      expect(HIT.test(str) && AFTER.test(str)).toBe(true)
      expect(HIT.test("hit-44-up px-2") && AFTER.test("hit-44-up px-2")).toBe(false)
    })

    it("catch an after: class on Button as a plain string", () => {
      expect(buttonAfterClasses('<Button className="px-2 after:inset-0">Go</Button>')).toHaveLength(1)
    })

    it("catch it inside cn(...), past an arrow function's >", () => {
      const src = '<Button onClick={() => go()} className={cn("px-2", on && "after:absolute")}>Go</Button>'
      expect(buttonAfterClasses(src)).toHaveLength(1)
    })

    it("catch it in a template literal", () => {
      const src = "<Button size=\"sm\" className={`px-2 ${on ? \"bg-x\" : \"\"} after:absolute`}>Go</Button>"
      expect(buttonAfterClasses(src)).toHaveLength(1)
    })

    it("pass a Button with no after: class, and ignore other components", () => {
      expect(buttonAfterClasses('<Button className={cn("px-2", x)} aria-label="after: lunch">Go</Button>')).toEqual([])
      expect(buttonAfterClasses('<Tab className="after:absolute" />')).toEqual([])
    })
  })
})
