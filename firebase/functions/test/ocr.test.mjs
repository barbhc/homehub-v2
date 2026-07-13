/**
 * ocr core test — fixture Claude response for runOcrExtract. Verifies the
 * empty-text short-circuit, field validation, strict date/price bounds, docType
 * enum fallback, and graceful degradation on malformed / failing Claude output.
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import { runOcrExtract } from "../lib/firebase/functions/src/ai/ocr.js"

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
