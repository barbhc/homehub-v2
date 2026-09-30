/**
 * Ask reads less (askReads.ts) — against the Firestore emulator.
 *
 * For every scope a question can have, readAskNotes and readScopedManuals must
 * produce EXACTLY what chatQuery's old whole-collection reads produced (the
 * old code is inlined below as the oracle, verbatim), while reading fewer
 * documents; readChunkCandidates must stay inside the question's budget and
 * still reach the manual the question names.
 *
 * Run via `npm run test:worker:emu` (compiles first; FIRESTORE_EMULATOR_HOST set).
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import { getApps, initializeApp } from "firebase-admin/app"
import { getFirestore, Timestamp } from "firebase-admin/firestore"
import {
  ReadTally,
  readAskNotes,
  readScopedManuals,
  readChunkCandidates,
  CHUNK_READ_BUDGET,
} from "../lib/firebase/functions/src/ai/askReads.js"

assert.ok(process.env.FIRESTORE_EMULATOR_HOST, "FIRESTORE_EMULATOR_HOST must be set (run via emulators:exec)")
if (getApps().length === 0) initializeApp({ projectId: "demo-homehub" })
const db = getFirestore()

const HOME = `ask-reads-${Date.now()}`
const GONE = Timestamp.fromDate(new Date("2026-06-01T00:00:00Z"))
const PREFERRED_TYPES = ["care", "how_to", "troubleshooting", "reference"]

const ITEMS = [
  { id: "fridge", displayName: "LG Refrigerator", category: "refrigerator", roomId: "kitchen", notes: "Filter is LT1000P" },
  { id: "dishwasher", displayName: "Bosch Dishwasher", category: "dishwasher", roomId: "kitchen", notes: null },
  { id: "washer", displayName: "LG Washer", category: "washer", roomId: "laundry", notes: null },
  { id: "furnace", displayName: "Carrier Furnace", category: "furnace", roomId: null, notes: null },
  { id: "garage-freezer", displayName: "Garage Freezer", category: "freezer", roomId: "garage", notes: null },
  { id: "attic-fan", displayName: "Attic Fan", category: "fan", roomId: "attic", notes: null },
]

async function seed() {
  const w = db.batch()
  const put = (path, data) => w.set(db.doc(`homes/${HOME}/${path}`), data)
  put("rooms/kitchen", { name: "Kitchen", deletedAt: null })
  put("rooms/laundry", { name: "Laundry", deletedAt: null })
  put("rooms/attic", { name: "Attic", deletedAt: GONE })
  put("rooms/garage", { name: "Garage" }) // no deletedAt field at all
  for (const i of ITEMS) put(`items/${i.id}`, { ...i, deletedAt: null })
  const note = (id, d) => put(`careNotes/${id}`, { title: null, deletedAt: null, ...d })
  note("n-home-1", { scope: "home", content: "Water shutoff is behind the furnace" })
  note("n-home-empty", { scope: "home", content: "   " })
  note("n-kitchen-1", { scope: "room", roomId: "kitchen", content: "Kitchen paint is SW Alabaster" })
  note("n-kitchen-2", { scope: "room", roomId: "kitchen", title: "Outlets", content: "GFCI resets by the sink" })
  note("n-laundry", { scope: "room", roomId: "laundry", content: "Laundry drain clogs in winter" })
  note("n-attic", { scope: "room", roomId: "attic", content: "Attic hatch is in the closet" })
  note("n-garage", { scope: "room", roomId: "garage", content: "Garage breaker is 14" })
  note("n-fridge-1", { scope: "item_unit", itemUnitId: "fridge", content: "Ice maker off in winter" })
  note("n-fridge-2", { scope: "item_unit", itemUnitId: "fridge", content: "Coils vacuumed in May" })
  note("n-washer", { scope: "item_unit", itemUnitId: "washer", content: "Use the clean cycle monthly" })
  note("n-furnace", { scope: "item_unit", itemUnitId: "furnace", content: "Filter size 20x25x5" })
  note("n-deleted", { scope: "home", content: "Old note", deletedAt: GONE })
  note("n-odd-scope", { scope: "category", content: "Should never show" })
  const manual = (id, itemUnitId, over = {}) => put(`manuals/${id}`, { itemUnitId, sourceType: "upload", sourceRef: `manuals/${id}.pdf`, deletedAt: null, ...over })
  manual("m-fridge", "fridge")
  manual("m-dishwasher", "dishwasher")
  manual("m-washer", "washer")
  manual("m-furnace-a", "furnace")
  manual("m-furnace-b", "furnace")
  manual("m-gone", "washer", { deletedAt: GONE })
  await w.commit()
  // 50 chunks per live manual, so the old per-manual cap of 40 would bind.
  for (const m of ["m-fridge", "m-dishwasher", "m-washer", "m-furnace-a", "m-furnace-b"]) {
    const cw = db.batch()
    for (let i = 0; i < 50; i++) {
      cw.set(db.doc(`homes/${HOME}/manuals/${m}/chunks/c${String(i).padStart(2, "0")}`), {
        title: `${m} section ${i}`, content: `Step ${i} for ${m}`, chunkType: "care", deletedAt: null, tags: [], scenarios: [], appliesTo: [], sectionCategory: "",
      })
    }
    await cw.commit()
  }
}

/** chatQuery's notes block before askReads, verbatim — the oracle. */
async function oldNotes({ wholeHome, scopedItems, scopedIds, nameByItem }) {
  const noteInputs = []
  const [notesSnap, roomsSnap] = await Promise.all([
    db.collection(`homes/${HOME}/careNotes`).where("deletedAt", "==", null).get(),
    db.collection(`homes/${HOME}/rooms`).where("deletedAt", "==", null).get(),
  ])
  const roomName = new Map(roomsSnap.docs.map((r) => [r.id, r.get("name") ?? "Room"]))
  const roomsInScope = wholeHome ? new Set(roomName.keys()) : new Set(scopedItems.map((i) => i.roomId).filter((r) => !!r))
  for (const d of notesSnap.docs) {
    const scope = d.get("scope")
    const content = d.get("content") ?? ""
    const title = d.get("title") ?? null
    if (!content.trim()) continue
    if (scope === "home") {
      noteInputs.push({ scope, scopeLabel: "House", title, content })
    } else if (scope === "room") {
      const roomId = d.get("roomId")
      if (roomId && roomsInScope.has(roomId)) noteInputs.push({ scope, scopeLabel: roomName.get(roomId) ?? "Room", title, content })
    } else if (scope === "item_unit") {
      const itemId = d.get("itemUnitId")
      if (itemId && scopedIds.has(itemId)) noteInputs.push({ scope, scopeLabel: nameByItem.get(itemId) ?? "Item", title, content })
    }
  }
  return { noteInputs, reads: notesSnap.size + roomsSnap.size }
}

const nameByItem = new Map(ITEMS.map((i) => [i.id, i.displayName]))
const SCOPES = {
  "whole home": { wholeHome: true, scopedItems: ITEMS },
  "one item (fridge)": { wholeHome: false, scopedItems: ITEMS.filter((i) => i.id === "fridge") },
  "one item with no room (furnace)": { wholeHome: false, scopedItems: ITEMS.filter((i) => i.id === "furnace") },
  "a room (laundry)": { wholeHome: false, scopedItems: ITEMS.filter((i) => i.roomId === "laundry") },
  "a deleted room's item (attic fan)": { wholeHome: false, scopedItems: ITEMS.filter((i) => i.id === "attic-fan") },
  "a category (refrigerator)": { wholeHome: false, scopedItems: ITEMS.filter((i) => i.category === "refrigerator") },
}

let seeded
const ready = () => (seeded ??= seed())

for (const [label, s] of Object.entries(SCOPES)) {
  test(`notes, ${label}: the same list as the whole-collection read, for fewer documents`, async () => {
    await ready()
    const scopedIds = new Set(s.scopedItems.map((i) => i.id))
    const tally = new ReadTally()
    const got = await readAskNotes(db, { homeId: HOME, wholeHome: s.wholeHome, scopedItems: s.scopedItems, scopedIds, nameByItem }, tally)
    const want = await oldNotes({ ...s, scopedIds, nameByItem })
    assert.deepEqual(got, want.noteInputs)
    assert.ok(tally.docsRead <= want.reads, `read ${tally.docsRead}, the old read took ${want.reads}`)
    if (!s.wholeHome) assert.ok(tally.docsRead < want.reads, `a scoped question should read less: ${tally.docsRead} vs ${want.reads}`)
  })
}

test("rooms are read only when a room note could be shown", async () => {
  await ready()
  const tally = new ReadTally()
  const fridge = ITEMS.filter((i) => i.id === "fridge")
  await readAskNotes(db, { homeId: HOME, wholeHome: false, scopedItems: fridge, scopedIds: new Set(["fridge"]), nameByItem }, tally)
  assert.equal(tally.reads.rooms, 1, "the kitchen, by id, for its two notes — not the whole rooms collection")
  const furnaceTally = new ReadTally()
  const furnace = ITEMS.filter((i) => i.id === "furnace")
  await readAskNotes(db, { homeId: HOME, wholeHome: false, scopedItems: furnace, scopedIds: new Set(["furnace"]), nameByItem }, furnaceTally)
  assert.equal(furnaceTally.reads.rooms, 0, "no room in scope, no room read")
  const wholeTally = new ReadTally()
  await readAskNotes(db, { homeId: HOME, wholeHome: true, scopedItems: ITEMS, scopedIds: new Set(ITEMS.map((i) => i.id)), nameByItem }, wholeTally)
  assert.equal(wholeTally.reads.rooms, 2, "whole home with room notes: the live rooms, as before")
})

test("manuals: only the scoped items', in the same order, deleted ones excluded", async () => {
  await ready()
  const all = await db.collection(`homes/${HOME}/manuals`).where("deletedAt", "==", null).get()
  for (const [label, s] of Object.entries(SCOPES)) {
    const scopedIds = new Set(s.scopedItems.map((i) => i.id))
    const tally = new ReadTally()
    const got = await readScopedManuals(db, HOME, s.wholeHome, scopedIds, tally)
    const want = all.docs.filter((d) => scopedIds.has(d.get("itemUnitId") ?? ""))
    assert.deepEqual(got.filter((d) => scopedIds.has(d.get("itemUnitId") ?? "")).map((d) => d.id), want.map((d) => d.id), label)
    if (!s.wholeHome) assert.ok(tally.reads.manuals <= Math.max(want.length, 1), `${label}: read ${tally.reads.manuals}`)
  }
})

test("chunks: a whole-home question reads at most the budget, and the manuals it names first", async () => {
  await ready()
  const manuals = ["m-dishwasher", "m-fridge", "m-furnace-a", "m-furnace-b", "m-washer"].map((manualId) => ({
    manualId,
    itemUnitId: manualId === "m-fridge" ? "fridge" : manualId === "m-dishwasher" ? "dishwasher" : manualId === "m-washer" ? "washer" : "furnace",
  }))
  const items = { name: (id) => nameByItem.get(id), category: (id) => ITEMS.find((i) => i.id === id)?.category }
  const tally = new ReadTally()
  const candidates = await readChunkCandidates(db, HOME, "How do I change my furnace filter?", manuals, items, PREFERRED_TYPES, tally)
  assert.equal(candidates.length, CHUNK_READ_BUDGET, "was 5 × 40 = 200")
  assert.equal(tally.reads.chunks, CHUNK_READ_BUDGET)
  const perManual = (m) => candidates.filter((c) => c.title.startsWith(`${m} `)).length
  assert.equal(perManual("m-furnace-a"), 40)
  assert.equal(perManual("m-furnace-b"), 40)
  assert.equal(perManual("m-dishwasher") + perManual("m-fridge") + perManual("m-washer"), 40)
  // Manual order is kept — rankChunks breaks ties by position.
  assert.deepEqual([...new Set(candidates.map((c) => c.title.split(" ")[0]))], manuals.map((m) => m.manualId))
})

test("chunks: three manuals or fewer read 40 each, as before", async () => {
  await ready()
  const manuals = [{ manualId: "m-fridge", itemUnitId: "fridge" }, { manualId: "m-washer", itemUnitId: "washer" }]
  const tally = new ReadTally()
  const candidates = await readChunkCandidates(db, HOME, "anything", manuals, { name: (id) => nameByItem.get(id), category: () => null }, PREFERRED_TYPES, tally)
  assert.equal(candidates.length, 80)
})
