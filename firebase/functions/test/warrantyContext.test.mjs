/**
 * warrantyContext — the item's warranty fields become a block Ask can quote.
 * Question detection, reading the item document, the calendar-month expiry
 * rule shared with the item page, and the wording of the block.
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import {
  isWarrantyQuestion,
  warrantyFactsFromDoc,
  formatWarrantyBlock,
  addMonths,
} from "../lib/firebase/functions/src/ai/warrantyContext.js"

const doc = (fields) => (field) => fields[field]

test("recognises warranty questions and leaves the rest alone", () => {
  for (const q of [
    "What does the warranty cover?",
    "Is my dishwasher still under warranty?",
    "is the fridge still covered",
    "Do I need to register the product?",
    "how long is the guarantee",
  ]) assert.equal(isWarrantyQuestion(q), true, q)
  for (const q of ["How do I clean the filter?", "What temperature should the fridge be?", "when is the next descale due"])
    assert.equal(isWarrantyQuestion(q), false, q)
})

test("reads the item document's warranty fields; a purchase date alone is not a warranty", () => {
  const f = warrantyFactsFromDoc("Bosch Dishwasher", doc({
    warrantyDurationMonths: 12, warrantyCoverage: "parts and labor",
    warrantyExclusions: ["cosmetic damage", " misuse "], warrantyRegistrationRequired: true,
    warrantyRegisteredAt: "2026-02-20", purchaseDate: "2026-02-14",
  }))
  assert.equal(f.itemName, "Bosch Dishwasher")
  assert.equal(f.durationMonths, 12)
  assert.deepEqual(f.exclusions, ["cosmetic damage", "misuse"])
  assert.equal(f.registeredAt, "2026-02-20")
  // Derived from purchase + duration when no explicit expiry is on record.
  assert.equal(f.expiryDate, "2027-02-14")
  assert.equal(f.expiryDerived, true)

  assert.equal(warrantyFactsFromDoc("Kettle", doc({ purchaseDate: "2026-01-01" })), null)
  assert.equal(warrantyFactsFromDoc("Kettle", doc({})), null)
})

test("an explicit expiry date wins over the derived one", () => {
  const f = warrantyFactsFromDoc("Washer", doc({
    warrantyDurationMonths: 24, purchaseDate: "2025-01-10", warrantyExpiryDate: "2027-06-30",
  }))
  assert.equal(f.expiryDate, "2027-06-30")
  assert.equal(f.expiryDerived, false)
})

test("calendar months, not 30-day blocks — the item page's rule", () => {
  assert.equal(addMonths("2026-02-14", 24), "2028-02-14")
  assert.equal(addMonths("2026-01-31", 1), "2026-03-03") // JS overflow, same as the client
  assert.equal(addMonths("2026-02-14", 0), null)
  assert.equal(addMonths("not a date", 12), null)
})

test("the block says in force / expired with the arithmetic done, and is empty when there is nothing", () => {
  const inForce = warrantyFactsFromDoc("Bosch Dishwasher", doc({
    warrantyDurationMonths: 12, warrantyCoverage: "parts and labor", purchaseDate: "2026-02-14",
    warrantyRegistrationRequired: false,
  }))
  const expired = warrantyFactsFromDoc("Old Kettle", doc({ warrantyExpiryDate: "2026-01-01", warrantyDurationMonths: 6 }))
  const block = formatWarrantyBlock([inForce, expired], "2026-09-16")
  assert.match(block, /## Warranty on record .*as of 2026-09-16/)
  assert.match(block, /### Bosch Dishwasher\n- Coverage: 1 year — parts and labor\n- Status: in force — expires 2027-02-14, in 151 days \(from the purchase date 2026-02-14 plus 12 months\)\n- Registration: not required/)
  assert.match(block, /### Old Kettle\n- Coverage: 6 months\n- Status: EXPIRED on 2026-01-01, 258 days ago/)
  assert.equal(formatWarrantyBlock([], "2026-09-16"), "")
})

test("no dates on record is said plainly rather than guessed", () => {
  const f = warrantyFactsFromDoc("Range Hood", doc({ warrantyCoverage: "parts only" }))
  assert.match(formatWarrantyBlock([f], "2026-09-16"), /- Status: no purchase or expiry date on record/)
})
