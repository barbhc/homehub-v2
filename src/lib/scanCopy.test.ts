import { describe, it, expect } from "vitest"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { resolve, join, extname } from "node:path"
import ts from "typescript"
import { BANNED_SCAN_WORDS, SCAN_KEEPS_GOING, SCAN_KEEPS_GOING_SHORT, scanProgressLabel } from "./scanCopy"

describe("the scan reassurance", () => {
  it("names all three exits, not just the page", () => {
    expect(SCAN_KEEPS_GOING).toMatch(/leave this page/i)
    expect(SCAN_KEEPS_GOING).toMatch(/add another item/i)
    expect(SCAN_KEEPS_GOING).toMatch(/close the app/i)
  })

  it("promises the scan survives leaving", () => {
    expect(SCAN_KEEPS_GOING).toMatch(/keeps going/i)
    expect(SCAN_KEEPS_GOING_SHORT).toMatch(/keep going/i)
  })
})

describe("scanProgressLabel — honest, never a fake percentage", () => {
  it("says starting until the page count is known", () => {
    expect(scanProgressLabel(null, null)).toBe("starting…")
    expect(scanProgressLabel(5, null)).toBe("starting…")
    expect(scanProgressLabel(5, 0)).toBe("starting…")
  })

  it("says the total once we have it but no page yet", () => {
    expect(scanProgressLabel(null, 24)).toBe("24 pages")
    expect(scanProgressLabel(0, 24)).toBe("24 pages")
  })

  it("counts pages once we have both", () => {
    expect(scanProgressLabel(6, 24)).toBe("page 6 of 24")
  })

  it("never reports a page beyond the total", () => {
    expect(scanProgressLabel(99, 24)).toBe("page 24 of 24")
  })
})

/**
 * The vocabulary check that a habit kept failing.
 *
 * Round 11 swept for "parse"/"analyze" with a grep over double-quoted strings
 * and missed `${n} manual${s} parsing` — a template literal — which shipped and
 * the owner reported. This walks every source file and looks at ALL string
 * literals, so the form of the quote cannot hide one again.
 */
const SRC = resolve(__dirname, "..")

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules" || entry === "test") continue
      sourceFiles(full, out)
    } else if ([".ts", ".tsx"].includes(extname(entry)) && !entry.includes(".test.")) {
      out.push(full)
    }
  }
  return out
}

/** Strings a user could read: quoted literals and template chunks, minus code. */
function userFacingStrings(src: string): string[] {
  const noComments = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
  const out: string[] = []
  // Double- and single-quoted literals.
  for (const m of noComments.matchAll(/"([^"\\\n]{4,})"|'([^'\\\n]{4,})'/g)) {
    out.push(m[1] ?? m[2] ?? "")
  }
  // Template literals, with ${...} holes removed so only prose remains.
  for (const m of noComments.matchAll(/`([^`]*)`/g)) {
    out.push(m[1].replace(/\$\{[^}]*\}/g, " "))
  }
  return out
}

/**
 * Text written straight into JSX — `<div>Parse manuals</div>` — which is not a
 * string literal of any kind, so the scan above never saw it.
 *
 * "Parse manuals" sat on the first-run Home hero, the first screen a new
 * account reads, while this test passed: it only looked inside quotes. The
 * banned-words list in scanCopy.ts was used by no test at all. JSX text is
 * read with the TypeScript parser rather than a regex, because the regex route
 * has already been fooled once in this repo (`accept="image/*"` read as the
 * start of a comment — see addFlowCopy.test.ts).
 */
function jsxText(src: string, fileName: string): string[] {
  const out: string[] = []
  const file = ts.createSourceFile(fileName, src, ts.ScriptTarget.Latest, false, ts.ScriptKind.TSX)
  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node) && !node.containsOnlyTriviaWhiteSpaces) {
      out.push(node.text.replace(/\s+/g, " ").trim())
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  return out.filter(Boolean)
}

/**
 * The words themselves, as whole words — "parse" catches parsed and parsing but
 * never "sparse" or an identifier like parseCorrections.
 */
const BANNED = /\b(pars(e|es|ed|ing)|analyz(e|es|ed|ing)|analys(e|es|ed|ing|is))\b/i

/**
 * Known offenders in files another package owns this round, each fixed there.
 * Listed by file AND exact text, and checked to still exist below, so an entry
 * cannot outlive its fix and quietly excuse a new one.
 */
const PENDING_ELSEWHERE: Array<{ file: string; text: string; why: string }> = [
  // The item page's manual menu: "Parse" → "Scan". ManualSection.tsx belongs
  // to the item-page package (E2) in the 2026-09-30 audit round.
  { file: "pages/item-detail/ManualSection.tsx", text: "Parse", why: "E2 owns ManualSection.tsx" },
]
const pending = (file: string, text: string) => PENDING_ELSEWHERE.some((p) => p.file === file && p.text === text)

describe("no user-facing parse/analyse vocabulary anywhere in src", () => {
  const files = sourceFiles(SRC)

  it("finds source files to check (guards against a broken walk)", () => {
    expect(files.length).toBeGreaterThan(100)
  })

  it("the matcher covers every word scanCopy.ts bans — the list is the rule", () => {
    // The stems, completed into the words they stand for.
    for (const stem of BANNED_SCAN_WORDS) {
      const word = /[sz]$/.test(stem) ? `${stem}e` : stem
      expect(BANNED.test(`We ${word} your manual`), stem).toBe(true)
    }
  })

  it("never says parsing, parse, analyze or analyse to a user", () => {
    // Identifiers are fine — parseManualService, previewDraft, JSON.parse. Only
    // PROSE is checked: a string with a space in it and a lower-case word.
    const offenders: string[] = []
    for (const f of files) {
      for (const s of userFacingStrings(readFileSync(f, "utf8"))) {
        if (!/\s/.test(s)) continue // identifiers, paths, class lists
        if (BANNED.test(s)) {
          offenders.push(`${f.slice(SRC.length + 1)} :: ${s.trim().slice(0, 90)}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it("never says them in JSX text either — the words between the tags", () => {
    // No whitespace filter here: JSX text is prose by construction, and a
    // one-word menu label ("Parse") is exactly the case to catch.
    const offenders: string[] = []
    for (const f of files.filter((p) => p.endsWith(".tsx"))) {
      const rel = f.slice(SRC.length + 1)
      for (const s of jsxText(readFileSync(f, "utf8"), f)) {
        if (BANNED.test(s) && !pending(rel, s)) offenders.push(`${rel} :: ${s.slice(0, 90)}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it("every pending exception is still real — remove it when its file is fixed", () => {
    for (const p of PENDING_ELSEWHERE) {
      expect(jsxText(readFileSync(resolve(SRC, p.file), "utf8"), p.file), `${p.file} no longer says "${p.text}" — delete its PENDING_ELSEWHERE entry`).toContain(p.text)
    }
  })

  it("the JSX reader actually reads JSX text (guards against a vacuous pass)", () => {
    const seen = jsxText(`const A = () => <div className="x">Parse manuals<b>{n} left</b></div>`, "probe.tsx")
    expect(seen).toEqual(["Parse manuals", "left"])
    expect(seen.some((s) => BANNED.test(s))).toBe(true)
    // And the real first-run hero is in the walk.
    const home = jsxText(readFileSync(resolve(SRC, "pages/Home.tsx"), "utf8"), "Home.tsx")
    expect(home).toContain("Add your first item")
  })
})
