/**
 * ingestReference core test — runIngestReference validates sections, drops empty
 * content, caps at 100, tolerates fences, and degrades to [] on non-JSON / non-array.
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import { runIngestReference } from "../lib/firebase/functions/src/ai/ingestReference.js"

test("valid sections pass; empty-content dropped", async () => {
  const call = async () => JSON.stringify([
    { title: "Vanilla cake", content: "Mix and bake.", tags: ["recipe", "dessert"] },
    { title: "Blank", content: "", tags: [] },
  ])
  const res = await runIngestReference(call, "PDFB64")
  assert.equal(res.length, 1)
  assert.equal(res[0].title, "Vanilla cake")
  assert.deepEqual(res[0].tags, ["recipe", "dessert"])
})

test("tolerates code fences", async () => {
  const call = async () => "```json\n" + JSON.stringify([{ title: "T", content: "c", tags: [] }]) + "\n```"
  const res = await runIngestReference(call, "PDFB64")
  assert.equal(res.length, 1)
})

test("non-array / non-JSON degrades to []", async () => {
  assert.deepEqual(await runIngestReference(async () => "{}", "x"), [])
  assert.deepEqual(await runIngestReference(async () => "garbage", "x"), [])
})

test("caps at 100 sections", async () => {
  const many = Array.from({ length: 130 }, (_, i) => ({ title: `S${i}`, content: `c${i}`, tags: [] }))
  const res = await runIngestReference(async () => JSON.stringify(many), "x")
  assert.equal(res.length, 100)
})
