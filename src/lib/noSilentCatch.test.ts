/**
 * No silent failures — the guard (audit H6).
 *
 * The owner's standard: every catch surfaces the failure to the person, logs it
 * with enough context to debug, or carries a comment saying why silence is
 * right. The audit found the app breaking it in the shape that is easiest to
 * write and hardest to see in review — a `.catch(() => {})` or
 * `.catch(() => null)` on a write, after which the screen showed success.
 *
 * ESLint's `no-empty` (an error, `allowEmptyCatch: false`) covers empty catch
 * BLOCKS, but only where `lint:new` runs, and it cannot see a handler that is a
 * function body at all. So this scans every app source file (src/ and shared/;
 * the Functions workspace is out of this package's scope) for:
 *
 *  1. a silent `.catch` handler — an arrow whose body does nothing (empty, or
 *     comments only) or returns a constant (null, undefined, [], false, …).
 *     Each one must be on JUSTIFIED below AND say why at the site, in a comment
 *     inside the handler, on its line, or on the line above. Adding one is a
 *     deliberate act that shows up in review — the list is the point.
 *  2. a catch BLOCK with nothing in it — not even a comment — anywhere.
 *
 * Source is read with `import.meta.glob(?raw)` like designContracts.test.ts, so
 * this type-checks with the app.
 */
import { describe, expect, it } from "vitest"

const SOURCES = import.meta.glob<string>(
  [
    "/src/**/*.{ts,tsx}",
    "!/src/**/*.test.{ts,tsx}",
    "!/src/test/**",
    "/shared/**/*.ts",
    "!/shared/**/*.test.ts",
    "!/shared/**/__tests__/**",
  ],
  { query: "?raw", import: "default", eager: true },
)

/**
 * The silent handlers that are RIGHT to be silent: each is an optional read
 * whose failure already has a visible, honest fallback. Keyed by file and a
 * snippet of the site (its line, or a phrase of the comment inside it), so a
 * new swallower in the same file is not waved through. The `why` repeats the
 * site's comment for whoever reads this list.
 */
const JUSTIFIED: { file: string; site: string; why: string }[] = [
  {
    file: "src/integrations/firebase/pdfProxy.ts",
    site: "getIdToken().catch(() => undefined)",
    why: "No token: the PDF loads directly; a CORS refusal is the viewer's own visible load error.",
  },
  {
    file: "src/modules/knowledge/services/chatService.ts",
    site: "getIdToken().catch(() => undefined)",
    why: "No token falls to the 'Authentication required' message the answer shows.",
  },
  {
    file: "src/components/home/RefinedTaskDetail.tsx",
    site: "resolveManualUrl(first.source_type, first.source_ref).catch(() => null)",
    why: "An unresolvable PDF leaves 'Open manual' as a link to the item page.",
  },
  {
    file: "src/components/home/RefinedTaskDetail.tsx",
    site: "no manual resolved",
    why: "Same fallback, for anything unexpected in the manual lookup chain.",
  },
  {
    file: "src/hooks/useManualManagement.ts",
    site: "resolveManualUrl(m.source_type, m.source_ref).catch(() => null)",
    why: "One manual that can't resolve shows without its link; the rest still resolve.",
  },
  {
    file: "src/pages/SmartAddItem.tsx",
    site: "resolveStorageUrl(stored).catch(() => null)",
    why: "The preview keeps the upload's own URL.",
  },
  {
    file: "src/modules/knowledge/services/parseManualService.ts",
    site: "readRunningScan(opts.homeId, manualId).catch(() => null)",
    why: "Falls through to the server's own refusal, which the caller shows.",
  },
  {
    file: "src/components/item-care/CareBlock.tsx",
    site: "No spinner rides on this one",
    why: "Rows render without due dates; nothing claims a date it did not read.",
  },
]

/** Empty catch BLOCKS that are not code: the theme bootstrap is a string
 *  injected before the app runs, and must never throw during first paint. */
const EMPTY_BLOCK_ALLOWED: { file: string; site: string }[] = [
  { file: "src/lib/theme.ts", site: "THEME_INIT_SNIPPET" },
]

// `.catch(` + an arrow with no parameter (or one it ignores) whose body does
// nothing — empty or comments only — or hands back a constant.
const SILENT_CATCH =
  /\.catch\(\s*(?:\(\s*(?:_?\w+\s*(?::\s*\w+\s*)?)?\)|_?\w+)\s*=>\s*(?:\{(?:\s|\/\/[^\n]*|\/\*[\s\S]*?\*\/)*\}|null|undefined|void 0|\[\]|false|true|0|""|''|\(\{\}\))\s*\)/g
const EMPTY_CATCH_BLOCK = /\bcatch\s*(?:\(\s*\w*\s*\))?\s*\{\s*\}/g
/** A comment marker, but not the `//` of a URL. */
const COMMENT = /(^|[^:"'`])\/\/|\/\*/

type Site = { file: string; line: number; context: string; justified: boolean }

function lineAt(src: string, index: number): { line: number; text: string; prev: string } {
  const before = src.slice(0, index).split("\n")
  const lines = src.split("\n")
  const line = before.length
  let p = line - 2
  while (p >= 0 && lines[p].trim() === "") p--
  return { line, text: lines[line - 1] ?? "", prev: p >= 0 ? lines[p].trim() : "" }
}

function isCommentLine(trimmed: string): boolean {
  return trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*") || trimmed.endsWith("*/")
}

/** Every silent `.catch` handler in one source. Exported shape for the self-test. */
function silentCatches(file: string, src: string): Site[] {
  const out: Site[] = []
  for (const m of src.matchAll(SILENT_CATCH)) {
    const { line, text, prev } = lineAt(src, m.index)
    const justified = COMMENT.test(m[0]) || COMMENT.test(text) || isCommentLine(prev)
    out.push({ file, line, context: `${text}\n${m[0]}`, justified })
  }
  return out
}

function emptyCatchBlocks(file: string, src: string): Site[] {
  return [...src.matchAll(EMPTY_CATCH_BLOCK)].map((m) => {
    const { line, text } = lineAt(src, m.index)
    return { file, line, context: text, justified: false }
  })
}

const files = Object.entries(SOURCES).map(([path, src]) => ({ file: path.replace(/^\//, ""), src }))
const silent = files.flatMap(({ file, src }) => silentCatches(file, src))
const listed = (s: Site) => JUSTIFIED.some((j) => j.file === s.file && s.context.includes(j.site))

describe("the detector itself", () => {
  it("finds every silent shape it guards against, and nothing that acts", () => {
    const fixture = [
      "a.catch(() => {})",
      "b.catch(() => null)",
      "c.catch((e) => {})",
      "d.catch((e: unknown) => undefined)",
      "e.catch(() => [])",
      "f.catch(() => {\n  /* a reason */\n})",
      "g.catch((e) => console.warn(e))",
      "h.catch(() => setFailed(true))",
      "i.catch(fail('x'))",
    ].join("\n")
    const found = silentCatches("fixture.ts", fixture)
    expect(found.map((s) => s.line)).toEqual([1, 2, 3, 4, 5, 6])
    // Only the handler with a comment in it counts as saying why.
    expect(found.map((s) => s.justified)).toEqual([false, false, false, false, false, true])
    expect(emptyCatchBlocks("fixture.ts", "try { x() } catch {}\ntry { y() } catch (e) { /* why */ }")).toHaveLength(1)
  })

  it("is scanning the real tree", () => {
    expect(files.length).toBeGreaterThan(200)
    expect(files.some((f) => f.file === "src/pages/Settings.tsx")).toBe(true)
    expect(files.some((f) => f.file.startsWith("shared/"))).toBe(true)
  })
})

describe("no silent failures (audit H6)", () => {
  it("every silent .catch handler is on the justified list", () => {
    const unlisted = silent.filter((s) => !listed(s)).map((s) => `${s.file}:${s.line}`)
    expect(
      unlisted,
      "A .catch that swallows its failure. Surface it to the person, log it with context, " +
        "or — if silence is genuinely right — say why in a comment at the site AND add it to JUSTIFIED here.",
    ).toEqual([])
  })

  it("every justified site says why where it stands", () => {
    const bare = silent.filter((s) => listed(s) && !s.justified).map((s) => `${s.file}:${s.line}`)
    expect(bare, "Put the reason in a comment inside the handler, on its line, or on the line above.").toEqual([])
  })

  it("every entry on the list still names a real site", () => {
    const stale = JUSTIFIED.filter((j) => !silent.some((s) => s.file === j.file && s.context.includes(j.site)))
    expect(stale.map((j) => `${j.file} — ${j.site}`), "Remove entries whose site is gone or no longer silent.").toEqual([])
  })

  it("no catch block is empty — not even a comment", () => {
    const empty = files
      .flatMap(({ file, src }) => emptyCatchBlocks(file, src))
      .filter((s) => !EMPTY_BLOCK_ALLOWED.some((a) => a.file === s.file && s.context.includes(a.site)))
      .map((s) => `${s.file}:${s.line}`)
    expect(empty, "Surface, log, or say why in a comment inside the block.").toEqual([])
  })
})
