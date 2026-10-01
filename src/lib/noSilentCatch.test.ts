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
 *  1. a silent `.catch` HANDLER — one that does nothing or hands back a
 *     constant: `() => {}`, `() => null|undefined|[]|false|"…"|0…`,
 *     `async () => {}`, `function () {}`, `() => { return }`,
 *     `() => { return null }`, or a named no-op (`noop`, `ignore`, `swallow`).
 *     Each must be on JUSTIFIED below AND say why at the site — in a comment
 *     inside the handler, on its line, or on the line above. Adding one is a
 *     deliberate act that shows up in review; the list is the point.
 *  2. a catch BLOCK with nothing in it (any binding, typed or not) — not even
 *     a comment — anywhere.
 *  3. a catch BLOCK that only returns a constant (`catch { return null }`)
 *     with no comment saying why: a fallback is fine, an unexplained one isn't.
 *
 * Patterns are matched on the source with its comments blanked out, so a
 * pattern QUOTED in a doc comment (like the ones above) is never read as code;
 * the comments are consulted only for the justification.
 *
 * Known gaps — shapes this cannot judge, left to review:
 *  - handlers that DO something but still swallow (`.catch(() => setLoading(false))`);
 *  - rejection handlers passed to `.then(ok, () => {})`;
 *  - promises with no handler at all (an unhandled rejection: Sentry sees it,
 *    the person doesn't);
 *  - `try { … } finally { … }` with no catch;
 *  - service results whose `{ error }` is read and ignored;
 *  - catch blocks whose fallback is not a constant (`return file`,
 *    `build = "unknown"`) — those need judgment, not a regex.
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

/** Constant fallbacks in code this repo must not edit. */
const RETURN_ONLY_ALLOWED: { file: string; site: string; why: string }[] = [
  {
    file: "shared/parse/ssrf.ts",
    site: "parsed = new URL(url)",
    why: "The SSRF guard, ported verbatim from v1 (no drift allowed): an unparseable URL is refused — the deny IS the handling.",
  },
]

// ── The patterns, matched on comment-blanked source ─────────────────────────

/** A literal a swallowing handler hands back instead of the failure. */
const CONST = String.raw`(?:null|undefined|void 0|\[\]|false|true|-?\d+(?:\.\d+)?|"[^"\n]*"|'[^'\n]*'|\(\{\}\))`
/** `()`, `(e)`, `(_e: unknown)`, or a bare `e`. */
const PARAM = String.raw`(?:\(\s*(?:_?\w+\s*(?::\s*\w+\s*)?)?\)|_?\w+)`
/** `{}`, `{ return }`, `{ return null; }`, `{ return {} }` — comments already blanked. */
const BODY_NOTHING = String.raw`\{\s*(?:return(?:\s+(?:${CONST}|\{\s*\}))?\s*;?\s*)?\}`
const SILENT_CATCH = new RegExp(
  String.raw`\.catch\(\s*(?:` +
    String.raw`(?:async\s+)?${PARAM}\s*=>\s*(?:${BODY_NOTHING}|${CONST})` +
    String.raw`|(?:async\s+)?function\s*\w*\s*${PARAM}\s*${BODY_NOTHING}` +
    String.raw`|noop|ignore|ignoreError|swallow` +
    String.raw`)\s*\)`,
  "g",
)
/** `catch`, with or without a binding — typed (`(e: unknown)`) or not. */
const CATCH_HEAD = String.raw`\bcatch\s*(?:\(\s*\w*\s*(?::\s*[\w.<>|\[\] ]+)?\))?\s*`
const EMPTY_CATCH_BLOCK = new RegExp(CATCH_HEAD + String.raw`\{\s*\}`, "g")
const RETURN_ONLY_CATCH_BLOCK = new RegExp(CATCH_HEAD + String.raw`\{\s*return(?:\s+(?:${CONST}|\{\s*\}))?\s*;?\s*\}`, "g")

/** A comment marker, but not the `//` of a URL. */
const COMMENT = /(^|[^:"'`])\/\/|\/\*/

/**
 * The source with every comment blanked to spaces (newlines and offsets kept),
 * so a pattern quoted in a comment is never read as code. A block comment opens
 * only after whitespace or `{(,;` and a line comment never after `:` or a quote
 * — `accept="image/*"` and "https://…" stay code (designContracts' rule).
 */
function blankComments(src: string): string {
  const blank = (s: string) => s.replace(/[^\n]/g, " ")
  return src
    .replace(/(^|[\s{(,;])(\/\*[\s\S]*?\*\/)/g, (_m, pre: string, c: string) => pre + blank(c))
    .replace(/(^|[^:"'`\\])(\/\/[^\n]*)/gm, (_m, pre: string, c: string) => pre + blank(c))
}

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

/** Matches of `re` in the code, each with whether a comment at the site says why. */
function find(file: string, src: string, re: RegExp): Site[] {
  const code = blankComments(src)
  return [...code.matchAll(re)].map((m) => {
    const original = src.slice(m.index, m.index + m[0].length)
    const { line, text, prev } = lineAt(src, m.index)
    const justified = COMMENT.test(original) || COMMENT.test(text) || isCommentLine(prev)
    return { file, line, context: `${prev}\n${text}\n${original}`, justified }
  })
}
const silentCatches = (file: string, src: string) => find(file, src, SILENT_CATCH)
/** Empty blocks: a comment INSIDE makes one non-empty, as for ESLint's no-empty. */
const emptyCatchBlocks = (file: string, src: string) =>
  find(file, src, EMPTY_CATCH_BLOCK).filter((s) => !COMMENT.test(s.context.split("\n").slice(2).join("\n")))
const returnOnlyCatchBlocks = (file: string, src: string) => find(file, src, RETURN_ONLY_CATCH_BLOCK)

const files = Object.entries(SOURCES).map(([path, src]) => ({ file: path.replace(/^\//, ""), src }))
const silent = files.flatMap(({ file, src }) => silentCatches(file, src))
const listed = (s: Site) => JUSTIFIED.some((j) => j.file === s.file && s.context.includes(j.site))

describe("the detector itself", () => {
  it("finds every silent handler shape it guards against, and nothing that acts", () => {
    const fixture = [
      "a.catch(() => {})",
      "b.catch(() => null)",
      "c.catch((e) => {})",
      "d.catch((e: unknown) => undefined)",
      "e.catch(() => [])",
      "f.catch(() => {\n  /* a reason */\n})",
      "g.catch(async () => {})",
      "h.catch(function () {})",
      "i.catch(function (e) { return })",
      "j.catch(() => { return null; })",
      "k.catch(noop)",
      'l.catch(() => "unknown")',
      "m.catch((e) => console.warn(e))",
      "n.catch(() => setFailed(true))",
      "o.catch(fail('x'))",
      "p.catch(async (e) => { await report(e) })",
    ].join("\n")
    const found = silentCatches("fixture.ts", fixture)
    // Line 6's handler spans lines 6–8, so the next starts on line 9.
    expect(found.map((s) => s.line)).toEqual([1, 2, 3, 4, 5, 6, 9, 10, 11, 12, 13, 14])
    // Only the handler with a comment in it counts as saying why.
    expect(found.map((s) => s.justified)).toEqual([false, false, false, false, false, true, false, false, false, false, false, false])
  })

  it("never reads a pattern quoted in a comment as code", () => {
    const fixture = [
      "/**",
      " * Used to be x.catch(() => {}) — and y.catch(() => null) before that.",
      " */",
      "// z.catch(noop) was the other one",
      'const url = "https://example.com/a.catch(() => {})"', // a string, not a comment
    ].join("\n")
    expect(silentCatches("fixture.ts", fixture).map((s) => s.line)).toEqual([5])
  })

  it("finds empty and comment-less constant catch blocks, typed bindings included", () => {
    const fixture = [
      "try { a() } catch {}",
      "try { b() } catch (e: unknown) {}",
      "try { c() } catch (e) { /* why */ }",
      "try { d() } catch { return null }",
      "try { e() } catch { /* not JSON */ return null }",
      "try { f() } catch {",
      "  // storage blocked: the default",
      "  return false",
      "}",
      "try { g() } catch (e) { return report(e) }",
    ].join("\n")
    expect(emptyCatchBlocks("fixture.ts", fixture).map((s) => s.line)).toEqual([1, 2])
    const returns = returnOnlyCatchBlocks("fixture.ts", fixture)
    expect(returns.map((s) => [s.line, s.justified])).toEqual([[4, false], [5, true], [6, true]])
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

  it("no catch block falls back to a constant without saying why", () => {
    const bare = files
      .flatMap(({ file, src }) => returnOnlyCatchBlocks(file, src))
      .filter((s) => !s.justified && !RETURN_ONLY_ALLOWED.some((a) => a.file === s.file && s.context.includes(a.site)))
      .map((s) => `${s.file}:${s.line}`)
    expect(bare, "A fallback is fine; an unexplained one isn't. Say why in a comment inside the block.").toEqual([])
  })

  it("every allowed constant fallback still names a real site", () => {
    const blocks = files.flatMap(({ file, src }) => returnOnlyCatchBlocks(file, src))
    const stale = RETURN_ONLY_ALLOWED.filter((a) => !blocks.some((s) => s.file === a.file && s.context.includes(a.site)))
    expect(stale.map((a) => `${a.file} — ${a.site}`)).toEqual([])
  })
})
