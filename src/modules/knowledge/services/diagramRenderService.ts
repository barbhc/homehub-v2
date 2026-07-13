import { pdfProxySource } from "@/integrations/firebase"
import { uploadDiagramImage } from "@/modules/inventory/services/storageService"
import { updateChunkDiagramUrls } from "./knowledgeService"
import { updateTaskDiagramUrls } from "@/modules/care/services/taskService"
import type { DiagramImageUrl, DiagramPageRef } from "@/integrations/types"


export interface DiagramTarget {
  id: string // chunk_id or task_template_id
  type: "chunk" | "task"
  diagram_pages: DiagramPageRef[]
}

function getUniquePages(targets: DiagramTarget[]): number[] {
  const set = new Set<number>()
  for (const t of targets) {
    for (const p of t.diagram_pages) set.add(p.page)
  }
  return Array.from(set).sort((a, b) => a - b)
}

async function canvasToJpegBlob(canvas: HTMLCanvasElement, quality = 0.85): Promise<Blob> {
  return await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (!b) reject(new Error("Failed to convert diagram canvas to blob"))
        else resolve(b)
      },
      "image/jpeg",
      quality,
    )
  })
}

export async function renderAndStoreDiagrams(
  homeId: string,
  pdfUrl: string,
  manualId: string,
  targets: DiagramTarget[],
): Promise<void> {
  const nonEmptyTargets = targets.filter((t) => (t.diagram_pages?.length ?? 0) > 0)
  if (nonEmptyTargets.length === 0) return

  // pdfjs-dist: 1-based pages
  const uniquePages = getUniquePages(nonEmptyTargets)

  // Lazy-load pdfjs and its worker so the 2.1MB worker stays out of the main bundle.
  const pdfjsLib = await import("pdfjs-dist")
  const { default: pdfWorkerUrl } = await import("pdfjs-dist/build/pdf.worker.mjs?url")
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

  const pdf = await pdfjsLib.getDocument(await pdfProxySource(pdfUrl)).promise

  const pageUrlMap = new Map<number, string>()

  for (const pageNum of uniquePages) {
    const page = await pdf.getPage(pageNum)

    const baseViewport = page.getViewport({ scale: 1 })
    const scale = 1024 / baseViewport.width
    const viewport = page.getViewport({ scale })

    const canvas = document.createElement("canvas")
    canvas.width = viewport.width
    canvas.height = viewport.height

    const ctx = canvas.getContext("2d")
    if (!ctx) throw new Error("Failed to get diagram canvas context")

    await page.render({ canvasContext: ctx, viewport }).promise

    const blob = await canvasToJpegBlob(canvas)
    const result = await uploadDiagramImage(manualId, pageNum, blob)
    if (result.error) throw new Error(result.error.message)

    pageUrlMap.set(pageNum, result.data!.url)
  }

  for (const target of nonEmptyTargets) {
    const imageUrls: DiagramImageUrl[] = target.diagram_pages
      .map((p) => {
        const url = pageUrlMap.get(p.page)
        if (!url) return null
        return { url, page: p.page, caption: p.caption }
      })
      .filter((x): x is DiagramImageUrl => x !== null)

    if (target.type === "chunk") {
      await updateChunkDiagramUrls(homeId, manualId, target.id, imageUrls)
    } else {
      await updateTaskDiagramUrls(homeId, target.id, imageUrls)
    }
  }
}

