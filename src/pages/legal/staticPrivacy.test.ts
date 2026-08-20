/**
 * Drift fence for the two privacy policies.
 *
 * `public/privacy.html` is a standalone static copy of `Privacy.tsx`, and it
 * exists because the URL filed with Apple has to render when the app bundle
 * does not (see the comment at the top of that file). Two copies of a legal
 * document is a drift hazard, and the policy's own header says a policy that
 * drifts from the code is worse than none — so this asserts they agree rather
 * than asking a future editor to remember.
 *
 * It checks structure and commitments, not prose: the section headings, the
 * processor list, and every value from `legalConfig`. Rewording a paragraph in
 * one file without the other will not fail here — but dropping a section,
 * adding a processor, or changing a retention window will.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { LEGAL } from "./legalConfig"

const root = resolve(__dirname, "../../..")
const tsx = readFileSync(resolve(root, "src/pages/legal/Privacy.tsx"), "utf8")
const html = readFileSync(resolve(root, "public/privacy.html"), "utf8")

/** Decode the few entities the static page uses, so comparisons are on text. */
const deEntity = (s: string) =>
  s.replace(/&amp;/g, "&").replace(/&mdash;/g, "—").replace(/&nbsp;/g, " ")

const tsxHeadings = [...tsx.matchAll(/<Section heading="([^"]+)"/g)].map((m) => m[1])
const htmlHeadings = [...html.matchAll(/<h2>([^<]+)<\/h2>/g)].map((m) => deEntity(m[1]).trim())

const tsxProcessors = [...tsx.matchAll(/name:\s*"([^"]+)"/g)].map((m) => m[1])
const htmlProcessors = [...html.matchAll(/<b>([^<]+)<\/b><span>/g)].map((m) => deEntity(m[1]).trim())

describe("public/privacy.html mirrors Privacy.tsx", () => {
  it("has every section, in the same order", () => {
    expect(htmlHeadings).toEqual(tsxHeadings)
  })

  it("lists exactly the same third-party processors, in the same order", () => {
    // A processor added to the app is a disclosure obligation in BOTH copies.
    expect(tsxProcessors.length).toBeGreaterThan(0)
    expect(htmlProcessors).toEqual(tsxProcessors)
  })

  it.each([
    ["contact email", LEGAL.contactEmail],
    ["effective date", LEGAL.effective],
    ["deletion window", LEGAL.deletionWindow],
    ["backup window", LEGAL.backupWindow],
    ["telemetry retention", LEGAL.telemetryRetention],
  ])("states the same %s as legalConfig", (_label, value) => {
    expect(html).toContain(value)
  })

  it("stays dependency-free so it renders when the app bundle does not", () => {
    // The whole point of the file: no script, and nothing fetched off-origin.
    expect(html).not.toMatch(/<script/i)
    expect(html).not.toMatch(/https?:\/\/(?!homehub-2068d\.web\.app)/i)
  })
})
