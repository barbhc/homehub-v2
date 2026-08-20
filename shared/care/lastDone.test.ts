import { describe, expect, it } from "vitest"
import { parseLastDone, earliestLastDone } from "./lastDone"

const TODAY = "2026-08-20"

describe("parseLastDone", () => {
  it("accepts a real past date", () => {
    expect(parseLastDone("2026-02-20", TODAY)).toBe("2026-02-20")
  })

  it("accepts today — doing it this morning counts", () => {
    expect(parseLastDone(TODAY, TODAY)).toBe(TODAY)
  })

  it("rejects the future", () => {
    expect(parseLastDone("2026-08-21", TODAY)).toBeNull()
  })

  it("rejects a date that looks valid but never existed", () => {
    // The regex allows it; the calendar does not. 2026 is not a leap year.
    expect(parseLastDone("2026-02-30", TODAY)).toBeNull()
    expect(parseLastDone("2026-02-29", TODAY)).toBeNull()
    expect(parseLastDone("2026-13-01", TODAY)).toBeNull()
  })

  it("rejects a mistyped year rather than mis-scheduling on it", () => {
    expect(parseLastDone("2016-08-19", TODAY)).toBeNull()
    expect(parseLastDone("2016-08-21", TODAY)).toBe("2016-08-21")
  })

  it("rejects anything that isn't a YYYY-MM-DD string", () => {
    for (const bad of [null, undefined, 42, {}, [], "", "yesterday", "20/08/2026", "2026-8-2"]) {
      expect(parseLastDone(bad, TODAY)).toBeNull()
    }
  })

  it("offers the picker the same floor the server enforces", () => {
    const floor = earliestLastDone(TODAY)
    expect(parseLastDone(floor, TODAY)).toBe(floor)
  })
})
