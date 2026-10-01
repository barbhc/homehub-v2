/**
 * The bottom-sheet manual viewer — FindManualCard's "check the model on the
 * cover" preview.
 *
 * Its state used to be driven by three effects and a "skip the next render"
 * ref (H5, react-hooks/set-state-in-effect): an open-reset effect, a render on
 * open, and a render on page change that the ref told to skip once. Now the
 * open-reset and what can be shown at once are decided in the render that asks
 * (useDepsChanged), and ONE effect draws the page state says is showing. The
 * renderer moved to renderSheetPage.ts, mocked here. Pinned:
 *  - opening shows "Rendering page N…", then the page, with the page count as
 *    soon as the PDF is loaded;
 *  - the FIRST page turn after opening draws the new page (the skip-ref is
 *    gone — it could swallow it);
 *  - a page drawn before shows at once, with no spinner;
 *  - a page that will not draw says so, with the link out;
 *  - a cited page outside the PDF lands on the page it has.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"

const r = vi.hoisted(() => ({
  cached: new Map<string, { blobUrl: string; totalPages: number | null }>(),
  render: vi.fn(),
}))
vi.mock("./renderSheetPage", () => ({
  cachedSheetPage: (url: string, page: number) => r.cached.get(`${url}::${page}`) ?? null,
  isCachedSheetBlob: () => true,
  renderSheetPage: (...a: unknown[]) => r.render(...a),
}))

const { ManualPageSheet } = await import("./ManualPageSheet")

const PDF = "https://example.test/levoit-core-300.pdf"
const CAPTION = "Levoit Core 300 — check the model on the cover matches your unit"

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

function Sheet({ open = true, pageNumber = 1 }: { open?: boolean; pageNumber?: number }) {
  return <ManualPageSheet open={open} onOpenChange={vi.fn()} pdfUrl={PDF} pageNumber={pageNumber} caption={CAPTION} />
}

const pageImage = (n: number) => screen.queryByAltText(`Manual page ${n} — ${CAPTION}`)

describe("ManualPageSheet", () => {
  beforeEach(() => {
    r.cached.clear()
    r.render.mockReset()
    // By default: the PDF has 20 pages; drawing page N gives blob:pN.
    r.render.mockImplementation(async (_url: string, page: number, doc: { current: unknown }, onPages: (n: number) => void) => {
      if (!doc.current) { doc.current = { numPages: 20 }; onPages(20) }
      return { blobUrl: `blob:p${page}`, page, totalPages: 20 }
    })
  })

  it("still learns the page count when the user moved on before the PDF finished loading", async () => {
    // The first draw loads the PDF but is left behind: it never reports back.
    r.render.mockImplementationOnce((_u: string, _p: number, doc: { current: unknown }) => {
      doc.current = { numPages: 30 }
      return new Promise(() => {})
    })
    r.render.mockImplementation(async (_url: string, page: number) => ({ blobUrl: `blob:p${page}`, page, totalPages: 30 }))
    render(<Sheet />)
    expect(screen.getByText("Rendering page 1...")).toBeInTheDocument()

    fireEvent.change(screen.getByTitle("Jump to page number"), { target: { value: "2" } })
    await waitFor(() => expect(pageImage(2)).toHaveAttribute("src", "blob:p2"))
    expect(screen.getAllByText("of 30").length).toBeGreaterThan(0)
  })

  it("opens on the spinner, shows the page count once the PDF loads, then the page", async () => {
    const draw = deferred<{ blobUrl: string; page: number }>()
    r.render.mockImplementationOnce((_u: string, _p: number, doc: { current: unknown }, onPages: (n: number) => void) => {
      doc.current = { numPages: 56 }
      // The PDF arrives (a tick later), the page is still being drawn.
      void Promise.resolve().then(() => onPages(56))
      return draw.promise
    })
    render(<Sheet />)

    expect(screen.getByText("Rendering page 1...")).toBeInTheDocument()
    await waitFor(() => expect(screen.getAllByText("of 56").length).toBeGreaterThan(0))
    expect(pageImage(1)).toBeNull()

    await act(async () => { draw.resolve({ blobUrl: "blob:p1", page: 1 }) })
    expect(pageImage(1)).toHaveAttribute("src", "blob:p1")
    expect(screen.queryByText("Rendering page 1...")).toBeNull()
  })

  it("the first page turn after opening draws the new page", async () => {
    render(<Sheet />)
    await waitFor(() => expect(pageImage(1)).not.toBeNull())

    fireEvent.click(screen.getByTitle("Next page"))
    await waitFor(() => expect(pageImage(2)).toHaveAttribute("src", "blob:p2"))
    expect(r.render).toHaveBeenLastCalledWith(PDF, 2, expect.anything(), expect.any(Function))
  })

  it("a page drawn before shows at once, with no spinner", async () => {
    r.cached.set(`${PDF}::1`, { blobUrl: "blob:cached-1", totalPages: 20 })
    r.render.mockImplementation(() => new Promise(() => {})) // never needed
    render(<Sheet />)
    expect(pageImage(1)).toHaveAttribute("src", "blob:cached-1")
    expect(screen.queryByText(/Rendering page/)).toBeNull()
    expect(screen.getAllByText("of 20").length).toBeGreaterThan(0)
  })

  it("a page that will not draw says so, and still offers the PDF", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    r.render.mockRejectedValue(new Error("InvalidPDFException: Invalid PDF structure"))
    render(<Sheet />)
    await waitFor(() => expect(screen.getByText("This PDF won't preview here")).toBeInTheDocument())
    expect(screen.getByRole("link", { name: /Open full PDF/ })).toHaveAttribute("href", `${PDF}#page=1`)
  })

  it("a cited page past the end lands on the last page the PDF has", async () => {
    r.render.mockImplementation(async (_url: string, page: number, doc: { current: unknown }, onPages: (n: number) => void) => {
      if (!doc.current) { doc.current = { numPages: 12 }; onPages(12) }
      const real = Math.min(page, 12)
      return { blobUrl: `blob:p${real}`, page: real, totalPages: 12 }
    })
    render(<Sheet pageNumber={40} />)
    await waitFor(() => expect(pageImage(12)).toHaveAttribute("src", "blob:p12"))
    expect(screen.getByText(/Manual — Page 12/)).toBeInTheDocument()
  })
})
