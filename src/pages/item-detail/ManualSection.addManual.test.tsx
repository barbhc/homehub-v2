/**
 * HH-159: "Add the manual" on the item page failed its first attempt from every
 * door.
 *
 * The dialog's confirm handler set mode/URL/file in state and called
 * handleAddManual a microtask later — but the handleAddManual it called was the
 * one from the render BEFORE those setters, so it read the old state: "Enter a
 * URL" after choosing a PDF from the Upkeep door, "Select a PDF file" from the
 * drop-zone. "Try again" only worked because the state had been left set, and
 * if the file was swapped in between, the retry uploaded the PREVIOUS one.
 *
 * These drive the REAL useManualManagement hook through the real ManualSection
 * and ManualStep, with only the network mocked, and wire the doors exactly the
 * way ItemDetailPage does (every one through handleOpenAddManual).
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ManualDocument } from "@/integrations/types"

type UploadResult =
  | { data: { path: string; url: string }; error: null }
  | { data: null; error: { message: string } }

const uploadManualPdfWithUrl = vi.fn<(homeId: string, itemId: string, file: File, userId: string | null) => Promise<UploadResult>>()
const createManualDocument = vi.fn()
const startParse = vi.fn()

vi.mock("@/modules/inventory/services/storageService", () => ({
  MAX_UPLOAD_BYTES: 50 * 1024 * 1024,
  uploadManualPdfWithUrl: (h: string, i: string, f: File, u: string | null) => uploadManualPdfWithUrl(h, i, f, u),
}))
vi.mock("@/modules/knowledge", () => ({
  createManualDocument: (...a: unknown[]) => createManualDocument(...a),
  deleteManualDocument: vi.fn(),
  ingestReference: vi.fn(),
  getChunksByItem: vi.fn(),
  getManualsByItem: vi.fn(),
  parseManualAndWait: vi.fn(),
  previewManualParse: vi.fn(),
  commitReviewedDraft: vi.fn(),
  updateManualLabel: vi.fn(),
}))
vi.mock("@/modules/knowledge/services/parseManualService", () => ({
  startParse: (...a: unknown[]) => startParse(...a),
  ACTIVE_PARSE_STAGES: ["awaiting_capacity", "queued", "started", "pdf_fetched", "claude_call", "claude_responded", "committing"],
}))
vi.mock("@/modules/care", () => ({ getTaskTemplatesWithSchedulesByItem: vi.fn() }))
vi.mock("@/integrations/firebase", () => ({ resolveStorageUrl: vi.fn(), callable: () => vi.fn() }))
vi.mock("@/modules/home", () => ({
  useHomeProfile: () => ({ profile: null, isLoading: false, error: undefined, refresh: vi.fn() }),
}))
vi.mock("swr", () => ({ default: () => ({ data: undefined, error: undefined, mutate: vi.fn() }) }))
// Not under test here: the search card would call a function.
vi.mock("@/components/smart-add/FindManualCard", () => ({
  FindManualCard: ({ onPick }: { onPick: (url: string) => void }) => (
    <div data-testid="find-manual-card">
      <button type="button" onClick={() => onPick("https://example.com/found-manual.pdf")}>Use this result</button>
    </div>
  ),
}))

import { useManualManagement } from "@/hooks/useManualManagement"
import { onReviewRequest } from "@/lib/reviewRequest"
import { ManualSection } from "./ManualSection"

/** The item page's wiring, minus the page: the hook's values straight into
 *  ManualSection, and the Upkeep door exactly as ItemDetailPage hands it to
 *  CareBlock (`onAddManual={() => manualMgmt.handleOpenAddManual("upload")}`).
 *  The manuals list is the page's LIVE list (useItemManuals) — nothing the
 *  hook patches — so here it is simply what the "listener" last delivered. */
function ItemPageManual({ manuals = [] }: { manuals?: ManualDocument[] }) {
  const mgmt = useManualManagement({
    itemId: "item-1",
    homeId: "home-1",
    userId: "uid-1",
    setChunks: () => {},
    setTasks: () => {},
  })
  return (
    <>
      <button type="button" onClick={() => mgmt.handleOpenAddManual("upload")}>
        Upkeep: Add the manual
      </button>
      <ManualSection
        {...mgmt}
        homeId="home-1"
        brand="Bosch"
        model="SHPM65Z55N"
        manuals={manuals}
      />
    </>
  )
}

const pdf = (name: string) => new File(["%PDF-1.4 test manual"], name, { type: "application/pdf" })

const manualDoc = (over: Partial<ManualDocument> = {}) =>
  ({
    manual_id: "man-1",
    item_unit_id: "item-1",
    title: "manual.pdf",
    source_type: "upload",
    source_ref: "homes/home-1/manuals/uid-1/item-1/manual_1.pdf",
    role: "primary",
    label: null,
    parsed_at: null,
    parse_stage: null,
    parse_mode: null,
    has_preview_draft: false,
    created_at: new Date().toISOString(),
    ...over,
  }) as unknown as ManualDocument

/** Records whether a text EVER rendered while the flow ran — "never appears",
 *  not just "is not on screen at the end". */
function watchForText(...patterns: RegExp[]) {
  const seen = new Set<string>()
  const check = () => {
    const text = document.body.textContent ?? ""
    for (const p of patterns) if (p.test(text)) seen.add(p.source)
  }
  const observer = new MutationObserver(check)
  observer.observe(document.body, { subtree: true, childList: true, characterData: true })
  return {
    seen: () => { check(); return [...seen] },
    stop: () => observer.disconnect(),
  }
}

function choosePdf(dialog: HTMLElement, file: File) {
  const input = dialog.querySelector<HTMLInputElement>('input[type="file"]')
  expect(input, "ManualStep's PDF input").not.toBeNull()
  fireEvent.change(input!, { target: { files: [file] } })
}

async function openManualsSection(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /Manuals & References/ }))
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  uploadManualPdfWithUrl.mockImplementation(async (_h, _i, file) => ({
    data: { path: `homes/home-1/manuals/uid-1/item-1/${file.name}`, url: `https://storage.test/${file.name}` },
    error: null,
  }))
  createManualDocument.mockImplementation(async (_homeId: string, input: Record<string, unknown>) => ({
    data: manualDoc({ title: String(input.title), source_type: input.source_type as "url" | "upload", source_ref: String(input.source_ref) }),
    error: null,
  }))
  startParse.mockResolvedValue({ ok: true, requestId: "req-1" })
})

describe("ManualSection + useManualManagement — add the manual works on the first tap (HH-159)", () => {
  it("Upkeep door → pick a PDF → Scan: uploads THAT file, starts the scan, closes — no 'Enter a URL'", async () => {
    const user = userEvent.setup()
    render(<ItemPageManual />)
    const watch = watchForText(/Enter a URL/, /Select a PDF file/)

    await user.click(screen.getByRole("button", { name: "Upkeep: Add the manual" }))
    const dialog = await screen.findByRole("dialog")
    // Upload leads (HH-109): the link panel is not what this door opens on.
    expect(within(dialog).queryByPlaceholderText("https://example.com/manual.pdf")).toBeNull()

    const file = pdf("bosch-manual.pdf")
    choosePdf(dialog, file)
    await user.click(within(dialog).getByRole("button", { name: "Scan the manual" }))

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(uploadManualPdfWithUrl).toHaveBeenCalledTimes(1)
    expect(uploadManualPdfWithUrl.mock.calls[0][2]).toBe(file)
    expect(uploadManualPdfWithUrl).toHaveBeenCalledWith("home-1", "item-1", file, "uid-1")
    expect(createManualDocument).toHaveBeenCalledWith("home-1", expect.objectContaining({
      source_type: "upload",
      source_ref: "homes/home-1/manuals/uid-1/item-1/bosch-manual.pdf",
      role: "primary",
    }))
    // Started once, in preview mode — and never awaited past the enqueue.
    expect(startParse).toHaveBeenCalledTimes(1)
    expect(startParse).toHaveBeenCalledWith("man-1", { homeId: "home-1", mode: "preview" })
    expect(watch.seen()).toEqual([])
    watch.stop()
  })

  it("drop-zone door → same file, same single scan", async () => {
    const user = userEvent.setup()
    render(<ItemPageManual />)
    const watch = watchForText(/Enter a URL/, /Select a PDF file/)

    await openManualsSection(user)
    await user.click(screen.getByRole("button", { name: /Upload the manual/ }))
    const dialog = await screen.findByRole("dialog")
    const file = pdf("from-drop-zone.pdf")
    choosePdf(dialog, file)
    await user.click(within(dialog).getByRole("button", { name: "Scan the manual" }))

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(uploadManualPdfWithUrl.mock.calls.map((c) => c[2])).toEqual([file])
    expect(startParse).toHaveBeenCalledTimes(1)
    expect(watch.seen()).toEqual([])
    watch.stop()
  })

  it("the URL lane: 'Paste a link instead' opens on the link field and adds that link", async () => {
    const user = userEvent.setup()
    render(<ItemPageManual />)

    await openManualsSection(user)
    await user.click(screen.getByRole("button", { name: "Paste a link instead" }))
    const dialog = await screen.findByRole("dialog")
    // HH-89: the lane presets what it names — the link field is already open.
    const field = within(dialog).getByPlaceholderText("https://example.com/manual.pdf")
    // Pasted, as the lane says. (Typing works too since 2026-09-30 — the next
    // case; it used to swap the field for the card on the first character.)
    await user.click(field)
    await user.paste("https://bosch.example/SHPM65Z55N.pdf")
    await user.click(within(dialog).getByRole("button", { name: "Scan the manual" }))

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(uploadManualPdfWithUrl).not.toHaveBeenCalled()
    expect(createManualDocument).toHaveBeenCalledWith("home-1", expect.objectContaining({
      source_type: "url",
      source_ref: "https://bosch.example/SHPM65Z55N.pdf",
    }))
    expect(startParse).toHaveBeenCalledTimes(1)
  })

  it("the URL lane can be typed key by key too: Enter shows the link, Scan adds it", async () => {
    const user = userEvent.setup()
    render(<ItemPageManual />)

    await openManualsSection(user)
    await user.click(screen.getByRole("button", { name: "Paste a link instead" }))
    const dialog = await screen.findByRole("dialog")
    const field = within(dialog).getByPlaceholderText("https://example.com/manual.pdf")
    await user.click(field)
    await user.keyboard("https://bosch.example/typed.pdf")
    // Still the field, still focused — nothing chosen mid-word.
    expect(field).toHaveFocus()
    expect(within(dialog).queryByText("Manual link added")).toBeNull()
    await user.keyboard("{Enter}")
    await user.click(within(dialog).getByRole("button", { name: "Scan the manual" }))

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(createManualDocument).toHaveBeenCalledWith("home-1", expect.objectContaining({
      source_type: "url",
      source_ref: "https://bosch.example/typed.pdf",
    }))
    expect(startParse).toHaveBeenCalledTimes(1)
  })

  it("a typed link, then 'Reference doc': that tap lands first, THEN the link is chosen", async () => {
    // The dialog's "What is this document?" buttons sit below ManualStep,
    // outside it. Swapping the field for the card on the blur of that press
    // moved them before the click — the tap was lost.
    const user = userEvent.setup()
    render(<ItemPageManual />)

    await openManualsSection(user)
    await user.click(screen.getByRole("button", { name: "Paste a link instead" }))
    const dialog = await screen.findByRole("dialog")
    const field = within(dialog).getByPlaceholderText("https://example.com/manual.pdf")
    await user.click(field)
    await user.keyboard("https://bosch.example/typed.pdf")
    const reference = within(dialog).getByRole("button", { name: /Reference doc/ })

    // The press as Safari makes it: the field loses focus to nothing.
    fireEvent.pointerDown(reference)
    fireEvent.blur(field)
    expect(within(dialog).queryByText("Manual link added")).toBeNull() // not before the click
    fireEvent.click(reference)

    expect(within(dialog).getByText(/won.t generate upkeep/)).toBeInTheDocument() // the tap landed
    expect(await within(dialog).findByText("Manual link added")).toBeInTheDocument() // then the link was chosen
    expect(within(dialog).getByText("https://bosch.example/typed.pdf")).toBeInTheDocument()
  })

  it("an upload fails, the file is swapped, and the retry uploads the NEW file", async () => {
    uploadManualPdfWithUrl.mockResolvedValueOnce({ data: null, error: { message: "Upload failed: the network dropped" } })
    const user = userEvent.setup()
    render(<ItemPageManual />)

    await user.click(screen.getByRole("button", { name: "Upkeep: Add the manual" }))
    const dialog = await screen.findByRole("dialog")
    const first = pdf("wrong-model.pdf")
    choosePdf(dialog, first)
    await user.click(within(dialog).getByRole("button", { name: "Scan the manual" }))

    // The failure is shown, the dialog stays, nothing was created or started.
    expect(await within(dialog).findByText("Upload failed: the network dropped")).toBeInTheDocument()
    expect(createManualDocument).not.toHaveBeenCalled()
    expect(startParse).not.toHaveBeenCalled()

    await user.click(within(dialog).getByRole("button", { name: "Remove this manual" }))
    const second = pdf("right-model.pdf")
    choosePdf(dialog, second)
    await user.click(within(dialog).getByRole("button", { name: "Scan the manual" }))

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(uploadManualPdfWithUrl).toHaveBeenCalledTimes(2)
    expect(uploadManualPdfWithUrl.mock.calls[1][2]).toBe(second)
    expect(uploadManualPdfWithUrl.mock.calls[1][2]).not.toBe(first)
    expect(createManualDocument).toHaveBeenCalledWith("home-1", expect.objectContaining({ title: "right-model.pdf" }))
    expect(startParse).toHaveBeenCalledTimes(1)
  })

  it("a reopened dialog carries nothing over: no old error, and the role is back to Owner manual", async () => {
    uploadManualPdfWithUrl.mockResolvedValueOnce({ data: null, error: { message: "Upload failed: the network dropped" } })
    const user = userEvent.setup()
    render(<ItemPageManual />)

    await user.click(screen.getByRole("button", { name: "Upkeep: Add the manual" }))
    let dialog = await screen.findByRole("dialog")
    await user.click(within(dialog).getByRole("button", { name: /Reference doc/ }))
    expect(within(dialog).getByText(/won.t generate upkeep/)).toBeInTheDocument()
    choosePdf(dialog, pdf("guide.pdf"))
    await user.click(within(dialog).getByRole("button", { name: "Scan the manual" }))
    expect(await within(dialog).findByText("Upload failed: the network dropped")).toBeInTheDocument()

    await user.keyboard("{Escape}")
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())

    // The Upkeep door again. A leftover "Reference doc" would turn it into an
    // upload that generates no upkeep.
    await user.click(screen.getByRole("button", { name: "Upkeep: Add the manual" }))
    dialog = await screen.findByRole("dialog")
    expect(within(dialog).queryByText("Upload failed: the network dropped")).toBeNull()
    expect(within(dialog).getByText(/Owner manuals generate the upkeep schedule/)).toBeInTheDocument()
  })

  it("'Find it for me' opens on the search once — the next door opens on its own panel", async () => {
    const user = userEvent.setup()
    render(<ItemPageManual />)

    await openManualsSection(user)
    await user.click(screen.getByRole("button", { name: /Find it for me/ }))
    let dialog = await screen.findByRole("dialog")
    // Tapping it IS the ask (HH-89): the search is already open.
    expect(within(dialog).getByTestId("find-manual-card")).toBeInTheDocument()

    await user.click(within(dialog).getByRole("button", { name: "Use this result" }))
    await user.click(within(dialog).getByRole("button", { name: "Scan the manual" }))
    // The scan closes the dialog itself — a close Radix never reports, which is
    // exactly what used to leave the search flag set for the next door.
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(createManualDocument).toHaveBeenCalledWith("home-1", expect.objectContaining({
      source_type: "url",
      source_ref: "https://example.com/found-manual.pdf",
    }))

    await user.click(screen.getByRole("button", { name: "Upkeep: Add the manual" }))
    dialog = await screen.findByRole("dialog")
    expect(within(dialog).queryByTestId("find-manual-card")).toBeNull()
  })
})

/**
 * HH-161: the manual row speaks the page's one vocabulary and routes every read
 * to the item's one review. "Parse" was developer jargon in the one menu a
 * person opens to ask for this; "Rescan" committed in place with no review.
 */
describe("the manual row's menu — reading, and the one review (HH-161)", () => {
  const openMenu = async (user: ReturnType<typeof userEvent.setup>) => {
    await openManualsSection(user)
    await user.click(screen.getByRole("button", { name: "Manual actions" }))
  }

  it("a manual never read offers 'Read the manual' — never 'Parse' — and it starts a PREVIEW read", async () => {
    const user = userEvent.setup()
    render(<ItemPageManual manuals={[manualDoc()]} />)
    await openMenu(user)
    expect(screen.queryByRole("menuitem", { name: /Parse/ })).toBeNull()
    await user.click(screen.getByRole("menuitem", { name: "Read the manual" }))
    await waitFor(() => expect(startParse).toHaveBeenCalledWith("man-1", { homeId: "home-1", mode: "preview" }))
  })

  it("a manual already read offers 'Read again' — never 'Rescan' — and it is a preview, not a commit", async () => {
    const user = userEvent.setup()
    render(<ItemPageManual manuals={[manualDoc({ parsed_at: "2026-09-01T00:00:00.000Z", parse_stage: "done" })]} />)
    await openMenu(user)
    expect(screen.queryByRole("menuitem", { name: /Rescan/ })).toBeNull()
    await user.click(screen.getByRole("menuitem", { name: "Read again" }))
    await waitFor(() => expect(startParse).toHaveBeenCalledWith("man-1", { homeId: "home-1", mode: "preview" }))
  })

  it("a manual read and waiting says so, and offers its review — not another read that would throw it away", async () => {
    const user = userEvent.setup()
    const heard: string[] = []
    const stop = onReviewRequest((id) => heard.push(id))
    render(<ItemPageManual manuals={[manualDoc({ parse_stage: "done", has_preview_draft: true, parse_mode: "preview" })]} />)
    await openManualsSection(user)
    expect(screen.getByText(/Read — not saved/)).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Manual actions" }))
    expect(screen.queryByRole("menuitem", { name: /Read the manual|Read again/ })).toBeNull()
    await user.click(screen.getByRole("menuitem", { name: "Review what we found" }))
    stop()
    expect(heard).toEqual(["man-1"])
    expect(startParse).not.toHaveBeenCalled()
  })

  it("a manual being read says 'Reading…', with no countdown estimate beside it", async () => {
    const user = userEvent.setup()
    render(<ItemPageManual manuals={[manualDoc({ parse_stage: "claude_call" })]} />)
    await openManualsSection(user)
    expect(screen.getByText(/Reading…/)).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/sec remaining|Almost done/)
  })
})
