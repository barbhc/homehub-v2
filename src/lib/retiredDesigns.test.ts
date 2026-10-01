import { describe, it, expect } from "vitest"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { basename, resolve, join } from "node:path"

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
  // The item page asked for purchase details twice, in two shapes, and both
  // opened the same sheet. The owner kept the one that matches the page.
  "PurchaseNudge",       // -> WarrantyPanel, retitled "Warranty and purchase information"
  // Dead-code sweep (audit 2026-09-29): unrendered pieces of retired designs,
  // deleted rather than left to be edited as if they were live.
  "ParseProgressStep",   // wizard "Reading your manual" screen -> the item page's scan rail (#161)
  "UrgentTasksCard",     // retired dashboard -> Home, focused (one list)
  "UpcomingTasksCard",   // retired dashboard -> Home, focused
  "QuickActionsRow",     // retired dashboard -> RefinedHome's Ask module
  "QuickActionCard",     // retired dashboard
  "DashboardCalendar",   // Home's hidden month calendar -> none; Tasks is the schedule
  "StatRow",             // Home's stat band -> removed from Home (design/home-focus.md)
  "MaintenanceTaskRow",  // the /tasks list's row -> RefinedWeek / DesktopTasks rows
  "HowToAccordion",      // -> the item page's Guides
  "TroubleshootingAccordion", // -> the item page's Fix it, and Ask
  // HH-161: one reading indicator. The manual row's countdown bar ("~28 sec
  // remaining") was an ESTIMATE beside a read whose position the worker never
  // reports; the read is shown by the pill and the Upkeep card, honestly.
  "ManualParseProgress", // -> ScanningLine in CareBlock + ParseTrayPill
  // #229's follow-up (2026-09-30): the pre-redesign item page's task area and
  // sidebar, exported by item-detail/index.ts and rendered by nothing. Their
  // jobs live in CareBlock (Upkeep), the task page and NotesSection now. The
  // two popovers had no importer but TaskSection/TierTaskCard.
  "TaskSection",            // tabs + tier filter + session mode -> CareBlock (Upkeep)
  "TierTaskCard",           // glass task card with red/amber rails -> CareBlock rows
  "SetupChecklistSection",  // -> CareBlock's "First-time setup" band (useSetupCompletion)
  "HabitsSection",          // as-needed / after-each-use -> CareBlock's "When needed" band
  "NotesCard",              // item notes textarea -> NotesSection
  "SidebarActions",         // desktop scroll-to sidebar -> DesktopItemDetail's own header
  "CompleteTaskPopover",    // -> the task page's check-off (RefinedTaskDetail)
  "TaskEditPopover",        // -> TaskEditSheet
]

/** Pages that were whole retired flows. None may exist or be routed. */
const RETIRED_PAGES = [
  "InventoryItemSetup",
  // URL-only pages on retired designs, deleted with their routes (audit
  // 2026-09-29, D5). /tasks's page was `Tasks` — a name too common to guard by
  // word, so its route is pinned below instead.
  "FaqPage",       // /faq, the Care Guide -> item pages + House notes
  "CarePage",      // /care -> Tasks (/maintenance)
  "SchedulePage",  // /schedule -> Tasks (/maintenance)
  "CleaningPage",  // /cleaning -> Clean (/clean)
]

/** Their paths: nothing may route them again, whatever the component is called. */
const RETIRED_ROUTES = ["/faq", "/tasks", "/care", "/schedule", "/cleaning"]

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
  it("their files are deleted, not kept as stubs", () => {
    // ParseProgressStep.tsx outlived its screen by a round as a file holding
    // one type that another module imported from it — reachable by nothing,
    // but still a file by a retired design's name, waiting to be edited as if
    // it were live. "None may exist" now covers the file itself.
    const all = walk(SRC)
    const left = [...RETIRED_COMPONENTS, ...RETIRED_PAGES].flatMap((name) =>
      all.filter((f) => /^[^.]+\.tsx?$/.test(basename(f)) && basename(f).replace(/\.tsx?$/, "") === name),
    )
    expect(left.map((f) => f.replace(SRC, "src"))).toEqual([])
  })

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

  it("routes none of the deleted URL-only pages (/tasks/:id, the task page, stays)", () => {
    for (const path of RETIRED_ROUTES) {
      expect(app.text, `App.tsx routes ${path} again`).not.toContain(`path="${path}"`)
    }
    expect(app.text).toContain('path="/tasks/:taskInstanceId"')
  })

  it("only SmartAddItem creates items, so there is one add flow to keep honest", () => {
    const creators = sources
      .filter((s) => /\bcreateItemUnit\s*\(/.test(s.text))
      .map((s) => s.path)
      .filter((p) => !p.includes("/services/") && !p.includes("/hooks/") && !p.includes("/modules/"))
    expect(creators).toEqual(["src/pages/SmartAddItem.tsx"])
  })
})

describe("no parked UI: a layout hidden at every width is deleted, not kept", () => {
  // Home, Items and Tasks each carried a replaced layout inside
  // className="hidden" — never on screen, still mounted, still edited as if it
  // were live (Maintenance.tsx has the story; the dead-code sweep deleted the
  // last of them, audit 2026-09-29). `hidden` is fine when a breakpoint shows
  // the element again (`hidden lg:block`); alone, it is a decoy.
  const SHOWN_AGAIN = /^(?:sm|md|lg|xl|2xl):(?:block|flex|grid|inline|inline-block|inline-flex|table|contents)$/
  const alwaysHidden = (code: string) =>
    [...code.matchAll(/className="([^"]*)"/g)]
      .map((m) => m[1].split(/\s+/))
      .filter((classes) => classes.includes("hidden") && !classes.some((c) => SHOWN_AGAIN.test(c)))
      .map((classes) => classes.join(" "))

  for (const page of ["src/pages/Home.tsx", "src/pages/Inventory.tsx", "src/pages/Maintenance.tsx"]) {
    it(`${page} mounts nothing that is hidden at every width`, () => {
      const src = sources.find((s) => s.path === page)
      expect(src, `${page} not found`).toBeDefined()
      expect(alwaysHidden(src!.text)).toEqual([])
    })
  }

  it("the check itself sees a parked block (guards against a vacuous pass)", () => {
    expect(alwaysHidden(`<div className="hidden mt-4"><Cal /></div><div className="hidden lg:block" />`)).toEqual(["hidden mt-4"])
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
