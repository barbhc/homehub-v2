/**
 * detectDocType core test — fixture Claude response. Verifies enum validation,
 * confidence clamping, and graceful degradation on a bad model response.
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import {
  classifyDocType,
  runDetectDocType,
  DOC_TYPE_MODEL,
  DOC_TYPE_MAX_PAGES,
} from "../lib/firebase/functions/src/ai/detectDocType.js"

/** A PDF skeleton whose page tree says it has `pages` pages — enough for
 *  countPdfPages, which is all the length check reads. */
const pdfWithPages = (pages) =>
  Buffer.from(`%PDF-1.4\n1 0 obj << /Type /Pages /Count ${pages} >> endobj\n%%EOF`).toString("base64")

test("valid classification passes through", async () => {
  const call = async () => JSON.stringify({ docType: "spec_sheet", confidence: 0.82, reason: "Dimensions table on p.1" })
  const res = await runDetectDocType(call, "PDFB64")
  assert.equal(res.docType, "spec_sheet")
  assert.equal(res.confidence, 0.82)
})

test("unknown docType + out-of-range confidence fall back", async () => {
  const call = async () => JSON.stringify({ docType: "flyer", confidence: 5, reason: "x" })
  const res = await runDetectDocType(call, "PDFB64")
  assert.equal(res.docType, "other")
  assert.equal(res.confidence, 0)
})

test("non-JSON model output degrades to other/0 (never throws)", async () => {
  const call = async () => "sorry, I can't tell"
  const res = await runDetectDocType(call, "PDFB64")
  assert.equal(res.docType, "other")
})

test("a Claude call failure degrades to other/0", async () => {
  const call = async () => { throw new Error("502") }
  const res = await runDetectDocType(call, "PDFB64")
  assert.equal(res.docType, "other")
  assert.equal(res.confidence, 0)
})

// ─── C3: Haiku 4.5, same prompt ──────────────────────────────────────────────

test("classifies on Haiku 4.5 — the repo's own model constant, not a string typed here", async () => {
  assert.equal(DOC_TYPE_MODEL, "claude-haiku-4-5")
  let sentModel = null
  await runDetectDocType(async ({ model }) => {
    sentModel = model
    return JSON.stringify({ docType: "manual", confidence: 0.9, reason: "Owner's manual cover" })
  }, pdfWithPages(40))
  assert.equal(sentModel, "claude-haiku-4-5")
})

test("the prompt text is byte-identical to the one Sonnet 5 was given", async () => {
  // sha256 of PROMPT at eae6fc9. A model switch must not smuggle in a prompt
  // change: those go through the eval, not through a cost PR.
  let sentPrompt = null
  let maxTokens = null
  await runDetectDocType(async ({ content, maxTokens: mt }) => {
    sentPrompt = content.find((b) => b.type === "text")?.text
    maxTokens = mt
    return "{}"
  }, pdfWithPages(3))
  assert.equal(createHash("sha256").update(sentPrompt).digest("hex"), "5d45851ba5a7c8fa44824d764a02dd45e3de491bf5bdd5e54d03ba47c78535ff")
  assert.equal(maxTokens, 256)
})

test("a document past Haiku's 100-page limit is not sent, and is marked unbilled", async () => {
  let called = false
  const out = await classifyDocType(async () => {
    called = true
    return "{}"
  }, pdfWithPages(DOC_TYPE_MAX_PAGES + 1))
  assert.equal(called, false, "a request that can only 400 must not be sent")
  assert.equal(out.claudeAnswered, false, "the caller refunds")
  assert.equal(out.result.docType, "other")
  assert.equal(out.result.confidence, 0)
})

test("a document AT the limit is sent", async () => {
  let called = false
  await classifyDocType(async () => {
    called = true
    return "{}"
  }, pdfWithPages(DOC_TYPE_MAX_PAGES))
  assert.equal(called, true)
})

test("an unknown page count (compressed page tree) is sent — the length check never guesses", async () => {
  let called = false
  await classifyDocType(async () => {
    called = true
    return "{}"
  }, Buffer.from("%PDF-1.5 compressed").toString("base64"))
  assert.equal(called, true)
})

test("billing: a failed Claude call is unbilled; an unparseable answer was billed", async () => {
  const failed = await classifyDocType(async () => { throw new Error("400 prompt is too long") }, pdfWithPages(80))
  assert.equal(failed.claudeAnswered, false)
  const garbled = await classifyDocType(async () => "not json at all", pdfWithPages(5))
  assert.equal(garbled.claudeAnswered, true)
  assert.equal(garbled.result.docType, "other")
})
