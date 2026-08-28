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
 *  copy still being there.
 *
 *  The opener must be preceded by whitespace or `{`, and that guard is
 *  load-bearing rather than tidy. `accept="image/*"` contains the two
 *  characters that open a block comment, so the naive pattern treated the rest
 *  of that attribute as a comment and deleted everything up to the next real
 *  `*​/` — fifty lines of IdentifyStep, including the model field and its hint.
 *  Nothing failed. `toContain` on that range failed for a reason that looked
 *  like missing copy, and every `not.toContain` over it passed vacuously, which
 *  is the worse half: a test asserting we no longer say something, agreeing,
 *  because it could not see the file. */
const read = (p: string) =>
  readFileSync(resolve(__dirname, p), "utf8")
    .replace(/(^|[\s{])\/\*[\s\S]*?\*\//g, "$1")
    .replace(/^\s*\/\/.*$/gm, "")
const identify = read("./IdentifyStep.tsx")
const page = read("../../pages/SmartAddItem.tsx")
const detailsSheet = read("../item-care/ItemDetailsSheet.tsx")

/**
 * Round 18 — the lookup left the add screen (owner, 2026-08-27: "it's a
 * distraction… this search that doesn't necessarily result in anything
 * useful"). The screen you type on may not change under you: no debounced
 * lookup, no identity card, no spec chips. What the lookup finds now lands on
 * the item page, after creation, via runPostCreateLookup.
 */
/**
 * The lane chooser says what each lane can do, on the lane.
 *
 * "Photo of a label? You can snap it inside the appliance form." used to sit
 * centred beneath both cards — a caption describing a control on the NEXT
 * screen, in our noun ("the appliance form"), true of only one of the two
 * options it sat under. It was written when round 11 demoted the camera off
 * this screen; round 13 promoted scanning back to a first-class control under
 * the model field, which retired the reassurance without removing it.
 */
/**
 * What the scan says it did.
 *
 * The old line — "Filled N fields from your photo — tap Add more details to
 * review." — counted fields the appliance lane never shows (so a scan that
 * visibly changed two things reported four) and then sent the reader to a
 * disclosure that exists ONLY in the simple lane, while the camera exists only
 * in the appliance one. Same defect as the lane-chooser caption above: a
 * pointer to a control the reader does not have.
 */
describe("what the scan reports", () => {
  it("names what changed instead of counting fields", () => {
    expect(identify).toContain("Got the ${list} from your photo.")
  })

  it("no longer sends the appliance lane to a simple-lane disclosure", () => {
    expect(identify).not.toContain("tap Add more details to review")
  })

  it("keeps 'Add more details' itself scoped to the simple lane", () => {
    // If this ever renders in the appliance lane the old copy becomes true
    // again, and the reason for this change disappears.
    const disclosure = identify.indexOf("Add more details")
    const laneGuard = identify.lastIndexOf('mode === "simple"', disclosure)
    expect(laneGuard).toBeGreaterThan(-1)
  })
})

describe("the lane chooser", () => {
  it("puts the camera hint on the lane that has a camera", () => {
    expect(identify).toContain("Type it, or scan the label.")
  })

  it("no longer captions both lanes with a note about one of them", () => {
    expect(identify).not.toContain("snap it inside the appliance form")
  })
})

describe("the add screen no longer searches while you type", () => {
  it("IdentifyStep does not call the lookup at all", () => {
    expect(identify).not.toContain("lookupProduct")
  })
  it("and renders neither of the old cards", () => {
    expect(identify).not.toContain("We found this item")
    expect(identify).not.toContain("IdentityCard")
    expect(identify).not.toContain("ProductSuggestionCard")
  })
  it("the wizard fires the lookup once, after the item exists", () => {
    expect(page).toContain("runPostCreateLookup(created)")
  })
})

describe("the comment stripper reads the whole file", () => {
  it("does not mistake accept=\"image/*\" for a block comment", () => {
    // The file-input accept attribute sits ~40 lines above the model field. If
    // the stripper regresses, this assertion goes red and every copy assertion
    // over that window quietly stops meaning anything.
    expect(identify).toContain('accept="image/*"')
    expect(identify).toContain("Usually on a label inside the door or around the back")
  })
})

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

describe("purchase details belong to the item page, not the wizard", () => {
  it("step 1 no longer collects purchase date or price", () => {
    expect(identify).not.toContain('id="identify-purchase-date"')
    expect(identify).not.toContain('id="identify-purchase-price"')
  })

  it("step 1 keeps serial — identity, not a receipt", () => {
    expect(identify).toContain('id="identify-serial"')
  })

  it("the wizard has no purchase step to walk to", () => {
    expect(page).not.toContain("PurchaseStep")
  })

  it("what a scan already read is saved with the item, so nothing is lost", () => {
    // The old Purchase step took these as prefill. With that step gone, the
    // create call is the only thing standing between a scanned receipt and the
    // item record.
    expect(page).toContain("purchase_date: identifyData.purchaseDate")
    expect(page).toContain("price_paid: identifyData.purchasePrice")
  })

  it("the item page can collect the same fields later", () => {
    for (const field of ["purchase_date", "price_paid", "store_name", "serial_number"]) {
      expect(detailsSheet).toContain(field)
    }
  })

  it("does not advertise a field that moved to another step", () => {
    // The teaser listed "Purchase date → warranty tracking" above a section
    // that no longer contains it.
    const teaser = identify.slice(identify.indexOf("Add more details"))
    expect(teaser.slice(0, 900)).not.toContain("Purchase date")
  })
})

describe("finding the model another way", () => {
  it("keeps the RARER routes behind one disclosure, not floating loose", () => {
    // Round 13 promoted ONE route (scanning the label) out of this disclosure —
    // see the type-or-scan block below. What stays behind it is the photo
    // library and the no-model-number escape, and it is no longer named for
    // having failed.
    expect(identify).toContain("If you can&apos;t scan the label")
    expect(identify).not.toContain("Can&apos;t find the model?")
    expect(identify).not.toContain("Snap label instead")
    expect(identify).toContain("Choose a photo")
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
    expect(identify).toContain('"Add the manual"')
    expect(identify).not.toContain('"Find the manual"')
  })

  it("gives the button and the screen it opens the SAME words", () => {
    // Round 11: was "Next: add the manual" over a page titled "Add item", so
    // the action changed its name mid-flow. An action keeps one name from the
    // control that starts it to the screen that finishes it.
    expect(identify).toContain('"Add the manual"')
    expect(page).toContain('step === "manual" ? "Add the manual"')
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
 * Round 11 — the FIRST screen, against the design that was signed off.
 *
 * These exist because of the exact failure they now prevent: the hybrid was
 * approved with screen 01 annotated "two fields, nothing else — no room picker,
 * no category grid, no serial number, no 'Add more details' disclosure, because
 * there is nothing behind it to open", the PR claimed it was built to spec, and
 * what shipped still had the disclosure, a stepper and a Back button. Two
 * strings had changed. Nothing asserted the screen, so nothing caught it.
 *
 * Each of these is a line the owner would have to re-report otherwise.
 */
describe("the appliance lane's first screen is two fields and nothing else", () => {
  const applianceBranch = () => {
    // Everything the appliance lane renders, minus the simple lane's own JSX.
    const i = read("./IdentifyStep.tsx")
    return i
  }

  it("does not offer an 'Add more details' disclosure to the appliance lane", () => {
    // The disclosure survives for the SIMPLE lane, which keeps brand and model
    // in it, so this asserts the GATE rather than the absence of the markup.
    const i = applianceBranch()
    expect(i).toContain('{mode === "simple" && (moreDetailsOpen ? (')
  })

  it("mounts nothing behind the disclosure outside the simple lane", () => {
    // NOT MOUNTED, not merely inert: an inert subtree that can never be
    // revealed still puts Serial number, Room and a category grid in the page.
    const i = applianceBranch()
    expect(i).toContain('{mode === "simple" && <div')
    expect(i).toContain('id="identify-more-details"')
  })

  it("no longer asks for a name before the manual has been read", () => {
    // The name is composed from the item TYPE and is editable in Details &
    // records — which is the first rename this app has ever had.
    const i = applianceBranch()
    // The SIMPLE lane keeps its Name on the main column — it is that lane's
    // only required field. What is gone is the appliance lane's copy of it,
    // which sat behind the disclosure and asked for a name before we knew
    // enough to suggest a good one.
    expect(i).not.toContain('placeholder="Defaults to the brand and model"')
    expect(i).not.toContain("we name it from the brand and model")
    expect(read("../item-care/ItemDetailsSheet.tsx")).toContain('id="details-name"')
  })

  it("has no stepper anywhere in the add flow", () => {
    // Owner: "the 1 - 2 breadcrumb at the top is not helpful and I don't think
    // even accurate." It promised two steps for a five-beat arc, and the simple
    // lane never has a second step at all.
    expect(page).not.toContain("<Stepper")
    expect(page).not.toContain("stepperMode")
  })

  it("uses the approved subtitle, which names BOTH routes", () => {
    // HH-123: the option has to be known before the fields are looked at.
    expect(page).toContain("Type the brand and model — or scan the label and we'll read it.")
    expect(page).not.toContain("Brand and model — then we'll add the manual.")
  })
})

/**
 * HH-123 — typing and scanning are two ways to say the same thing.
 *
 * The camera used to sit behind a disclosure called "Can't find the model?",
 * which frames it as what you do AFTER FAILING — so someone perfectly happy to
 * point a phone at a nameplate never considered it, having failed at nothing.
 */
describe("two ways to give us the brand and model", () => {
  it("shows the scan without opening anything", () => {
    expect(identify).toContain("Scan the label")
    // Promoted OUT of the disclosure: it must not be inside the otherWaysOpen
    // branch any more.
    const disclosure = identify.slice(identify.indexOf("If you can&apos;t scan the label"))
    expect(disclosure).not.toContain("Scan the label")
  })

  it("puts an explicit 'or' between the fields and the camera", () => {
    // Spacing alone does not say "these are alternatives". A rule with the word
    // in it does.
    expect(identify).toContain('<span className="text-xs font-semibold text-muted-foreground">or</span>')
  })

  it("says the scan FILLS the fields rather than skipping them", () => {
    // This is the sentence that makes the two routes obviously the same
    // information, and the reason the CTA can stay gated on the fields.
    // It says "the brand and model", naming the two fields the user can see,
    // rather than "both fields", which describes our form to someone looking
    // at their appliance.
    expect(identify).toContain("We&apos;ll do the typing")
  })

  /**
   * Plain-language pass, 2026-08-27. The owner read the flow as tech speak and
   * caught a claim in it that was not true.
   *
   * "Nameplate" is what an installer calls it. And the scan never needed the
   * whole sticker in shot — it needs the model number legible — so telling
   * someone to frame the entire label makes them step BACK, which is the one
   * thing that reliably breaks the read.
   */
  it("asks for the model number, not the whole label", () => {
    expect(identify).toContain("Find the model number")
    expect(identify).not.toContain("whole sticker")
  })

  it("says label, the word a homeowner uses, not nameplate", () => {
    const copyOnly = identify.replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    expect(copyOnly).not.toContain("nameplate")
    expect(copyOnly).toContain("Usually on a label inside the door or around the back")
  })

  it("still gates the button on the fields, not on having taken a photo", () => {
    expect(identify).toContain("data.brand.trim().length >= 2 && data.model.trim().length >= 1")
  })
})

/**
 * HH-113 — the resume gate says what it is holding.
 */
describe("picking up an unfinished item", () => {
  it("never says 'an incomplete setup' again", () => {
    expect(page).not.toContain("You have an incomplete setup")
  })

  it("names the item and what is missing", () => {
    expect(page).toContain("resumeSummary")
    expect(page).toContain("{summary.title}")
    expect(page).toContain("{summary.missing}")
  })

  it("says what Start-fresh actually discards, because it discards nothing", () => {
    // The item is created BEFORE the session is written, so it survives; the
    // button was the scary one only because the screen would not say so.
    expect(page).toContain("leaves this item where it is")
  })

  it("drops the pre-round-11 title that made this screen look like the old app", () => {
    expect(page).not.toContain('title="Smart Add Item"')
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

/**
 * HH-81 — there must be exactly ONE add-item screen.
 *
 * There were two. `/inventory/add` was fixed in #139 to ask brand + model
 * first; `/onboarding/inventory` rendered its own `AddItemForm`, still asking
 * Category → Room → Name with brand and model labelled optional, and created a
 * bare item that was never offered a manual — so nothing added during onboarding
 * could ever produce a task. It was also the first screen every new account saw.
 */
describe("one add screen, not two", () => {
  const app = read("../../App.tsx")

  it("routes onboarding into the real add flow", () => {
    expect(app).toContain('path="/onboarding/inventory"')
    expect(app).toContain('<Navigate to="/inventory/add" replace />')
  })

  it("no longer ships a second add-item form", () => {
    // If this fails, someone has reintroduced the duplicate rather than
    // extending the real flow.
    expect(() => read("../../modules/inventory/components/AddItemForm.tsx")).toThrow()
    expect(() => read("../../pages/OnboardingInventory.tsx")).toThrow()
  })

  it("stops exporting it from the inventory module", () => {
    expect(read("../../modules/inventory/index.ts")).not.toContain("AddItemForm")
  })
})

/**
 * The wizard's job ends when the manual is attached. Everything after — the
 * reading wait, the review, purchase details — is the item page's.
 */
describe("the wizard ends at the manual", () => {
  it("starts the parse and leaves instead of waiting on it", () => {
    expect(page).toContain("startParseAndLeave")
    // Awaiting the parse here is what parked the user on a Reading screen for
    // two minutes.
    expect(page).not.toContain("previewManualParse")
    expect(page).not.toContain("ParseProgressStep")
  })

  it("hands the running parse to the item page's pickup card", () => {
    expect(page).toContain("markParsePending")
    expect(page).toContain("navigate(`/items/${itemId}`)")
  })

  it("does not review a draft it can no longer see", () => {
    expect(page).not.toContain("TaskReviewSheet")
    expect(page).not.toContain("commitReviewedDraft")
  })

  it("promises only the steps it delivers", () => {
    // Round 14: this used to read Stepper.tsx's FULL_STEPS. The stepper is
    // deleted — it was the last thing rendering the retired /inventory/:id/setup
    // wizard — so the promise now lives in the WizardStep union itself, which is
    // the thing that can actually route someone into a screen.
    const wizard = read("../../lib/wizardSession.ts")
    const union = wizard.slice(wizard.indexOf("export type WizardStep"), wizard.indexOf("RETIRED_STEPS"))
    expect(union).toContain('"identify"')
    expect(union).toContain('"manual"')
    for (const retired of ['"plan"', '"purchase"']) {
      expect(union).not.toContain(retired)
    }
  })

  it("sends a session saved on the retired purchase step to the item", () => {
    expect(page).toContain('(session.step as string) === "purchase"')
  })
})
