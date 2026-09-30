/**
 * notesContext — Ask reads the household's notes, but only the ones that
 * match the question, and cites only the scopes it used.
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import { pickNotes, formatNotesBlock, noteSources } from "../lib/firebase/functions/src/ai/notesContext.js"

const notes = [
  { scope: "home", scopeLabel: "House", title: null, content: "Water shutoff: under the kitchen sink, blue lever." },
  { scope: "home", scopeLabel: "House", title: null, content: "Router & modem: behind the TV." },
  { scope: "room", scopeLabel: "Kitchen", title: null, content: "Paint: Benjamin Moore Swiss Coffee OC-45, eggshell." },
  { scope: "item_unit", scopeLabel: "Carrier Infinity Furnace", title: null, content: "Quirks: clicks twice when it starts. The tech says that's normal." },
]

test("the matching note answers the question; the rest stay out", () => {
  const picked = pickNotes("Where's the water shutoff?", notes)
  assert.equal(picked.length, 1)
  assert.equal(picked[0].heading, "Water shutoff")
  assert.equal(picked[0].scopeLabel, "House")
})

test("a room's name counts toward the match", () => {
  const picked = pickNotes("What paint is in the kitchen?", notes)
  assert.equal(picked[0].scopeLabel, "Kitchen")
  assert.equal(picked[0].heading, "Paint")
})

test("the body matches too — a symptom finds its quirk", () => {
  const picked = pickNotes("my furnace clicks twice, is that normal", notes)
  assert.equal(picked[0].scopeLabel, "Carrier Infinity Furnace")
})

test("nothing matches, or a question with no real words → no notes, no block, no chips", () => {
  assert.deepEqual(pickNotes("how do I descale the kettle", notes), [])
  assert.deepEqual(pickNotes("what is it", notes), [])
  assert.equal(formatNotesBlock([]), "")
  assert.deepEqual(noteSources([]), [])
})

test("the block names each note's scope; sources are one chip per scope used", () => {
  const picked = pickNotes("kitchen sink shutoff and kitchen paint", notes)
  const block = formatNotesBlock(picked)
  assert.match(block, /## Your notes \(what the household wrote down\)/)
  assert.match(block, /- \[House\] Water shutoff: under the kitchen sink, blue lever\./)
  assert.match(block, /- \[Kitchen\] Paint: Benjamin Moore Swiss Coffee OC-45, eggshell\./)
  assert.deepEqual(noteSources(picked).map((s) => s.item_name).sort(), ["House", "Kitchen"])
  assert.ok(noteSources(picked).every((s) => s.source_type === "note" && s.title === "Your note"))
})

test("at most `limit` notes, best match first", () => {
  const many = Array.from({ length: 12 }, (_, i) => ({ scope: "home", scopeLabel: "House", title: null, content: `Filter ${i}: filter note ${i}` }))
  assert.equal(pickNotes("filter", many, 8).length, 8)
})
