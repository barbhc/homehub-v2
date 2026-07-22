/**
 * ocr core test — fixture Claude response for runOcrExtract. Verifies the
 * empty-text short-circuit, field validation, strict date/price bounds, docType
 * enum fallback, and graceful degradation on malformed / failing Claude output.
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import { runOcrExtract, runOcrImageExtract, isEmptyExtraction } from "../lib/firebase/functions/src/ai/ocr.js"

test("empty text short-circuits without calling Claude", async () => {
  let called = false
  const call = async () => { called = true; return "{}" }
  const res = await runOcrExtract(call, "   ")
  assert.equal(called, false)
  assert.equal(res.docType, "unknown")
  assert.equal(res.confidence, 0)
  assert.equal(res.brand, null)
})

test("valid nameplate extraction passes through", async () => {
  const call = async () => JSON.stringify({
    brand: "Coway", model: "AP-1512HH", name: "Coway Airmega", serialNumber: "SN12345678",
    category: "air purifier", purchaseDate: null, purchasePrice: null,
    docType: "nameplate", confidence: 0.9,
  })
  const res = await runOcrExtract(call, "MODEL AP-1512HH ...")
  assert.equal(res.brand, "Coway")
  assert.equal(res.model, "AP-1512HH")
  assert.equal(res.docType, "nameplate")
  assert.equal(res.confidence, 0.9)
})

test("bad date + out-of-range price + unknown docType are nulled/clamped", async () => {
  const call = async () => JSON.stringify({
    brand: "GE", model: "X", name: null, serialNumber: null, category: null,
    purchaseDate: "07/13/2026", purchasePrice: 5_000_000, docType: "flyer", confidence: 2,
  })
  const res = await runOcrExtract(call, "receipt text")
  assert.equal(res.purchaseDate, null)
  assert.equal(res.purchasePrice, null)
  assert.equal(res.docType, "unknown")
  assert.equal(res.confidence, 0)
})

test("valid receipt date + price pass; code fences stripped", async () => {
  const call = async () => "```json\n" + JSON.stringify({
    brand: "Whirlpool", model: "WRF", name: "Fridge", serialNumber: null,
    category: "refrigerator", purchaseDate: "2026-01-15", purchasePrice: 1499.99,
    docType: "receipt", confidence: 0.75,
  }) + "\n```"
  const res = await runOcrExtract(call, "HOME DEPOT ... TOTAL")
  assert.equal(res.purchaseDate, "2026-01-15")
  assert.equal(res.purchasePrice, 1499.99)
  assert.equal(res.docType, "receipt")
})

test("non-JSON model output degrades to empty extraction (never throws)", async () => {
  const call = async () => "I cannot read this image."
  const res = await runOcrExtract(call, "garbled")
  assert.equal(res.docType, "unknown")
  assert.equal(res.confidence, 0)
  assert.equal(res.brand, null)
})

test("image fallback sends the image block + pinned model and parses the reply", async () => {
  let seen = null
  const call = async (args) => {
    seen = args
    return JSON.stringify({
      brand: "Bosch", model: "SHEM63W55N", name: "Bosch SHEM63W55N", serialNumber: null,
      category: "dishwasher", purchaseDate: null, purchasePrice: null,
      docType: "nameplate", confidence: 0.8,
    })
  }
  const res = await runOcrImageExtract(call, "aGVsbG8=", "image/jpeg")
  assert.equal(res.brand, "Bosch")
  assert.equal(res.docType, "nameplate")
  assert.equal(seen.model, "claude-3-5-haiku-20241022")
  const imageBlock = seen.content.find((b) => b.type === "image")
  assert.ok(imageBlock, "expected an image content block")
  assert.equal(imageBlock.source.media_type, "image/jpeg")
  assert.equal(imageBlock.source.data, "aGVsbG8=")
  const textBlock = seen.content.find((b) => b.type === "text")
  assert.ok(textBlock?.text.includes("docType"), "image prompt carries the shared schema")
})

test("image fallback degrades to empty extraction on non-JSON output", async () => {
  const call = async () => "The label is too blurry to read."
  const res = await runOcrImageExtract(call, "aGVsbG8=", "image/jpeg")
  assert.equal(isEmptyExtraction(res), true)
})

test("isEmptyExtraction: any single useful field makes it non-empty", () => {
  const empty = {
    brand: null, model: null, name: null, serialNumber: null, category: null,
    purchaseDate: null, purchasePrice: null, docType: "unknown", confidence: 0,
  }
  assert.equal(isEmptyExtraction(empty), true)
  assert.equal(isEmptyExtraction({ ...empty, model: "AP-1512HH" }), false)
  assert.equal(isEmptyExtraction({ ...empty, purchasePrice: 0 }), false)
  // docType/confidence alone don't count — nothing a form field could use.
  assert.equal(isEmptyExtraction({ ...empty, docType: "nameplate", confidence: 0.4 }), true)
})
