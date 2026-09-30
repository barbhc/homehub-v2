/**
 * Design contracts — the agreed designs, pinned as behaviour.
 *
 * `retiredDesigns.test.ts` checks NAMES: a retired component cannot be imported.
 * Every regression the 2026-09-29 audit found passed it, because none of them
 * brought a name back — a live door lost its first tap, a page mounted two
 * trees, a card round 18 replaced kept rendering under its old name. This file
 * checks what the screens DO and SAY, keyed to the rule that asked for it:
 * `docs/add-item-flow.md` (AIF) and the shipped items in the feedback ledger.
 *
 * How to read it:
 *  - Each title starts with the rule or report it pins. A red test names the
 *    promise that broke; the rule's history is in AIF or docs/beta-feedback.md.
 *  - Components are rendered and read like a person would read them. Source is
 *    scanned only where the rule is an ABSENCE across the whole app (a retired
 *    sentence, a broken promise) — `import.meta.glob(?raw)` rather than node:fs,
 *    so this file type-checks with the app (tsconfig.app.json covers src/).
 *  - `it.todo` marks a rule the code does not meet yet. Each one names the
 *    package that turns it on (audit 2026-09-29 plan). When that package lands,
 *    it writes the body here and deletes the todo.
 *
 * One fake backend serves the whole file: the services the item page reads are
 * mocked at the module boundary, so the page (at either width), CareBlock,
 * ManualSection and the review render as they do in the app.
 */
import { createElement as h, type ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { SWRConfig } from "swr"
import type { ItemUnit, ManualDocument } from "@/integrations/types"
import type { TaskTemplateWithSchedule, WeekAgendaItem } from "@/modules/care"
import type { MaintenanceTaskFull } from "@/lib/dashboard"
import type { PreviewResult, PreviewTask } from "@/modules/knowledge/types/previewTypes"
import { setTestViewportWidth } from "@/test/matchMedia"

// ─── the fake backend ────────────────────────────────────────────────────────

const fake = vi.hoisted(() => ({
  /** Stable identities: the item page keys effects on `home`, so a fresh object
   *  per render would loop. */
  home: { home_id: "home-1", name: "Contract Home" },
  item: null as unknown,
  manuals: [] as unknown[],
  tasks: [] as unknown[],
  openInstances: [] as unknown[],
  doneInstances: [] as unknown[],
  /** What each manual's live parse watch reports, by manual id. */
  stages: {} as Record<string, { stage: string; pdfPages?: number | null }>,
  tray: { parsing: [] as unknown[], ready: [] as unknown[] },
  startParse: vi.fn(),
  previewManualParse: vi.fn(),
  parseManualAndWait: vi.fn(),
  /** The add wizard's writes: each becomes the item getItemUnit answers with. */
  createItemUnit: vi.fn(),
  updateItemUnit: vi.fn(),
  /** The Tasks agenda, and the item-scoped cleaning it withholds. */
  agenda: [] as unknown[],
  hiddenCleaning: 0,
}))

vi.mock("firebase/firestore", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  // Any read no service mock answers comes back empty rather than going to the
  // network: the item page's own tag read, the history timeline, notes.
  getDocs: async () => ({
    docs: [], empty: true, size: 0,
    metadata: { fromCache: false, hasPendingWrites: false },
    forEach: () => {},
  }),
  getDoc: async () => ({ id: "missing", exists: () => false, data: () => undefined, get: () => undefined }),
  onSnapshot: () => () => {},
}))
vi.mock("@/modules/auth", () => ({ useAuth: () => ({ user: { id: "uid-1" } }) }))
vi.mock("@/modules/home", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  useCurrentHome: () => ({ home: fake.home }),
  useCurrentPropertyCompat: () => ({ property: { id: fake.home.home_id, name: fake.home.name }, loading: false, refresh: async () => {} }),
  useHomeProfile: () => ({ profile: null, isLoading: false, error: undefined, refresh: () => {} }),
  getRooms: async () => ({ data: [], error: null }),
}))
vi.mock("@/modules/items", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getItemUnit: async () => ({ data: fake.item, error: null }),
  getItemUnits: async () => ({ data: fake.item ? [fake.item] : [], error: null }),
  createItemUnit: (...a: unknown[]) => fake.createItemUnit(...a),
  updateItemUnit: (...a: unknown[]) => fake.updateItemUnit(...a),
}))
// The wizard's post-create lookup is a callable; here it finds nothing.
vi.mock("@/modules/inventory/services/productLookupService", () => ({
  lookupProduct: async () => ({ data: null, error: { message: "contract test: no lookups" } }),
  lookupBrandForModel: async () => null,
}))
vi.mock("@/modules/care", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getWeekAgenda: async () => ({ data: fake.agenda, error: null }),
  countHiddenCleaning: async () => fake.hiddenCleaning,
  getTaskTemplatesWithSchedulesByItem: async () => ({ data: fake.tasks, error: null }),
  getTaskInstances: async (_home: string, opts?: { status?: string[] }) => ({
    data: opts?.status?.includes("done") ? fake.doneInstances : fake.openInstances,
    error: null,
  }),
}))
vi.mock("@/modules/knowledge", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getChunksByItem: async () => ({ data: [], error: null }),
  getManualsByItem: async () => ({ data: fake.manuals, error: null }),
  getFaqsByItem: async () => ({ data: [], error: null }),
  previewManualParse: (...a: unknown[]) => fake.previewManualParse(...a),
  parseManualAndWait: (...a: unknown[]) => fake.parseManualAndWait(...a),
}))
vi.mock("@/modules/knowledge/services/parseManualService", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  watchParse: (_home: string, manualId: string, cb: (stage: string, parse: unknown) => void) => {
    const s = fake.stages[manualId]
    if (s) cb(s.stage, { pdfPages: s.pdfPages ?? null, summary: null })
    return () => {}
  },
  readPreviewDraft: async () => null,
  startParse: (...a: unknown[]) => fake.startParse(...a),
}))
vi.mock("@/hooks/useParseTray", () => ({ useParseTray: () => fake.tray }))
vi.mock("@/pages/item-detail/useSetupCompletion", () => ({
  useSetupCompletion: () => ({
    isDone: () => false, loadingIds: new Set<string>(), doneCount: 0, toggleDone: () => {}, markAllDone: () => {},
  }),
}))

import ItemDetailPage from "@/pages/ItemDetailPage"
import { ManualStep } from "@/components/smart-add/ManualStep"
import { IdentifyStep, DEFAULT_IDENTIFY_DATA } from "@/components/smart-add/IdentifyStep"
import { TaskReviewSheet } from "@/components/manuals/TaskReviewSheet"
import { ParseTrayPill } from "@/components/manuals/ParseTrayPill"
import { CareBlock } from "@/components/item-care/CareBlock"
import { ThisWeekList } from "@/components/home/ThisWeekList"
import { whenLabel } from "@/components/home/tasks/shared"
import { DesktopTasks } from "@/components/home/DesktopTasks"
import { RefinedWeek } from "@/components/home/RefinedWeek"
import SmartAddItem from "@/pages/SmartAddItem"
import { cleanDueLabel } from "@/lib/cleanDue"
import { derivedDue } from "@/lib/dueWindow"
import { SCAN_KEEPS_GOING_SHORT } from "@/lib/scanCopy"
import { REVIEW_BUCKET_ORDER, REVIEW_BUCKET_COPY } from "../../shared/tasks/reviewBuckets"

// ─── source, for the rules that are an absence across the app ────────────────

const RAW = import.meta.glob<string>(
  ["/src/**/*.{ts,tsx}", "!/src/**/*.test.{ts,tsx}", "!/src/test/**"],
  { query: "?raw", import: "default", eager: true },
)

/** Comments out, so the notes explaining WHY a sentence was retired — the most
 *  useful lines in these files — never read as the sentence still being there.
 *  A block comment must open after whitespace or `{(,` — `accept="image/*"`
 *  opens one otherwise (addFlowCopy.test.ts has the story). */
function stripComments(src: string): string {
  return src
    .replace(/(^|[\s{(,])\/\*[\s\S]*?\*\//g, "$1")
    .replace(/(^|\s)\/\/[^\n]*/g, "$1")
}

const SOURCES = Object.entries(RAW).map(([path, text]) => ({ path: path.slice(1), code: stripComments(text) }))

/** What a reader could see: string literals, template text, and JSX text.
 *  scanCopy.test.ts reads only the first two; JSX text is where a retired
 *  sentence hides from it. */
function visibleText(code: string): string[] {
  const out: string[] = []
  for (const m of code.matchAll(/"([^"\\\n]*)"|'([^'\\\n]*)'/g)) out.push(m[1] ?? m[2] ?? "")
  for (const m of code.matchAll(/`([^`]*)`/g)) out.push(m[1].replace(/\$\{[^}]*\}/g, " "))
  for (const m of code.matchAll(/>([^<>{}]*[A-Za-z][^<>{}]*)</g)) out.push(m[1])
  return out.map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean)
}

/** Every file whose readable text matches, with the text that did. */
function filesSaying(pattern: RegExp): string[] {
  return SOURCES.flatMap((s) =>
    visibleText(s.code).filter((t) => pattern.test(t)).map((t) => `${s.path} :: ${t.slice(0, 80)}`),
  )
}

// ─── fixtures ────────────────────────────────────────────────────────────────

const iso = (days: number) => {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

const ITEM = {
  item_unit_id: "item-1", home_id: "home-1", room_id: null, display_name: "Bosch Dishwasher",
  category: "dishwasher", item_category: "major_appliance", sub_type: "dishwasher", category_fields: null,
  brand: "Bosch", model: "SHPM65Z55N", serial_number: null, purchase_date: null, install_date: null,
  status: "active", notes: null, photo_storage_ref: null, store_name: null, price_paid: null,
  receipt_storage_path: null, warranty_duration_months: null, warranty_coverage: null,
  warranty_expiry_date: null, manufactured_year: null, recall_status: null, recall_checked_at: null,
  recall_notes: null, tags: [], created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z",
  deleted_at: null,
} as unknown as ItemUnit

/** A URL manual resolves without Storage, so the page's load stays local. */
const manual = (id: string, over: Partial<ManualDocument> = {}): ManualDocument => ({
  manual_id: id, item_unit_id: "item-1", title: "Bosch owner's manual", label: null,
  source_type: "url", source_ref: `https://example.com/${id}.pdf`, role: "primary", version: null,
  language: "en", parsed_at: null, parse_stage: null, parse_draft: null,
  created_at: new Date(Date.now() - 60_000).toISOString(), updated_at: new Date().toISOString(),
  deleted_at: null, ...over,
})

const template = (over: Record<string, unknown> = {}) => ({
  task_template_id: "t-filter", title: "Clean the filter", care_type: "maintenance", scope_type: "item_unit",
  item_unit_id: "item-1", priority_tier: "recommended", risk_level: "performance", estimated_minutes: 10,
  is_active: true, deleted_at: null, schedule_rule: [{ schedule_type: "monthly", interval_days: null }],
  ...over,
}) as unknown as TaskTemplateWithSchedule

const previewTask = (
  title: string, care_type: PreviewTask["care_type"], schedule_type: PreviewTask["schedule_type"],
  priority_tier: PreviewTask["priority_tier"] = "recommended",
): PreviewTask => ({
  title, description: null, care_type, priority_tier, risk_level: "performance", estimated_minutes: 10,
  schedule_type, interval_days: null, instructions_text: null, symptom_tags: [], re_check_triggers: [],
})
const preview = (tasks: PreviewTask[]): PreviewResult => ({ ok: true, chunks: [], tasks })

/** Fresh SWR cache per render: the manual-URL cache must not leak between tests. */
const withSwr = (child: ReactNode) => h(SWRConfig, { value: { provider: () => new Map(), dedupingInterval: 0 } }, child)

async function renderItemPage(width: number) {
  setTestViewportWidth(width)
  render(withSwr(h(MemoryRouter, { initialEntries: ["/items/item-1"] },
    h(Routes, null, h(Route, { path: "/items/:id", element: h(ItemDetailPage) })))))
  // The page's load is done when the item's name is on screen. findAll, so a
  // page that renders it twice fails on the count below, not in this wait.
  await screen.findAllByRole("heading", { name: "Bosch Dishwasher", hidden: true })
}

/** Every dialog in the DOM, hidden or not. Radix marks everything outside an
 *  open dialog aria-hidden, which is how a second dialog hides from a plain
 *  role query (#223's probe counted 0 where there were 2). */
const allDialogs = () => screen.queryAllByRole("dialog", { hidden: true })

/** Buttons whose primary style is filled — the "only filled button" rule. */
const filledButtons = (root: HTMLElement) =>
  within(root).queryAllByRole("button").filter((b) => b.getAttribute("data-variant") === "default")

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  fake.item = ITEM
  fake.manuals = []
  fake.tasks = []
  fake.openInstances = []
  fake.doneInstances = []
  fake.stages = {}
  fake.tray = { parsing: [], ready: [] }
  fake.startParse.mockResolvedValue({ ok: true, requestId: "req-contract" })
  // Answered, so a page that DOES start a scan fails on the assertion that it
  // must not — not on an unhandled rejection inside the page.
  fake.previewManualParse.mockResolvedValue({ ok: false, error: "contract test: no scans here" })
  fake.parseManualAndWait.mockResolvedValue({ ok: false, error: "contract test: no scans here" })
  fake.agenda = []
  fake.hiddenCleaning = 0
  fake.createItemUnit.mockImplementation(async (input: Record<string, unknown>) => {
    const fields = Object.fromEntries(Object.entries(input).filter(([k]) => k !== "home_id"))
    fake.item = { ...ITEM, ...fields, item_unit_id: "item-new" }
    return { data: fake.item, error: null }
  })
  fake.updateItemUnit.mockImplementation(async (_home: string, id: string, fields: Record<string, unknown>) => {
    fake.item = { ...(fake.item as object), ...fields, item_unit_id: id }
    return { data: fake.item, error: null }
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe("The add-item flow (docs/add-item-flow.md)", () => {
  it("HH-110 · Screen 2: the appliance lane is two fields and nothing else — no stepper, no details disclosure", () => {
    // PR #167 said this in its body while the disclosure, the stepper and Back
    // were all still on screen (CLAUDE.md, "Claiming something is done" #1).
    const { container } = render(withSwr(h(IdentifyStep, {
      mode: "appliance", data: DEFAULT_IDENTIFY_DATA, onModeChange: () => {}, onDataChange: () => {},
      onConfirm: () => {}, isCreating: false, error: null,
    })))
    const fields = Array.from(container.querySelectorAll("input, textarea, select"))
      .filter((el) => (el as HTMLInputElement).type !== "file" && (el as HTMLInputElement).type !== "hidden")
    expect(fields.map((el) => el.id)).toEqual(["identify-brand", "identify-model"])
    // HH-123: scanning is a first-class choice, visible without opening anything.
    expect(screen.getByRole("button", { name: /Scan the label/ })).toBeInTheDocument()
    expect(screen.queryByText(/Add more details/)).toBeNull()
    expect(screen.queryByText(/Step \d+ of \d+/)).toBeNull()
    expect(container.querySelector('nav[aria-label="Progress"]')).toBeNull()
  })

  it("HH-128 · Screen 3: a zero-byte file is refused before any upload — with the reason, not 'try again'", () => {
    const onConfirm = vi.fn()
    render(h(ManualStep, { brand: "Bosch", model: "SHPM65Z55N", onConfirm, isSaving: false, error: null }))
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!
    fireEvent.change(input, { target: { files: [new File([], "manual.pdf", { type: "application/pdf" })] } })
    expect(screen.getByText(/This file came through empty/)).toBeInTheDocument()
    // Nothing to scan, so nothing offers to scan it, and nothing was handed on.
    expect(screen.queryByRole("button", { name: /Scan the manual/ })).toBeNull()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it("HH-124 / HH-131 · Screen 3: at capacity the button stands down and says the scan is queued", () => {
    render(h(ManualStep, {
      brand: "Bosch", model: "SHPM65Z55N", onConfirm: () => {}, isSaving: false,
      error: "Daily AI limit reached (50 actions per day).", onRetry: () => {},
    }))
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!
    fireEvent.change(input, { target: { files: [new File(["%PDF-1.4"], "manual.pdf", { type: "application/pdf" })] } })
    expect(screen.getByRole("button", { name: "Scanning resumes later" })).toBeDisabled()
    expect(screen.getByText(/you don.t need to come back for it/)).toBeInTheDocument()
    // A ceiling we set is not an error they caused: no Scan, no Try again.
    expect(screen.queryByRole("button", { name: /Scan the manual/ })).toBeNull()
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull()
  })

  it.todo(
    "HH-109 / HH-115 · Screen 3: upload holds the ONLY filled button on the item-page door too " +
      "— needs a product change (suggest E3): the dialog's 'What is this document?' toggle renders its " +
      "selected 'Owner manual' as a second filled button (ManualSection.tsx); the wizard door complies (ManualStep.test.tsx)",
  )

  it("HH-130 · Screen 3: Back, then 'Add the manual', updates the item Screen 2 created — never a second item", async () => {
    render(withSwr(h(MemoryRouter, { initialEntries: ["/inventory/add"] },
      h(Routes, null, h(Route, { path: "/inventory/add", element: h(SmartAddItem) })))))
    fireEvent.click(screen.getByRole("button", { name: /Appliance or device/ }))
    fireEvent.change(document.getElementById("identify-brand")!, { target: { value: "Coway" } })
    fireEvent.change(document.getElementById("identify-model")!, { target: { value: "AP-1512HH" } })
    fireEvent.click(screen.getByRole("button", { name: /^Add the manual$/ }))
    await screen.findByRole("heading", { name: "Add the manual" })
    // Screen 3 carries the brand and model just typed, and Back returns to them…
    expect(screen.getByText("For your Coway AP-1512HH.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /^Back$/ }))
    expect(await screen.findByDisplayValue("AP-1512HH")).toBeInTheDocument()
    // …and going forward again is the SAME item, not a second one.
    fireEvent.click(screen.getByRole("button", { name: /^Add the manual$/ }))
    await screen.findByRole("heading", { name: "Add the manual" })
    expect(fake.createItemUnit).toHaveBeenCalledTimes(1)
    expect(fake.updateItemUnit).toHaveBeenCalledTimes(1)
    expect(fake.updateItemUnit.mock.calls[0][1]).toBe("item-new")
  })

  it("HH-116 / HH-117 · leaving is safe and said out loud on every surface showing a live scan", async () => {
    // The item page while the scan runs…
    fake.manuals = [manual("m-live-say", { parse_stage: "claude_call" })]
    fake.stages = { "m-live-say": { stage: "claude_call", pdfPages: 24 } }
    await renderItemPage(390)
    expect(document.body.textContent).toContain(SCAN_KEEPS_GOING_SHORT)
  })

  it("HH-116 / HH-117 · …and on the tray, everywhere else", () => {
    fake.tray = { parsing: [{ manualId: "m-elsewhere", itemUnitId: "item-9", title: "Dryer manual", pages: 30, stage: "claude_call" }], ready: [] }
    render(h(MemoryRouter, { initialEntries: ["/home"] }, h(ParseTrayPill)))
    fireEvent.click(screen.getByRole("button", { name: /1 scanning/ }))
    expect(screen.getByText(SCAN_KEEPS_GOING_SHORT)).toBeInTheDocument()
  })

  it("HH-118 · the tray stands down on the page already showing that scan (the CURRENT rule — E2 supersedes it)", () => {
    // HH-161 asks for the opposite: ONE indicator, the pill, on every page
    // including this one. When E2 lands it amends AIF ("The tray stands down")
    // in the same PR and turns this test around. Until then this is the rule.
    fake.tray = { parsing: [{ manualId: "m-here", itemUnitId: "item-1", title: "Bosch manual", pages: 24, stage: "claude_call" }], ready: [] }
    const onItem = render(h(MemoryRouter, { initialEntries: ["/items/item-1"] }, h(ParseTrayPill)))
    expect(screen.queryByRole("button", { name: /scanning/ })).toBeNull()
    onItem.unmount()
    render(h(MemoryRouter, { initialEntries: ["/home"] }, h(ParseTrayPill)))
    expect(screen.getByRole("button", { name: /1 scanning/ })).toBeInTheDocument()
  })

  it("HH-135 · a live scan is one indeterminate rail — no spinner, no percentage", async () => {
    // The rail sweeps rather than fills: we know the page count, not how far
    // through them the model is. Asserted on the PAGE, so moving the band into
    // Upkeep (E2's mock) keeps this contract as long as it keeps the design.
    fake.manuals = [manual("m-live-rail", { parse_stage: "claude_call" })]
    fake.stages = { "m-live-rail": { stage: "claude_call", pdfPages: 24 } }
    await renderItemPage(390)
    const rails = screen.getAllByRole("progressbar", { hidden: true })
    expect(rails).toHaveLength(1)
    expect(rails[0]).not.toHaveAttribute("aria-valuenow")
    expect(screen.getByText("24 pages")).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/\d+\s*%/)
  })

  it("audit 2026-09-29 (HH-159) · the item page watches a scan and never starts one on arrival", async () => {
    // The page used to re-enqueue any unread manual under ten minutes old — the
    // wizard's own, already enqueued — so every add with a manual was charged
    // twice. This one is a minute old and unread, the exact shape that fired.
    fake.manuals = [manual("m-arrival", { parse_stage: "queued" })]
    fake.stages = { "m-arrival": { stage: "queued" } }
    await renderItemPage(390)
    // Loaded to the end: the manual is listed, and its URL (the step the old
    // re-enqueue ran after) has had time to resolve.
    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: /Manuals & References\s*\(1\)/, hidden: true }).length).toBeGreaterThan(0))
    await new Promise((r) => setTimeout(r, 50))
    expect(fake.startParse).not.toHaveBeenCalled()
    expect(fake.previewManualParse).not.toHaveBeenCalled()
    expect(fake.parseManualAndWait).not.toHaveBeenCalled()
  })

  it("HH-126 · the two add-manual doors are one component: ManualStep is rendered by exactly SmartAddItem and ManualSection", () => {
    // Also pinned in retiredDesigns.test.ts; repeated here beside the behaviour
    // it guarantees (the render below), so the contract reads in one place.
    const doors = SOURCES.filter((s) => /<ManualStep[\s/>]/.test(s.code)).map((s) => s.path).sort()
    expect(doors).toEqual(["src/pages/SmartAddItem.tsx", "src/pages/item-detail/ManualSection.tsx"])
  })

  for (const [label, width] of [["390px", 390], ["desktop", 1440]] as const) {
    it(`HH-159 / HH-126 · ${label}: one tree — one manual section, one Upkeep door, and it opens ONE dialog that is ManualStep`, async () => {
      await renderItemPage(width)
      // Two trees meant two of each: the heading, the section, and a portaled
      // dialog per tree that display:none could not hide.
      expect(screen.getAllByRole("heading", { name: "Bosch Dishwasher", hidden: true })).toHaveLength(1)
      expect(screen.getAllByRole("button", { name: /Manuals & References/, hidden: true })).toHaveLength(1)
      const doors = screen.getAllByRole("button", { name: "Add the manual", hidden: true })
      expect(doors).toHaveLength(1)
      expect(allDialogs()).toHaveLength(0)

      fireEvent.click(doors[0])
      const dialog = await screen.findByRole("dialog")
      expect(allDialogs()).toHaveLength(1)
      // HH-126: the item page's door renders the wizard's own ManualStep —
      // the same ranked sources, joined by the same "or" rule — not a copy.
      expect(within(dialog).getByRole("heading", { name: "Add the manual" })).toBeInTheDocument()
      expect(within(dialog).getByText("Upload the PDF")).toBeInTheDocument()
      expect(within(dialog).getByTestId("manual-or-rule")).toBeInTheDocument()
      expect(within(dialog).getByText("Paste a link")).toBeInTheDocument()
      // Upload leads (HH-109): this door opens on the upload lane, not the link.
      expect(within(dialog).queryByPlaceholderText("https://example.com/manual.pdf")).toBeNull()
      expect(filledButtons(dialog).map((b) => b.textContent)).toContain("Choose a file")
    })
  }

  it.todo(
    "HH-141 / HH-161 · the item page's three manual states never contradict — after attaching a manual, Upkeep " +
      "never says 'No upkeep yet — add the manual' (or offers the button) while the page says 'Reading the manual', " +
      "and 'Reading the manual' is said once (E2: the page's manual flags come from a one-time read; " +
      "a manual added in-session keeps parse_stage null)",
  )
})

// ═════════════════════════════════════════════════════════════════════════════
describe("The review — the one decision (AIF, round 18)", () => {
  /** One row per section, listed in the WRONG order, so the sheet has to sort. */
  const MIXED = preview([
    previewTask("Verify proper grounding", "maintenance", "setup", "essential"),
    previewTask("Rinse the filter after each use", "cleaning", "after_each_use", "optional"),
    previewTask("Wipe the door gasket", "cleaning", "weekly"),
    previewTask("Replace the water filter", "maintenance", "semiannual", "essential"),
  ])

  /** A section heading's own words — not its count or its Show button. */
  const sectionOrder = () =>
    screen.queryAllByText(/^(Maintenance|Cleaning|Usage|Setup)$/).map((el) =>
      Array.from(el.childNodes).filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent).join("").trim())

  it("HH-119 · every door opens the approved review: the three known doors, none opting out of the safe default", () => {
    // Rule 6 in CLAUDE.md: the SAFE value is the default, and every call site
    // is known. A fourth door must be looked at, and then listed here.
    const doors = SOURCES.filter((s) => /<TaskReviewSheet[\s/>]/.test(s.code))
    expect(doors.map((d) => d.path).sort()).toEqual([
      "src/components/manuals/ParsePickupCard.tsx",
      "src/components/manuals/ReviewItemTasksButton.tsx",
      "src/pages/item-detail/ManualSection.tsx",
    ])
    for (const door of doors) {
      const calls = door.code.match(/<TaskReviewSheet\b[\s\S]*?\n\s*\/>/g) ?? []
      // A call the pattern cannot see would pass the check below vacuously.
      expect(calls.length, `${door.path}: could not read its <TaskReviewSheet> call`).toBeGreaterThan(0)
      for (const call of calls) {
        expect(call, `${door.path} passes a focus other than "maintenance"`).not.toMatch(/\bfocus=(?!"maintenance")/)
      }
    }
  })

  it("HH-119 / HH-144 · with no focus passed (two of the three doors), it is ONE screen: Maintenance → Cleaning → Usage → Setup", () => {
    render(h(TaskReviewSheet, {
      freezeRiskFalse: false, open: true, onOpenChange: () => {}, itemName: "Bosch SHPM65Z55N",
      previewData: MIXED, onSave: async () => null, saving: false,
    }))
    expect(sectionOrder()).toEqual(REVIEW_BUCKET_ORDER.map((b) => REVIEW_BUCKET_COPY[b].title))
    expect(sectionOrder()).toEqual(["Maintenance", "Cleaning", "Usage", "Setup"])
    // One screen, one way forward.
    expect(screen.queryByRole("button", { name: /^Next/ })).toBeNull()
    expect(screen.getByRole("button", { name: /^Save all 4$/ })).toBeInTheDocument()
  })

  it("HH-142 · no maintenance simply means no Maintenance section — no card, no sentence explaining the absence", () => {
    render(h(TaskReviewSheet, {
      freezeRiskFalse: false, open: true, onOpenChange: () => {}, itemName: "Sharp microwave drawer",
      previewData: preview([
        previewTask("Clean the waveguide cover", "cleaning", "monthly"),
        previewTask("Wipe the interior after each use", "cleaning", "after_each_use", "optional"),
      ]),
      onSave: async () => null, saving: false,
    }))
    expect(sectionOrder()).toEqual(["Cleaning", "Usage"])
    expect(screen.queryByText(/no maintenance/i)).toBeNull()
    // The summary still states both channels, apart (HH-144).
    expect(screen.getByText(/None will notify your phone/)).toBeInTheDocument()
  })

  it("HH-147 / HH-140 · the two-step review is gone — its sentences appear nowhere in the app", () => {
    // Canaries: the scanner reads the whole tree, JSX text and string literals
    // alike, or every absence in this file would pass by not looking.
    expect(SOURCES.length).toBeGreaterThan(100)
    expect(filesSaying(/^Upload the PDF$/)).toHaveLength(1)
    expect(filesSaying(/^Nothing is late, and nothing is scheduled yet\.$/)).toHaveLength(1)
    const RETIRED = [
      /Review them all/, /Step [12] of 2/, /Next: schedule/, /Nothing here needs a reminder/,
      /how often & reminders/, /What each task is/,
    ]
    const offenders = RETIRED.flatMap((p) => filesSaying(p))
    expect(offenders).toEqual([])
  })

  it.todo(
    "HH-137 / HH-142 superseded · 'No maintenance in this manual, so nothing will remind you' is gone app-wide " +
      "(E2: round 14's card is still ParsePickupCard's no-maintenance branch, pinned by ParsePickupCard.test.tsx)",
  )

  it.todo(
    "HH-144 · 'N will show up in Tasks' counts only what Tasks shows — item-scoped cleaning is excluded from the " +
      "agenda (isAgendaEligible), so a review of item cleaning alone must not promise it there (E2)",
  )

  it.todo(
    "round 18 · a bell is never drawn that cannot be rung — with notification permission refused, the review " +
      "says so instead of drawing bells (E2: notifyGate.ts has no production caller)",
  )
})

// ═════════════════════════════════════════════════════════════════════════════
describe("Home, Tasks and the item page speak one calm language", () => {
  const upcomingTask = (id: string, title: string, due: string): MaintenanceTaskFull => ({
    id, title, description: null, task_template_id: `tpl-${id}`, notes: null, next_due_date: due,
    is_recurring: true, frequency_value: null, frequency_unit: null, item_id: "item-1", itemName: "Furnace",
    locationId: null, locationName: null, priority: "high", effort: null, isOverdue: false, isDueSoon: false,
    lastCompletedAt: null, completionCount: 0, careType: "maintenance", duePhrase: null, safetyNote: null,
  })
  const week = (upcoming: MaintenanceTaskFull[], nextUp: { dueDate: string; windowStart: string } | null) =>
    render(h(MemoryRouter, null, h(ThisWeekList, {
      homeId: "home-1", tasks: [], upcoming, nextUp, completingId: null, onComplete: () => {}, onSnooze: () => {},
    })))

  it("HH-92 · Home never says 'nothing is scheduled' over scheduled work", () => {
    // Work three weeks out: nothing this week, and plenty scheduled.
    const ahead = week([upcomingTask("u1", "Replace furnace filter", iso(21))], null)
    expect(screen.getByTestId("quiet-week").textContent).not.toMatch(/nothing is scheduled/i)
    expect(screen.getByText(/Next up: replace furnace filter/)).toBeInTheDocument()
    ahead.unmount()

    // The schedule known only from the stats (no forward feed yet).
    const statsOnly = week([], { dueDate: iso(40), windowStart: iso(33) })
    expect(screen.getByTestId("quiet-week").textContent).not.toMatch(/nothing is scheduled/i)
    statsOnly.unmount()

    // Only when there is truly nothing does it say so.
    week([], null)
    expect(screen.getByText("Nothing is late, and nothing is scheduled yet.")).toBeInTheDocument()
  })

  it("Calm tiers (non-negotiable 6) · 'Overdue' is said only where isTrulyOverdue allows it", () => {
    const agendaRow = (title: string, scheduleType: string, due: string): WeekAgendaItem => {
      const d = derivedDue({ title, scheduleType, careType: "maintenance", dueDate: due })
      return {
        taskInstanceId: title, taskTemplateId: title, title, source: "appliance", priorityTier: "essential",
        estimatedMinutes: 10, dueDate: due, isOverdue: true, pastDue: true, dueKind: d.dueKind,
        windowState: "lapsed", duePhrase: d.duePhrase, safetyNote: d.safetyNote, trulyOverdue: d.trulyOverdue,
        itemUnitId: null, itemName: null, roomName: null,
      } as unknown as WeekAgendaItem
    }
    // A filter change two months late is a window that lapsed: "Been a while".
    const lapsedWindow = agendaRow("Replace the furnace filter", "monthly", iso(-60))
    expect(whenLabel(lapsedWindow)).toBe("Been a while")
    // A real deadline, actually past, is the one thing that still says it.
    const passedDeadline = agendaRow("Register the warranty", "as_needed", iso(-3))
    expect(whenLabel(passedDeadline)).toBe("Overdue")
  })

  it("Calm tiers · no screen labels a task 'Overdue' outside the deadline gate — the known breaches are gone (H)", () => {
    // The label — "Overdue", or the "N days overdue" count — in text a user can
    // read. ALLOWED: the Tasks rows' whenLabel (returns it only when
    // t.trulyOverdue), tokens.dueLabel (its one caller, RefinedTaskDetail,
    // uses it only for deadline-kind tasks), and cleanDueLabel (the /clean hub
    // since E3 — returns it only when isTrulyOverdue, i.e. a passed deadline).
    const ALLOWED = ["src/components/home/tasks/shared.ts", "src/lib/redesign/tokens.ts", "src/lib/cleanDue.ts"]
    // No known breaches remain. DeepClean.tsx left the list in E3 (its label is
    // cleanDueLabel now); the dead-code sweep (H) deleted the other four —
    // CarePage (/care), MaintenanceTaskRow (/tasks), and the unrendered
    // components/dashboard TaskRow + UrgentTasksCard — so an "Overdue" anywhere
    // else is a new breach.
    // Case matters for the bare word: lower-case "overdue" is an enum value
    // (urgencyLevel), not something a person reads.
    const saying = [...filesSaying(/^Overdue$/), ...filesSaying(/\bdays?\s+overdue\b/i)]
    const offenders = [...new Set(saying.map((line) => line.split(" :: ")[0]))]
      .filter((p) => !ALLOWED.includes(p))
    expect(offenders).toEqual([])
  })

  it("Calm tiers · the /clean hub says 'Overdue' only for a passed deadline — cadence work has 'Been a while' (E3)", () => {
    const task = (title: string, scheduleType: string, due: string) =>
      cleanDueLabel({ title, scheduleType, dueDate: due, isOverdue: true })
    expect(task("Wipe the fridge gaskets", "monthly", iso(-60))).toEqual({ text: "Been a while", overdue: true })
    expect(task("Wipe the fridge gaskets", "monthly", iso(-2)).text).toBe("Good to do now")
    expect(task("Renew the water softener warranty", "as_needed", iso(-3))).toEqual({ text: "Overdue", overdue: true })
  })

  it("HH-150 · an item row says what Home and Tasks say — the window, never an invented date", async () => {
    // Round 19's lesson: the item page was the THIRD surface to render a task
    // row, and the fix that reached Home and Your week never reached it. The
    // row's phrase must be the one derivedDue (which feeds Home and Tasks)
    // produces for the same task.
    const due = iso(17)
    fake.openInstances = [{ task_instance_id: "inst-1", task_template_id: "t-filter", due_date: due, status: "scheduled" }]
    render(withSwr(h(MemoryRouter, null, h(CareBlock, {
      item: ITEM, homeId: "home-1", tasks: [template()], chunks: [], hasManual: true, onAddManual: () => {},
    }))))
    const expected = derivedDue({ title: "Clean the filter", scheduleType: "monthly", careType: "maintenance", dueDate: due }).duePhrase
    await waitFor(() => expect(screen.getByTestId("care-row").textContent).toContain(expected))
    expect(screen.getByTestId("care-row").textContent).not.toMatch(/(Mon|Tue|Wed|Thu|Fri|Sat|Sun), \w{3} \d{1,2}/)
    expect(screen.getByTestId("care-row").textContent).not.toContain(due)
  })

  it("HH-153 · Settings (or anywhere) never promises a door that does not exist — tasks are not added 'from the Tasks page'", () => {
    expect(filesSaying(/from the Tasks page/i)).toEqual([])
  })

  it("HH-94 / HH-82 · an empty Tasks list accounts for the cleaning it withholds — on desktop too", async () => {
    fake.agenda = []
    fake.hiddenCleaning = 2
    render(withSwr(h(MemoryRouter, null, h(RefinedWeek, { homeId: "home-1" }), h(DesktopTasks, { homeId: "home-1" }))))
    // Both trees, the same words — one implementation (nothingDueLine).
    expect(await screen.findAllByText("Nothing on the schedule — 2 cleaning jobs live in your guides.")).toHaveLength(2)
    expect(screen.queryByText(/enjoy the calm/)).toBeNull()
  })
})
