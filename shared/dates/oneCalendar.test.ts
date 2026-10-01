/**
 * One calendar, and it stays one.
 *
 * H7a replaced a dozen hand-rolled "today"s and day-arithmetic copies with
 * shared/dates/calendar.ts. Most of them cut today from the UTC clock, which
 * in US zones is already tomorrow from ~5 pm — and each copy had been fixed,
 * or not, on its own. This source guard keeps the idiom and the copies from
 * coming back into the client (firebase/functions has its own follow-ups).
 */
import { describe, expect, it } from "vitest"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

const THE_MODULE = join("shared", "dates", "calendar.ts")

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(name) && !/\.(test|spec)\./.test(name)) out.push(p)
  }
  return out
}

/** Code lines only: a comment may quote the idiom it warns about. */
function codeLines(file: string): Array<{ line: number; text: string }> {
  return readFileSync(file, "utf8")
    .split("\n")
    .map((text, i) => ({ line: i + 1, text }))
    .filter(({ text }) => !/^\s*(\/\/|\*|\/\*)/.test(text))
}

const FILES = [...walk("src"), ...walk("shared")].filter((f) => f !== THE_MODULE)

/** `new Date().toISOString().slice(0, 10)` and its spellings: today, from the UTC clock. */
const UTC_TODAY = /new Date\(\)\.toISOString\(\)\.(slice\(0,\s*10\)|substring\(0,\s*10\)|split\(["']T["']\)\[0\])/
/** A local definition of one of the module's helpers, as a function or an arrow. */
const NAMES = "todayStr|localToday|localDateString|addDays|addMonths|diffDays|daysBetween"
const HELPER = new RegExp(`\\bfunction\\s+(${NAMES})\\s*\\(|\\bconst\\s+(${NAMES})\\s*=\\s*(\\([^)]*\\)|\\w+)\\s*(:[^=]+)?=>`)

describe("one calendar module (shared/dates/calendar.ts)", () => {
  it("finds the client's source to check", () => {
    expect(FILES.length).toBeGreaterThan(100)
  })

  it("nothing in the client cuts today from the UTC clock", () => {
    const offenders = FILES.flatMap((f) => codeLines(f).filter((l) => UTC_TODAY.test(l.text)).map((l) => `${f}:${l.line}`))
    expect(offenders, `use localToday() from shared/dates/calendar.ts:\n  ${offenders.join("\n  ")}`).toEqual([])
  })

  it("no second copy of its helpers", () => {
    const offenders = FILES.flatMap((f) => codeLines(f).filter((l) => HELPER.test(l.text)).map((l) => `${f}:${l.line}: ${l.text.trim()}`))
    expect(offenders, `import it from shared/dates/calendar.ts instead:\n  ${offenders.join("\n  ")}`).toEqual([])
  })

  it("would catch the copies it replaced", () => {
    expect(UTC_TODAY.test(`const today = new Date().toISOString().slice(0, 10)`)).toBe(true)
    expect(UTC_TODAY.test(`const today = new Date().toISOString().split("T")[0]`)).toBe(true)
    expect(HELPER.test(`function todayStr(): string {`)).toBe(true)
    expect(HELPER.test(`const addDays = (dateStr: string, days: number): string => {`)).toBe(true)
    expect(HELPER.test(`function daysBetween(a: string, b: string): number {`)).toBe(true)
    // …and not a value that merely has the name.
    expect(HELPER.test(`  const todayStr = localToday()`)).toBe(false)
  })
})
