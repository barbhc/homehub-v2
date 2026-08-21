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

/**
 * Round 6, HH-23. Chris asked for one field per screen; the owner asked for
 * fewer fields before the manual, which is a different and better fix. These
 * pin the shape of that, because every one of them is a claim that would
 * survive a rendering test unchanged.
 */
describe("the shortest path to a parsed manual", () => {
  const room = read("./RoomSelector.tsx")

  it("does not wait for a NAME before the manual", () => {
    // A name typed before the manual is read is the worst version of the name —
    // this flow produced "Levoit Core Series Air Purifiers" for a Core 300.
    expect(identify).toContain("data.brand.trim().length >= 2 && data.model.trim().length >= 1\n")
    expect(identify).not.toContain("data.model.trim().length >= 1 && data.name.trim().length > 0")
  })

  it("composes a name rather than leaving the item unnamed", () => {
    expect(page).toContain("composedName")
    expect(page).toContain("display_name: composedName")
  })

  it("still requires a name in the lane where nothing else identifies the item", () => {
    expect(identify).toContain('mode === "appliance"')
    expect(identify).toContain("data.name.trim().length > 0")
  })

  it("names the destination on the button, and it is not an automatic search", () => {
    // The beta's default is the owner adding their own manual; the automatic
    // search stays behind its labelled beta panel.
    expect(identify).toContain('"Next: add the manual"')
    expect(identify).not.toContain('"Find the manual"')
  })

  it("fills the room in from the item type instead of asking cold", () => {
    expect(identify).toContain("suggestForSubType={data.subType}")
    expect(room).toContain("inferRoom")
  })

  it("tells the user the room was filled in for them", () => {
    // A prefill nobody can see is an assumption, not a suggestion.
    expect(room).toContain("Filled in from the item type")
  })

  it("never overwrites a room the user already chose", () => {
    expect(room).toContain("value != null")
  })
})

/**
 * HH-76 — the screen the owner approved vs the screen that shipped.
 *
 * The agreed design was brand + model + one call to action. The first pass
 * moved the NAME field and stopped, leaving Room and Category standing between
 * the model field and the button. This pins the rest of it.
 */
describe("nothing stands between the model and the manual", () => {
  const identify2 = read("./IdentifyStep.tsx")
  const beforeDetails = identify2.slice(0, identify2.indexOf("Add more details"))

  it("keeps Room off the main column", () => {
    expect(beforeDetails).not.toContain('id="identify-room"')
    expect(identify2).toContain('id="identify-room"')
  })

  it("keeps the Category picker off the main column", () => {
    expect(beforeDetails).not.toContain("<CategoryPicker")
    expect(identify2).toContain("<CategoryPicker")
  })

  it("still prefills the room from the item type once it is in there", () => {
    expect(identify2).toContain("suggestForSubType={data.subType}")
  })

  it("does not print two help lines under the room", () => {
    // Her screenshot had the prefill hint AND the old static line stacked.
    expect(identify2).not.toContain("Pick where this item lives in your home.")
  })
})
