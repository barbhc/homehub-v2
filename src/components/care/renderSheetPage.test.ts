/**
 * The bottom-sheet viewer's renderer (split out of ManualPageSheet in H5).
 *
 * Pinned: it loads a PDF once per open sheet and reports its page count when
 * it does; it clamps a page past the end; a page drawn once comes back from
 * the cache without loading anything; and a loaded PDF is reused only for the
 * URL it came from — a page is never drawn from another PDF and cached under
 * the wrong URL.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const pdfjs = vi.hoisted(() => ({ getDocument: vi.fn() }))
vi.mock("pdfjs-dist", () => ({ GlobalWorkerOptions: {}, getDocument: (...a: unknown[]) => pdfjs.getDocument(...a) }))
vi.mock("pdfjs-dist/build/pdf.worker.mjs?url", () => ({ default: "worker.js" }))
vi.mock("@/integrations/firebase", () => ({ pdfProxySource: async (url: string) => ({ url }) }))
vi.mock("@/lib/chunkRetry", () => ({ withChunkRetry: (fn: () => unknown) => fn() }))

const { renderSheetPage, cachedSheetPage } = await import("./renderSheetPage")
type Doc = Parameters<typeof renderSheetPage>[2]

/** A fake PDF of `numPages` pages; records which pages were drawn. */
function fakePdf(numPages: number) {
  const drawn: number[] = []
  return {
    drawn,
    pdf: {
      numPages,
      getPage: async (n: number) => ({
        getViewport: () => ({ width: 600, height: 800 }),
        render: () => { drawn.push(n); return { promise: Promise.resolve() } },
      }),
    },
  }
}

let blobs = 0
beforeEach(() => {
  pdfjs.getDocument.mockReset()
  HTMLCanvasElement.prototype.getContext = (() => ({})) as unknown as typeof HTMLCanvasElement.prototype.getContext
  HTMLCanvasElement.prototype.toBlob = function (cb: BlobCallback) { cb(new Blob(["png"])) }
  URL.createObjectURL = () => `blob:sheet-${++blobs}`
})

describe("renderSheetPage", () => {
  it("loads the PDF once, says how many pages it has, and draws from the loaded copy after that", async () => {
    const a = fakePdf(12)
    pdfjs.getDocument.mockReturnValue({ promise: Promise.resolve(a.pdf) })
    const doc: Doc = { current: null }
    const onPages = vi.fn()

    const p1 = await renderSheetPage("https://x.test/a.pdf", 1, doc, onPages)
    const p2 = await renderSheetPage("https://x.test/a.pdf", 2, doc, onPages)
    expect(pdfjs.getDocument).toHaveBeenCalledTimes(1)
    expect(onPages).toHaveBeenCalledTimes(1)
    expect(onPages).toHaveBeenCalledWith(12)
    expect(a.drawn).toEqual([1, 2])
    expect(p2).toMatchObject({ page: 2, totalPages: 12 })
    expect(p1.blobUrl).not.toBe(p2.blobUrl)
  })

  it("clamps a page past the end, and serves a page drawn before from the cache", async () => {
    const b = fakePdf(5)
    pdfjs.getDocument.mockReturnValue({ promise: Promise.resolve(b.pdf) })
    const doc: Doc = { current: null }

    const past = await renderSheetPage("https://x.test/b.pdf", 40, doc, vi.fn())
    expect(past.page).toBe(5)
    expect(b.drawn).toEqual([5])

    const again = await renderSheetPage("https://x.test/b.pdf", 40, { current: null }, vi.fn())
    expect(again.blobUrl).toBe(past.blobUrl)
    expect(pdfjs.getDocument).toHaveBeenCalledTimes(1)
    expect(cachedSheetPage("https://x.test/b.pdf", 40)).toEqual({ blobUrl: past.blobUrl, totalPages: 5 })
  })

  it("never draws one URL's page from another URL's PDF", async () => {
    const c = fakePdf(3)
    const d = fakePdf(9)
    pdfjs.getDocument
      .mockReturnValueOnce({ promise: Promise.resolve(c.pdf) })
      .mockReturnValueOnce({ promise: Promise.resolve(d.pdf) })
    const doc: Doc = { current: null }

    await renderSheetPage("https://x.test/c.pdf", 1, doc, vi.fn())
    const fromD = await renderSheetPage("https://x.test/d.pdf", 7, doc, vi.fn())
    expect(pdfjs.getDocument).toHaveBeenCalledTimes(2)
    expect(d.drawn).toEqual([7])
    expect(c.drawn).toEqual([1])
    expect(fromD).toMatchObject({ page: 7, totalPages: 9 })
  })
})
