import { describe, it, expect } from "vitest"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { resolve, join, extname } from "node:path"
import { SCAN_KEEPS_GOING, SCAN_KEEPS_GOING_SHORT, scanProgressLabel } from "./scanCopy"

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

describe("no user-facing parse/analyse vocabulary anywhere in src", () => {
  const files = sourceFiles(SRC)

  it("finds source files to check (guards against a broken walk)", () => {
    expect(files.length).toBeGreaterThan(100)
  })

  it("never says parsing, parse, analyze or analyse to a user", () => {
    // Identifiers are fine — parseManualService, previewDraft, JSON.parse. Only
    // PROSE is checked: a string with a space in it and a lower-case word.
    const offenders: string[] = []
    for (const f of files) {
      for (const s of userFacingStrings(readFileSync(f, "utf8"))) {
        if (!/\s/.test(s)) continue // identifiers, paths, class lists
        if (/\b(pars(e|es|ed|ing)|analyz(e|es|ed|ing)|analys(e|es|ed|ing|is))\b/i.test(s)) {
          offenders.push(`${f.slice(SRC.length + 1)} :: ${s.trim().slice(0, 90)}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })
})
