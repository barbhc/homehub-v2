/**
 * Notes are just text (design/spares-and-notes.md §2): the heading is derived,
 * ideas start a note and never become fields, and the old single item-notes
 * field shows up as an ordinary note instead of staying invisible.
 */
import { describe, it, expect } from "vitest"
import { splitNote, displayBody, isBlankNote, ideasFor, notesSummary, legacyItemNote, isLegacyNote, noteDate } from "./notes"

const n = (content: string, title: string | null = null) => ({ content, title })

describe("splitNote — the heading is read, never stored", () => {
  it("'Label: text' reads as a heading and a line", () => {
    expect(splitNote("Paint: Benjamin Moore Swiss Coffee OC-45, eggshell.")).toEqual({
      heading: "Paint", body: "Benjamin Moore Swiss Coffee OC-45, eggshell.",
    })
  })
  it("a colon in a URL or a time is not a heading", () => {
    expect(splitNote("https://www.homedepot.com/p/1").heading).toBeNull()
    expect(splitNote("Tech comes at 10:30 on Tuesdays").heading).toBeNull()
  })
  it("a short first line over more lines is the heading", () => {
    expect(splitNote("Router\nLiving room, behind the TV.")).toEqual({ heading: "Router", body: "Living room, behind the TV." })
  })
  it("one plain sentence has no heading", () => {
    expect(splitNote("The left panel lifts straight off.")).toEqual({ heading: null, body: "The left panel lifts straight off." })
  })
  it("a stored title (the old care-tip notes) wins", () => {
    expect(splitNote("Rinse monthly.", "Filter care")).toEqual({ heading: "Filter care", body: "Rinse monthly." })
  })
})

describe("displayBody — reads as a sentence, stored as typed", () => {
  it("capitalises the line under a heading, and nothing else", () => {
    expect(displayBody("hall closet, left wall", true)).toBe("Hall closet, left wall")
    expect(displayBody("hall closet, left wall", false)).toBe("hall closet, left wall")
    expect(displayBody("iPhone charger in the drawer", true)).toBe("iPhone charger in the drawer")
    expect(displayBody("eBay order #12", true)).toBe("eBay order #12")
  })
})

describe("isBlankNote — Save waits for something worth saving", () => {
  it("empty, whitespace, or only an idea's seed is blank", () => {
    expect(isBlankNote("")).toBe(true)
    expect(isBlankNote("   ")).toBe(true)
    expect(isBlankNote("Paint: ")).toBe(true)
  })
  it("a real note, even a one-word one, is not", () => {
    expect(isBlankNote("Paint: Swiss Coffee")).toBe(false)
    expect(isBlankNote("Breaker 14")).toBe(false)
  })
})

describe("ideasFor — suggestions by scope, never repeated", () => {
  it("the house, a room and an item each get their own ideas", () => {
    expect(ideasFor("home", null, []).map((i) => i.label)).toContain("Water shutoff")
    expect(ideasFor("room", null, []).map((i) => i.label)).toContain("Paint")
    expect(ideasFor("item_unit", "system", []).map((i) => i.label)).toContain("How to reach the filter")
  })
  it("an idea starts a note with its label and carries a hint — it is not a field", () => {
    const paint = ideasFor("room", null, []).find((i) => i.label === "Paint")!
    expect(paint.seed).toBe("Paint: ")
    expect(paint.hint).toMatch(/where the leftover is/)
  })
  it("an item of an unknown category still gets the common ideas", () => {
    expect(ideasFor("item_unit", "something_new", []).map((i) => i.label)).toEqual(["Who services it", "Quirks & noises"])
  })
  it("once a note exists, its idea stops being offered", () => {
    const labels = ideasFor("home", null, [n("Water shutoff: under the sink")]).map((i) => i.label)
    expect(labels).not.toContain("Water shutoff")
    expect(labels).toContain("Breaker panel")
  })
})

describe("notesSummary — the House notes card's one line", () => {
  it("names two and counts the rest", () => {
    expect(notesSummary([n("Water shutoff: sink"), n("Breaker panel: hall"), n("Router & modem: TV"), n("Trash & recycling: P1")]))
      .toBe("Water shutoff, breaker panel and 2 more")
  })
  it("one or two read as a phrase; nothing is null", () => {
    expect(notesSummary([n("Water shutoff: sink")])).toBe("Water shutoff")
    expect(notesSummary([n("Water shutoff: sink"), n("LG remote: drawer")])).toBe("Water shutoff and LG remote")
    expect(notesSummary([])).toBeNull()
  })
})

describe("legacyItemNote — the old item notes field is never lost", () => {
  const item = { item_unit_id: "furnace", home_id: "h1", notes: "  Filter is behind the left panel  ", created_at: "2026-03-01T00:00:00Z", updated_at: "2026-04-01T00:00:00Z" }
  it("shows as an ordinary note with a fixed id, text trimmed", () => {
    const note = legacyItemNote(item)!
    expect(note.note_id).toBe("legacy-furnace")
    expect(isLegacyNote(note.note_id)).toBe(true)
    expect(note.content).toBe("Filter is behind the left panel")
    expect(note.scope).toBe("item_unit")
  })
  it("no text → no note", () => {
    expect(legacyItemNote({ ...item, notes: null })).toBeNull()
    expect(legacyItemNote({ ...item, notes: "   " })).toBeNull()
  })
})

describe("noteDate", () => {
  const now = new Date("2026-09-27T12:00:00Z")
  it("this year reads short; another year says which", () => {
    expect(noteDate("2026-09-12T10:00:00Z", now)).toBe("Sep 12")
    expect(noteDate("2025-09-12T10:00:00Z", now)).toBe("Sep 12, 2025")
    expect(noteDate("", now)).toBe("")
  })
})
