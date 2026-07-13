// Shared PDF page → PNG blob renderer for the manual viewers. Extracted so the
// bottom-sheet (ManualPageSheet) and the resizable dock (ManualDockPanel) share
// one implementation. Renders at high resolution so zooming stays crisp; the
// display size is controlled by CSS in the viewer.

import { pdfProxySource } from "@/integrations/firebase"

const pageBlobCache = new Map<string, string>()
const totalPagesCache = new Map<string, number>()
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pdfDocCache = new Map<string, any>()

function cacheKey(url: string, page: number): string {
  return `${url}::${page}`
}

export type RenderedPage = { blobUrl: string; totalPages: number; page: number }

/** Renders one PDF page to a cached PNG blob URL. Clamps the page to range. */
export async function renderManualPage(pdfUrl: string, page: number): Promise<RenderedPage> {
  let pdf = pdfDocCache.get(pdfUrl)
  if (!pdf) {
    const pdfjsLib = await import("pdfjs-dist")
    const { default: pdfWorkerUrl } = await import("pdfjs-dist/build/pdf.worker.mjs?url")
    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl
    pdf = await pdfjsLib.getDocument(await pdfProxySource(pdfUrl)).promise
    pdfDocCache.set(pdfUrl, pdf)
  }

  const totalPages = pdf.numPages as number
  totalPagesCache.set(pdfUrl, totalPages)
  const safePage = Math.max(1, Math.min(page, totalPages))

  const key = cacheKey(pdfUrl, safePage)
  const cached = pageBlobCache.get(key)
  if (cached) return { blobUrl: cached, totalPages, page: safePage }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfPage = (await pdf.getPage(safePage)) as any
  const baseViewport = pdfPage.getViewport({ scale: 1 })
  // Render at up to ~2048px wide so magnifying stays sharp.
  const scale = Math.min(2048, Math.max(1200, window.innerWidth * 2)) / baseViewport.width
  const viewport = pdfPage.getViewport({ scale })

  const canvas = document.createElement("canvas")
  canvas.width = viewport.width
  canvas.height = viewport.height
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Could not get canvas 2d context")
  await pdfPage.render({ canvasContext: ctx, viewport }).promise

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Canvas toBlob failed"))), "image/png")
  })
  const url = URL.createObjectURL(blob)
  pageBlobCache.set(key, url)
  return { blobUrl: url, totalPages, page: safePage }
}
