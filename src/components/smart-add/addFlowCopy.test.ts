/**
 * Copy and field-placement contracts for the add flow (beta round 5).
 *
 * Structural on purpose: these are claims about what a screen SAYS and which
 * screen a field lives on, and a rendering test would pass just as happily with
 * the header describing a different step.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

/** Source with comments stripped. These assert what a screen SAYS, and a
 *  comment explaining why old copy was removed would otherwise read as the
 *  copy still being there. */
const read = (p: string) =>
  readFileSync(resolve(__dirname, p), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
const identify = read("./IdentifyStep.tsx")
const page = read("../../pages/SmartAddItem.tsx")
const purchase = read("./PurchaseStep.tsx")

describe("the header describes the step you are on", () => {
  it("no longer promises a name field to a step that has none", () => {
    // Step 1 asks for brand and model; the chooser asks its own question.
    expect(page).not.toContain("Give it a name to get started")
  })

  it("derives the subtitle per step instead of hardcoding one", () => {
    expect(page).toContain("stepSubtitle")
    expect(page).toContain('subtitle={stepSubtitle}')
  })
})

describe("purchase details are asked once, at the end", () => {
  it("step 1 no longer collects purchase date or price", () => {
    expect(identify).not.toContain('id="identify-purchase-date"')
    expect(identify).not.toContain('id="identify-purchase-price"')
  })

  it("step 1 keeps serial — identity, not a receipt", () => {
    expect(identify).toContain('id="identify-serial"')
  })

  it("the purchase step accepts what a scan already read, so nothing is lost", () => {
    expect(purchase).toContain("initialPurchaseDate")
    expect(purchase).toContain("initialPrice")
    expect(page).toContain("initialPurchaseDate={identifyData.purchaseDate}")
  })

  it("does not advertise a field that moved to another step", () => {
    // The teaser listed "Purchase date → warranty tracking" above a section
    // that no longer contains it.
    const teaser = identify.slice(identify.indexOf("Add more details"))
    expect(teaser.slice(0, 900)).not.toContain("Purchase date")
  })
})

describe("finding the model another way", () => {
  it("is one labelled disclosure, not three floating buttons", () => {
    expect(identify).toContain("Find the model another way")
    expect(identify).not.toContain("Snap label instead")
  })

  it("calls the photo library a photo library", () => {
    // "From library" reads as a MANUAL library in this app — the one library
    // it isn't.
    expect(identify).not.toContain(">From library<")
    expect(identify).toContain("Choose a photo")
  })
})

describe("the name field", () => {
  it("only reports itself invalid after the user has been in it", () => {
    // It auto-composes from brand + model, so empty is the normal opening
    // state and a red border greets people with an error we are about to fix.
    expect(identify).toContain("aria-invalid={nameTouched && data.name.trim().length === 0}")
  })
})
