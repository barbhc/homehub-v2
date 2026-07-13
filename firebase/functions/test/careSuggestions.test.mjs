/**
 * careSuggestions core test — parseSuggestions validation (chunk_type enum,
 * required fields, cap at 8, fence tolerance) + the two run* cores against a
 * fixture Claude call.
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import {
  parseSuggestions,
  runSuggestCareNotes,
  runImportCareUrl,
} from "../lib/firebase/functions/src/ai/careSuggestions.js"

test("valid suggestions pass; invalid chunk_type dropped", () => {
  const raw = JSON.stringify({
    suggestions: [
      { title: "Descale monthly", content: "Run a descaling cycle.", chunk_type: "care" },
      { title: "Bad", content: "x", chunk_type: "nonsense" },
      { title: "How to", content: "Steps.", chunk_type: "how_to", category: "Kitchen" },
    ],
  })
  const res = parseSuggestions(raw)
  assert.equal(res.length, 2)
  assert.equal(res[0].chunk_type, "care")
  assert.equal(res[1].category, "Kitchen")
})

test("non-JSON degrades to empty array", () => {
  assert.deepEqual(parseSuggestions("sorry, no JSON here"), [])
})

test("suggestions are capped at 8", () => {
  const many = Array.from({ length: 15 }, (_, i) => ({ title: `T${i}`, content: "c", chunk_type: "care" }))
  const res = parseSuggestions(JSON.stringify({ suggestions: many }))
  assert.equal(res.length, 8)
})

test("runSuggestCareNotes returns parsed suggestions", async () => {
  const call = async () => JSON.stringify({ suggestions: [{ title: "T", content: "c", chunk_type: "troubleshooting" }] })
  const res = await runSuggestCareNotes(call, "home", { existing_tips: ["old tip"] })
  assert.equal(res.length, 1)
  assert.equal(res[0].chunk_type, "troubleshooting")
})

test("runImportCareUrl feeds page text and parses", async () => {
  let seenPrompt = ""
  const call = async ({ content }) => {
    seenPrompt = content[0].text
    return "```json\n" + JSON.stringify({ suggestions: [{ title: "T", content: "c", chunk_type: "care" }] }) + "\n```"
  }
  const res = await runImportCareUrl(call, "Clean the filter regularly.", "item_unit", {})
  assert.equal(res.length, 1)
  assert.ok(seenPrompt.includes("Clean the filter regularly."))
})
