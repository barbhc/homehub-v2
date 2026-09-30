/**
 * The whole-home saved-answer migration's rule (wholeHomeFaqMigration.ts). The
 * CLI only reads and writes; everything that decides what moves, and what the
 * House note says, is here.
 */
import { describe, expect, it } from "vitest"
import { splitNote } from "../../shared/notes/splitNote.js"
import {
  MIGRATION_SOURCE,
  isWholeHomeFaq,
  noteContentFor,
  noteDocFor,
  noteIdForFaq,
  planMigration,
  type FaqFacts,
} from "./wholeHomeFaqMigration.js"

const faq = (id: string, itemUnitId: unknown, question: unknown = "Where is the water shutoff?", answer: unknown = "Under the kitchen sink — the blue lever."): FaqFacts =>
  ({ id, itemUnitId, question, answer })

describe("which saved answers move", () => {
  it("only whole-home answers — an answer on an item stays where the item page shows it", () => {
    expect(isWholeHomeFaq(null)).toBe(true)
    expect(isWholeHomeFaq(undefined)).toBe(true)
    expect(isWholeHomeFaq("  ")).toBe(true)
    expect(isWholeHomeFaq("furnace")).toBe(false)

    const plan = planMigration([faq("f-item", "furnace"), faq("f-home", null), faq("f-missing", undefined)], new Set())
    expect(plan.map((r) => r.faqId)).toEqual(["f-home", "f-missing"])
    expect(plan.every((r) => r.action === "create")).toBe(true)
  })

  it("a second run writes nothing: the note's id is derived from the answer's", () => {
    const first = planMigration([faq("f1", null)], new Set())
    expect(first).toEqual([expect.objectContaining({ faqId: "f1", action: "create", noteId: "faq-f1" })])
    const again = planMigration([faq("f1", null)], new Set([noteIdForFaq("f1")]))
    expect(again).toEqual([{ faqId: "f1", action: "already-migrated", noteId: "faq-f1" }])
  })

  it("an answer with no words is reported and skipped, never written as an empty note", () => {
    expect(planMigration([faq("f-empty", null, "  ", "")], new Set())).toEqual([{ faqId: "f-empty", action: "skip-empty" }])
    expect(planMigration([faq("f-junk", null, 42, null)], new Set())).toEqual([{ faqId: "f-junk", action: "skip-empty" }])
  })
})

describe("the House note it becomes", () => {
  it("reads as a note: the question is the heading, the answer the body (splitNote, like every note row)", () => {
    const content = noteContentFor("Where is the water shutoff?", "Under the kitchen sink — the blue lever.")
    expect(content).toBe("Where is the water shutoff?\nUnder the kitchen sink — the blue lever.")
    expect(splitNote(content, null)).toEqual({
      heading: "Where is the water shutoff?",
      body: "Under the kitchen sink — the blue lever.",
    })
  })

  it("keeps every word — a long question is not cut to fit a heading", () => {
    const q = "How often should the furnace humidifier pad be replaced if the house runs dry all winter?"
    const content = noteContentFor(q, "Once a season.")
    expect(content.startsWith(q)).toBe(true)
    expect(content.endsWith("Once a season.")).toBe(true)
  })

  it("is a house-scope careNote in createCareNote's shape, with its provenance", () => {
    const [row] = planMigration([faq("f1", null)], new Set())
    if (row.action !== "create") throw new Error("expected a create row")
    const doc = noteDocFor(row, { createdAt: "C", updatedAt: "U", migratedAt: "M" })
    expect(doc).toEqual({
      roomId: null,
      itemUnitId: null,
      scope: "home",
      category: null,
      chunkType: "care",
      // A note is just text: title stays null so the note editor (content only)
      // can change every word of it.
      title: null,
      content: "Where is the water shutoff?\nUnder the kitchen sink — the blue lever.",
      source: MIGRATION_SOURCE,
      sourceUrl: null,
      taskTemplateId: null,
      faqId: "f1",
      createdAt: "C",
      updatedAt: "U",
      migratedAt: "M",
      // Every notes read filters deletedAt == null — a missing field would hide it.
      deletedAt: null,
    })
    expect(MIGRATION_SOURCE).toBe("faq-migration")
  })
})
