// The bottom-sheet manual viewer's renderer (ManualPageSheet): one PDF page to
// a PNG blob URL. Kept apart from the component so the sheet's state can be
// tested without pdf.js, and apart from renderManualPage (the dock's) because
// the sheet draws at its own, smaller resolution.

import { pdfProxySource } from "@/integrations/firebase"
import { withChunkRetry } from "@/lib/chunkRetry"

// Module-level caches outlive the sheet, so a page shown once reopens at once.
// Keyed by `${url}::${page}` -> blob URL
const pageBlobCache = new Map<string, string>()
// Total page counts per PDF URL
const totalPagesCache = new Map<string, number>()

function cacheKey(url: string, page: number): string {
  return `${url}::${page}`
}

export type SheetPdf = { getPage: (n: number) => Promise<unknown>; numPages: number }

/** A page already drawn this session — what the sheet can show without drawing. */
export function cachedSheetPage(pdfUrl: string, page: number): { blobUrl: string; totalPages: number | null } | null {
  const blobUrl = pageBlobCache.get(cacheKey(pdfUrl, page))
  return blobUrl ? { blobUrl, totalPages: totalPagesCache.get(pdfUrl) ?? null } : null
}

/** Is this blob URL still held by the cache (so must not be revoked)? */
export function isCachedSheetBlob(url: string): boolean {
  return Array.from(pageBlobCache.values()).includes(url)
}

/**
 * Draws `page` of `pdfUrl`, clamped to the PDF's range, and resolves with the
 * blob URL, the page actually drawn and the PDF's page count. A page already in
 * the cache resolves with it, without loading anything.
 *
 * `doc` holds the loaded PDF for the open sheet, so turning pages does not
 * reload it; when it has to be loaded, `onPages` hears the page count straight
 * away — before the page itself is drawn.
 */
export async function renderSheetPage(
  pdfUrl: string,
  page: number,
  doc: { current: SheetPdf | null },
  onPages: (totalPages: number) => void,
): Promise<{ blobUrl: string; page: number; totalPages: number | null }> {
  const key = cacheKey(pdfUrl, page)
  const cached = pageBlobCache.get(key)
  if (cached) return { blobUrl: cached, page, totalPages: totalPagesCache.get(pdfUrl) ?? null }

  // Reuse already-loaded PDF doc, or load fresh
  let pdf = doc.current
  if (!pdf) {
    // Reloads once when the deploy replaced these assets under the tab.
    pdf = await withChunkRetry(async () => {
      const pdfjsLib = await import("pdfjs-dist")
      const { default: pdfWorkerUrl } = await import(
        "pdfjs-dist/build/pdf.worker.mjs?url"
      )
      pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (await pdfjsLib.getDocument(await pdfProxySource(pdfUrl)).promise) as any
    }, "manual page sheet")
    doc.current = pdf
    onPages(pdf!.numPages)
  }
  totalPagesCache.set(pdfUrl, pdf!.numPages)

  // Clamp page number to valid range
  const safePage = Math.max(1, Math.min(page, pdf!.numPages))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfPage = (await pdf!.getPage(safePage)) as any
  const baseViewport = pdfPage.getViewport({ scale: 1 })
  const scale =
    Math.min(1536, window.innerWidth * 2) / baseViewport.width
  const viewport = pdfPage.getViewport({ scale })

  const canvas = document.createElement("canvas")
  canvas.width = viewport.width
  canvas.height = viewport.height

  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Could not get canvas 2d context")

  await pdfPage.render({ canvasContext: ctx, viewport }).promise

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) =>
        b ? resolve(b) : reject(new Error("Canvas toBlob failed")),
      "image/png"
    )
  })

  const url = URL.createObjectURL(blob)
  pageBlobCache.set(key, url)
  return { blobUrl: url, page: safePage, totalPages: pdf!.numPages }
}
