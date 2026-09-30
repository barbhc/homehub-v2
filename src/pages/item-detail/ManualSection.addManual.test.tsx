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
import { useState } from "react"
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
}))
vi.mock("@/modules/care", () => ({ getTaskTemplatesWithSchedulesByItem: vi.fn() }))
vi.mock("@/integrations/firebase", () => ({ resolveStorageUrl: vi.fn(), callable: () => vi.fn() }))
vi.mock("@/modules/knowledge/services/parseFeedbackService", () => ({ recordParseFeedback: vi.fn() }))
vi.mock("@/modules/home", () => ({
  useHomeProfile: () => ({ profile: null, isLoading: false, error: undefined, refresh: vi.fn() }),
}))
vi.mock("swr", () => ({ default: () => ({ data: undefined, error: undefined, mutate: vi.fn() }) }))
// Not under test here, and heavy: the review sheet only mounts with a preview,
// and the search card would call a function.
vi.mock("@/components/manuals/TaskReviewSheet", () => ({ TaskReviewSheet: () => null }))
vi.mock("@/components/smart-add/FindManualCard", () => ({
  FindManualCard: ({ onPick }: { onPick: (url: string) => void }) => (
    <div data-testid="find-manual-card">
      <button type="button" onClick={() => onPick("https://example.com/found-manual.pdf")}>Use this result</button>
    </div>
  ),
}))

import { useManualManagement } from "@/hooks/useManualManagement"
import { ManualSection } from "./ManualSection"

/** The item page's wiring, minus the page: the hook's values straight into
 *  ManualSection, and the Upkeep door exactly as ItemDetailPage hands it to
 *  CareBlock (`onAddManual={() => manualMgmt.handleOpenAddManual("upload")}`). */
function ItemPageManual() {
  const [manuals, setManuals] = useState<ManualDocument[]>([])
  const mgmt = useManualManagement({
    itemId: "item-1",
    homeId: "home-1",
    userId: "uid-1",
    setManuals: (fn) => setManuals(fn),
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
        itemName="Bosch SHPM65Z55N"
        itemUnitId="item-1"
        brand="Bosch"
        model="SHPM65Z55N"
        manuals={manuals}
        onManualUpdated={() => {}}
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
    // Pasted, as the lane says. (ManualStep swaps the panel for its "Manual
    // link added" card on the first character, so it cannot be typed into
    // key by key — ManualStep's own behaviour, rendered unmodified here.)
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
