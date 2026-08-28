import { describe, it, expect } from "vitest"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { resolve, join } from "node:path"

/**
 * Retired designs stay retired.
 *
 * Round 14 (owner): "because I continue to find ways to access old designs, I
 * want you to audit the code to make sure that retired designs are truly
 * retired. It feels like there are a lot of alternative ways into this add item
 * flow, and that's where all designs keep popping up."
 *
 * She was right, and the audit found four live doors into pre-redesign screens.
 * The one that mattered was not exotic: "I'll add it later" on the manual step
 * set the wizard to a `plan` step and rendered `PlanStep`, the task planner the
 * round 11–13 rebuild replaced. Declining to add a manual right now is an
 * ordinary choice, so an ordinary choice was the main way to meet an old design.
 *
 * The point of this file is that the audit stops being something a person does
 * by hand and starts being something CI does on every push. A design is retired
 * when nothing can render it — not when we have stopped linking to it.
 *
 * ADDING A RETIREMENT: put the component name in RETIRED_COMPONENTS and delete
 * the file. If something still references it, this test names the file.
 */

const SRC = resolve(__dirname, "..")

/** Components the redesign replaced. None may exist or be referenced. */
const RETIRED_COMPONENTS = [
  "PlanStep",       // task planner -> TaskReviewSheet
  "Stepper",        // numbered wizard chrome -> removed entirely (round 11)
  "PurchaseStep",   // purchase toll booth -> Details & records on the item page
  "ConfirmStep",    // -> IdentifyStep
  "ParseReviewStep",// -> TaskReviewSheet
  // Round 18: the product lookup left the add screen. The cards that reported
  // it mid-flow are gone whole — suggestions render inline on the item page's
  // own field rows (SuggestionKV in RefinedItemDetail), never as a card.
  "IdentityCard",        // "We found this item" -> silent category + item-page rows
  "ProductSuggestionCard", // spec chips -> SuggestionKV rows behind per-field Add
]

/** Pages that were whole retired flows. None may exist or be routed. */
const RETIRED_PAGES = ["InventoryItemSetup"]

/** Wizard steps that no longer have a screen. */
const RETIRED_STEPS = ["plan", "purchase"]

function walk(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else if (/\.tsx?$/.test(name)) out.push(p)
  }
  return out
}

const files = walk(SRC).filter((f) => !f.includes(".test."))
/** Comments are stripped before matching: the notes explaining WHY a design was
 *  retired are the most useful thing in these files, and a guard that punished
 *  them would quietly teach us to delete the explanation. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
}
const sources = files.map((f) => ({
  path: f.replace(SRC, "src"),
  text: stripComments(readFileSync(f, "utf8")),
}))

describe("retired designs cannot be rendered", () => {
  for (const name of [...RETIRED_COMPONENTS, ...RETIRED_PAGES]) {
    it(`nothing imports or renders ${name}`, () => {
      // Matched on an import or a JSX tag rather than the bare word, so a
      // comment explaining WHY something was retired does not fail the test —
      // those comments are the most useful thing in the file.
      const offenders = sources
        .filter((s) =>
          new RegExp(`import\\s[^\\n]*\\b${name}\\b[^\\n]*from`).test(s.text) ||
          new RegExp(`<${name}[\\s/>]`).test(s.text),
        )
        .map((s) => s.path)
      expect(offenders, `${name} is retired but still reachable from: ${offenders.join(", ")}`).toEqual([])
    })
  }
})

describe("the add-item flow has one way in and no way into an old screen", () => {
  const app = sources.find((s) => s.path.endsWith("src/App.tsx"))!

  it("routes no retired page", () => {
    for (const page of RETIRED_PAGES) {
      expect(app.text, `App.tsx still routes ${page}`).not.toMatch(new RegExp(`<${page}\\b`))
    }
  })

  it("has no /setup route — that was a second, retired wizard", () => {
    expect(app.text).not.toMatch(/path=":id\/setup"/)
  })

  it("only SmartAddItem creates items, so there is one add flow to keep honest", () => {
    const creators = sources
      .filter((s) => /\bcreateItemUnit\s*\(/.test(s.text))
      .map((s) => s.path)
      .filter((p) => !p.includes("/services/") && !p.includes("/hooks/") && !p.includes("/modules/"))
    expect(creators).toEqual(["src/pages/SmartAddItem.tsx"])
  })
})

describe("a saved wizard session cannot resume into a deleted screen", () => {
  const wizard = sources.find((s) => s.path.endsWith("src/lib/wizardSession.ts"))!

  it("does not offer a retired step in its type", () => {
    const type = wizard.text.slice(
      wizard.text.indexOf("export type WizardStep"),
      wizard.text.indexOf("const RETIRED_STEPS"),
    )
    for (const step of RETIRED_STEPS) {
      expect(type, `WizardStep still offers "${step}"`).not.toContain(`"${step}"`)
    }
  })

  it("normalises a stored retired step forward instead of trusting it", () => {
    // The failure this prevents is invisible in a fresh install: the session
    // lives in localStorage, so only someone who used the app BEFORE the
    // rebuild hits it — which is exactly the beta testers.
    expect(wizard.text).toMatch(/RETIRED_STEPS\.has\([^)]*\)\s*\?\s*"manual"/)
  })
})

describe("the manual step is one component, not two that drift", () => {
  it("both doors render ManualStep", () => {
    const doors = sources
      .filter((s) => /<ManualStep[\s/>]/.test(s.text))
      .map((s) => s.path)
      .sort()
    // HH-126: the item page had its own dialog, still carrying the link-first
    // ranking that HH-109 and HH-115 retired in the wizard. Fixing the ranking
    // in one place has to fix it in both.
    expect(doors).toEqual([
      "src/pages/SmartAddItem.tsx",
      "src/pages/item-detail/ManualSection.tsx",
    ])
  })

  it("no door builds its own source picker", () => {
    // The old dialog's tell: a Link/Upload toggle of its own.
    const offenders = sources
      .filter((s) => !s.path.endsWith("ManualStep.tsx"))
      .filter((s) => /Add manual or reference|Document type/.test(s.text))
      .map((s) => s.path)
    expect(offenders).toEqual([])
  })
})
