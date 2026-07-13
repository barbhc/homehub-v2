/**
 * detectDocType core test — fixture Claude response. Verifies enum validation,
 * confidence clamping, and graceful degradation on a bad model response.
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import { runDetectDocType } from "../lib/firebase/functions/src/ai/detectDocType.js"

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
