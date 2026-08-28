/**
 * A screen may not claim rows are already saved while offering the button that
 * saves them.
 *
 * HH-134, reported three times (HH-121 → HH-127 → HH-134). The sheet said
 * "Nothing here needs a reminder … They're saved to this item" above a primary
 * button reading "Save all 11". The owner called it "the old design"; what she
 * was actually seeing was a screen arguing with itself.
 *
 * WHY THE ROUND-14 AUDIT DID NOT CATCH IT, and why this file exists:
 *
 *  - `retiredDesigns.test.ts` asks "can anything render a DELETED screen?".
 *    TaskReviewSheet is the current component, so it is out of that audit's
 *    scope by construction. No amount of source-grepping for retired names
 *    finds a live screen whose copy contradicts its own button.
 *  - The journey walk DOES render this exact state (J3 `review-consolidated`),
 *    and I reviewed that screenshot and passed it — because the step note I had
 *    written described the state as correct. Reviewing against your own summary
 *    is self-confirming; that is rule 2, and it cost three rounds.
 *  - And nothing turned the approved mockup's checklist into an assertion.
 *
 * So this is the assertion. It is a BEHAVIOURAL check on rendered output, not a
 * grep: render the sheet in both states and read what it actually says.
 *
 * The direction of the fix matters and is easy to get backwards — the mockup
 * for HH-127 got it backwards. `runParse` is explicit that "Preview NEVER
 * commits — it writes previewDraft only", and `commitDraft` is what writes
 * chunks, templates and instances. So for a fresh parse the Save button is the
 * only thing that persists anything: removing it, as the mockup proposed, would
 * have silently lost the user the entire scan. The lie was the copy, not the
 * button.
 */
import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { TaskReviewSheet } from "./TaskReviewSheet"
import type { PreviewResult, PreviewTask } from "@/modules/knowledge/types/previewTypes"

const task = (
  title: string,
  care_type: PreviewTask["care_type"],
  schedule_type: PreviewTask["schedule_type"],
): PreviewTask => ({
  title, description: null, care_type, priority_tier: "recommended", risk_level: "performance",
  estimated_minutes: 10, schedule_type, interval_days: null,
  instructions_text: null, symptom_tags: [], re_check_triggers: [],
})

/** Her actual case: cleaning advice plus a couple of install checks, no upkeep. */
const NOTHING_TO_SCHEDULE: PreviewResult = {
  ok: true,
  chunks: [],
  tasks: [
    task("Verify proper grounding", "maintenance", "setup"),
    task("Clean the waveguide cover", "cleaning", "monthly"),
    task("Wipe vent area after use", "cleaning", "after_each_use"),
  ],
}

function renderSheet(props: { alreadySaved?: boolean } = {}) {
  render(
    <TaskReviewSheet
      open
      onOpenChange={vi.fn()}
      itemName="Sharp SMD2470ASY24"
      previewData={NOTHING_TO_SCHEDULE}
      onSave={vi.fn().mockResolvedValue(null)}
      saving={false}
      {...props}
    />,
  )
}

/** Everything the footer button could say, so the assertions name one. */
const primary = () =>
  screen.getByRole("button", { name: /Save all|Save it|Save changes|Done|Next:/ }).textContent ?? ""

describe("a fresh parse — nothing is written until Save", () => {
  it("does not claim the rows are already on the item", () => {
    renderSheet()
    // The exact sentence the owner was shown. It described eleven things that
    // did not exist yet.
    expect(screen.queryByText(/They're saved to this item/)).toBeNull()
    expect(screen.queryByText(/It's saved to this item/)).toBeNull()
  })

  it("still offers the Save that is the only thing writing them", () => {
    renderSheet()
    // The half of this the mockup got wrong. A read-only sheet here loses the
    // whole scan.
    expect(primary()).toMatch(/Save/)
  })

  it("says what saving will do instead", () => {
    renderSheet()
    // Round 18 moved this sentence into the summary and made it blunter. The
    // rule is unchanged: before Save has run, the screen states that nothing is
    // saved rather than implying it already is.
    expect(screen.getByText(/Nothing is saved until you press Save/)).toBeTruthy()
  })
})

describe("rows already on the item — Save has nothing left to do", () => {
  it("says Done, not Save all N", () => {
    renderSheet({ alreadySaved: true })
    // The contradiction, gone: this is the state the owner reached from the
    // item page's review button, where the tasks are genuinely live.
    expect(primary()).toBe("Done")
    expect(primary()).not.toMatch(/Save all/)
  })

  it("and only here does it stop warning that nothing is saved yet", () => {
    renderSheet({ alreadySaved: true })
    // These rows ARE live, so the not-yet-saved warning would be false here.
    expect(screen.queryByText(/Nothing is saved until you press Save/)).toBeNull()
    expect(screen.getByText(/Tap any one to change how it/)).toBeTruthy()
  })
})

describe("the contradiction itself, stated once", () => {
  // One assertion covering the whole rule, so a future state that is neither of
  // the two above still cannot reintroduce it.
  it.each([false, true])("alreadySaved=%s never pairs saved-copy with a Save button", (alreadySaved) => {
    renderSheet({ alreadySaved })
    const claimsAlreadySaved = screen.queryByText(/(They're|It's) saved to this item/) !== null
    const offersToSaveThem = /^Save/.test(primary())
    expect(
      claimsAlreadySaved && offersToSaveThem,
      `the screen claims these rows are saved AND offers "${primary()}" to save them`,
    ).toBe(false)
  })
})
