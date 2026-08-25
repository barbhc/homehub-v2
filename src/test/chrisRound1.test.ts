/**
 * Chris's first session (TestFlight, iPhone 17, 2026-08-20). Three reports,
 * three different failures — all pinned here.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { isAgendaEligible } from "../../shared/tasks/agendaEligibility"

const read = (p: string) =>
  readFileSync(resolve(__dirname, p), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")

describe("empty Tasks must not contradict the item page", () => {
  it("confirms the exclusion that produced the contradiction", () => {
    // Chris's whole home: one air fryer, three scheduled tasks, all of them
    // item-scoped cleaning — so the agenda is legitimately empty.
    const his = [
      { title: "Wipe Main Unit and Control Panel", careType: "cleaning", scopeType: "item_unit" },
      { title: "Clean Baskets and Crisper Plates", careType: "cleaning", scopeType: "item_unit" },
      { title: "Inspect and Clear Air Vents", careType: "cleaning", scopeType: "item_unit" },
    ]
    expect(his.filter(isAgendaEligible)).toEqual([])
  })

  it("home-scoped cleaning and item maintenance still reach the agenda", () => {
    expect(isAgendaEligible({ careType: "cleaning", scopeType: "home" })).toBe(true)
    expect(isAgendaEligible({ careType: "maintenance", scopeType: "item_unit" })).toBe(true)
  })

  it("the empty state explains where the work went", () => {
    const src = read("../components/home/RefinedWeek.tsx")
    expect(src).toContain("hiddenCleaning")
    expect(src).toContain("live in your guides")
    // Only counted when the agenda is actually empty — no cost on the common path.
    expect(src).toContain("countHiddenCleaning")
  })
})

describe("screens outside AppLayout clear the Dynamic Island", () => {
  // AppLayout supplies pt-safe-top; these render outside it, so Chris's
  // "Add your first items" heading sat under the island on an iPhone 17.
  // OnboardingInventory was the third; it is gone (HH-81) — /onboarding/inventory
  // now redirects into the real add flow, which lives INSIDE AppLayout and gets
  // the inset from there.
  for (const page of ["OnboardingProfile", "SampleHome"]) {
    it(`${page} carries the top inset`, () => {
      expect(read(`../pages/${page}.tsx`)).toContain("pt-safe-top")
    })
  }
})

describe("What's New only speaks to people who were there", () => {
  it("skips an entry that predates the account", () => {
    const src = read("../components/dashboard/WhatsNewBanner.tsx")
    expect(src).toContain("accountPredatesEntry")
    expect(src).toContain("creationTime")
  })
})

describe("HH-83 — the walkthrough offers no finish button", () => {
  // "Next: schedule 3 tasks" sat under card 1 of 11 and read as the
  // walkthrough's next step — but it jumped to scheduling with ten tasks
  // unvisited at their defaults. While a guide card is open, the footer may
  // only report progress; the ✕ Exit is the way out, and it saves nothing.
  it("renders progress, not a save path, while a guide card is open", () => {
    const src = read("../components/manuals/TaskReviewSheet.tsx")
    expect(src).toContain("nothing is saved until the end")
    expect(src).toMatch(/guideRow \? \(/)
  })
})

describe("HH-86 follow-up — the review title must not double the brand", () => {
  it("prepends brand only when the name does not already carry it", () => {
    const src = read("../pages/ItemDetailPage.tsx")
    expect(src).toContain("includes(item.brand.toLowerCase())")
    expect(src).not.toContain('`${item.brand ?? ""} ${item.display_name ?? ""}`')
  })
})

describe("HH-89 — the manual entry looks like what it does", () => {
  const src = read("../pages/item-detail/ManualSection.tsx")

  it("an empty section offers all three lanes at their real weight", () => {
    expect(src).toContain("Upload the manual")
    expect(src).toContain("Paste a link instead")
    expect(src).toContain("Find it for me")
    // The beta search stays labelled — the owner's standing call.
    expect(src).toMatch(/Find it for me[\s\S]{0,200}Beta/)
  })

  it("each lane presets the mode it names", () => {
    expect(src).toContain('handleOpenAddManual("upload")')
    expect(src).toContain('handleOpenAddManual("url")')
    // "Re-upload PDF" must not open the Link tab.
    expect(src).toMatch(/Re-upload PDF/)
  })

  it("the grey square became a labelled tag", () => {
    expect(src).toMatch(/"REF" : m\.source_type === "upload" \? "PDF" : "LINK"/)
  })

  it("Find it for me starts the search on open, once", () => {
    // HH-126 moved this door onto the wizard's own ManualStep, so the
    // mechanism changed shape: instead of an autoStart flag on a bespoke
    // search card, the shortcut opens ManualStep with its search panel already
    // expanded. The PROMISE is unchanged and still asserted — tapping
    // "Find it for me" must not make you ask for the search a second time.
    expect(src).toContain('initialPanel={findRequested ? "search" : undefined}')
    expect(src).toContain("if (!open) setFindRequested(false)")
  })
})

describe("HH-87 — a manual mid-parse is neither 'has one' nor 'has none'", () => {
  it("the empty state waits instead of offering to add what was just added", () => {
    const src = read("../components/item-care/CareBlock.tsx")
    // Mid-parse now RESERVES the space its tasks will fill (skeleton rows)
    // instead of a line of copy, so Upkeep never reads as empty while a manual
    // is being read. The gate this test was written for is unchanged: the
    // add-the-manual CTA still cannot appear while one is in flight.
    expect(src).toContain("nothing && !critical && parsingManual")
    expect(src).toContain("Reading the manual — upkeep lands here.")
    expect(src).toContain("!hasManual && !parsingManual && onAddManual")
  })

  it("the live banner is data-gated, not wizard-flag-gated", () => {
    // Closing the add dialog used to orphan the running parse: the flag was
    // never set on the item-page path, so nothing on the page said "working".
    const src = read("../components/manuals/ParsePickupCard.tsx")
    expect(src).toContain("ACTIVE_STAGES.includes(s.stage)),")
    expect(src).not.toContain("ACTIVE_STAGES.includes(s.stage) && isParsePending(id)")
  })

  it("one authoritative list of active stages", () => {
    const svc = read("../modules/knowledge/services/parseManualService.ts")
    expect(svc).toContain("export const ACTIVE_PARSE_STAGES")
    // The tray and both item-detail variants must consume it, not re-declare it.
    for (const f of ["../hooks/useParseTray.ts", "../components/home/DesktopItemDetail.tsx", "../pages/ItemDetailPage.tsx"]) {
      expect(read(f), f).toContain("ACTIVE_PARSE_STAGES")
    }
  })

  it("the tray drains itself — review, don't dismiss", () => {
    const hook = read("../hooks/useParseTray.ts")
    expect(hook).toContain('previewDraft") != null')
    const pill = read("../components/manuals/ParseTrayPill.tsx")
    expect(pill).toContain("if (total === 0) return null")
  })
})

describe("round 9 redesign — the picks, pinned", () => {
  it("HH-85: setup never outranks When-needed in the review order", () => {
    const src = read("../../shared/tasks/reviewBuckets.ts")
    const order = src.indexOf('"whenNeeded", "setup"')
    expect(order).toBeGreaterThan(-1)
  })

  it("HH-85: the review's setup section starts tucked away", () => {
    const src = read("../components/manuals/TaskReviewSheet.tsx")
    expect(src).toContain("useState(false)\n")
    expect(src).toContain("Already set up? Hide them")
    expect(src).toContain("they&rsquo;ll be on the item page if you ever need them")
  })

  it("HH-84: the walkthrough's schedule block is a labelled peer section", () => {
    const src = read("../components/manuals/TaskReviewSheet.tsx")
    expect(src).toContain("On a schedule?</div>")
    // The old buried strip: 11.5px muted text with the toggle inside it.
    expect(src).not.toContain('text-[11.5px] text-muted-foreground">\n              <span>\n                {onSched')
  })

  it("HH-91: Ask sits below Upkeep and states its precondition", () => {
    const src = read("../components/home/RefinedItemDetail.tsx")
    expect(src).toContain("Works best once the manual is added.")
    // Ask renders AFTER CareBlock now.
    expect(src.indexOf("<CareBlock")).toBeLessThan(src.indexOf("Have a question or a problem?"))
  })

  it("HH-91: desktop states the same precondition on its Ask button", () => {
    // Desktop's Ask is already secondary (a header button beside Edit), so the
    // mobile fix — demote it below Upkeep — has nothing to move. The half that
    // DOES translate is the honesty: pre-manual it must not look as capable as
    // it is afterwards. Same sentence as mobile, so the two screens agree.
    const src = read("../components/home/DesktopItemDetail.tsx")
    expect(src).toContain("Works best once the manual is added.")
    // Muted, not disabled — general questions are still fair game.
    expect(src).not.toMatch(/onClick=\{goAsk\}[\s\S]{0,200}disabled/)
  })

  it("HH-91: the empty item page leads with the manual, in Home's voice", () => {
    const src = read("../components/item-care/CareBlock.tsx")
    expect(src).toContain("No upkeep yet — add the manual")
  })
})

describe("round 10 — the overnight fallout, pinned", () => {
  const sheet = read("../components/manuals/TaskReviewSheet.tsx")
  const care = read("../components/item-care/CareBlock.tsx")

  it("HH-101: the collapsed setup section offers SHOW, not hide", () => {
    expect(sheet).toContain('`Show ${items.length} setup step')
    expect(sheet).toMatch(/setupOpen \? "Already set up\? Hide them"/)
  })

  it("HH-100: the custom-cadence door is the LAST chip", () => {
    // NB: the first "]" after the anchor is the TYPE's ("{...}[]"), which ends
    // the slice before the array even starts — search for the newline-] that
    // closes the literal instead.
    const start = sheet.indexOf("const CADENCES")
    const list = sheet.slice(start, sheet.indexOf("\n]", start))
    expect(list.lastIndexOf("every_n_days")).toBeGreaterThan(list.lastIndexOf("as_needed"))
  })

  it("HH-98: the save button carries both numbers when they differ", () => {
    expect(sheet).toContain("on a schedule")
  })

  it("HH-97: no leading chip; the marker is meta text naming Deep Clean", () => {
    expect(care).not.toContain("In guides")
    expect(care).toContain('onAgenda ? "" : "Deep Clean"')
  })

  it("HH-94: a non-empty Tasks list still accounts for withheld cleaning", () => {
    const week = read("../components/home/RefinedWeek.tsx")
    expect(week).toContain("groups.length > 0 && hiddenCleaning > 0")
    expect(week).toContain('Link to="/clean"')
  })

  it("HH-99: the last-done control speaks the sheet's chip language", () => {
    expect(sheet).toContain("I&rsquo;ve been doing this already")
    // The bare checkbox is gone; it presses like the cadence chips.
    expect(sheet).not.toContain('type="checkbox"\n          checked={open}')
  })
})
