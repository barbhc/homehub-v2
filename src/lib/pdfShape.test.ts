/**
 * A tester downloaded only the cover page of an owner's manual. We accepted the
 * one-page file in silence and produced three plausible, generic air-fryer
 * tasks under a heading reading "From your manual".
 *
 * The rule these tests pin: warn when we COUNTED few pages, and say nothing
 * when we couldn't count — a false warning on a real manual teaches people to
 * ignore the warning.
 */
import { describe, it, expect } from "vitest"
import { countPdfPages, isThinManual, thinManualWarning, THIN_PAGE_MAX } from "../../shared/parse/pdfShape"

const enc = (s: string) => new TextEncoder().encode(s)

describe("countPdfPages", () => {
  it("counts /Type /Page objects without counting the /Pages tree node", () => {
    const pdf = enc("%PDF-1.4\n<< /Type /Pages /Kids [1 2 3] >>\n<< /Type /Page >>\n<< /Type /Page >>\n<< /Type /Page >>")
    expect(countPdfPages(pdf)).toBe(3)
  })

  it("reads the page tree's /Count", () => {
    expect(countPdfPages(enc("%PDF-1.7\n<< /Type /Pages /Count 84 /Kids [...] >>"))).toBe(84)
  })

  it("returns null when the page tree is compressed and unreadable", () => {
    expect(countPdfPages(enc("%PDF-1.5\n<< /Type /ObjStm /N 12 >>\nstream\n\x00\x01binary"))).toBeNull()
  })

  it("identifies the reported case: a single-page cover sheet", () => {
    expect(countPdfPages(enc("%PDF-1.4\n<< /Type /Pages /Count 1 >>\n<< /Type /Page >>"))).toBe(1)
  })
})

describe("isThinManual", () => {
  it("flags a cover sheet", () => {
    expect(isThinManual(1)).toBe(true)
    expect(isThinManual(THIN_PAGE_MAX)).toBe(true)
  })

  it("does not flag a real manual", () => {
    expect(isThinManual(THIN_PAGE_MAX + 1)).toBe(false)
    expect(isThinManual(84)).toBe(false)
  })

  it("stays silent when the count is unknown, rather than crying wolf", () => {
    expect(isThinManual(null)).toBe(false)
    expect(isThinManual(undefined)).toBe(false)
    expect(isThinManual(0)).toBe(false)
  })
})

describe("thinManualWarning", () => {
  it("says what we saw and stops short of calling the tasks wrong", () => {
    const w = thinManualWarning(1)
    expect(w).toContain("1 page")
    expect(w).toContain("general guidance")
    expect(w).not.toMatch(/\bwrong\b|\bincorrect\b/)
  })

  it("pluralises", () => {
    expect(thinManualWarning(2)).toContain("2 pages")
  })
})
