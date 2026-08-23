import { useCallback, useEffect, useRef, useState } from "react"
import {
  ChevronLeft,
  ChevronRight,
  Check,
  ExternalLink,
  Loader2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import { pdfProxySource } from "@/integrations/firebase"

interface ManualPageSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  pdfUrl: string
  pageNumber: number
  caption?: string
  /** Called when user corrects the page reference. If absent, "Set as reference" button is hidden. */
  onSetPage?: (newPage: number) => void
}

// ---------------------------------------------------------------------------
// Module-level cache: keyed by `${url}::${page}` -> blob URL
// ---------------------------------------------------------------------------
const pageBlobCache = new Map<string, string>()

function cacheKey(url: string, page: number): string {
  return `${url}::${page}`
}

// Cache for total page counts per PDF URL
const totalPagesCache = new Map<string, number>()

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function ManualPageSheet({
  open,
  onOpenChange,
  pdfUrl,
  pageNumber,
  caption,
  onSetPage,
}: ManualPageSheetProps) {
  const [currentPage, setCurrentPage] = useState(pageNumber)
  const [totalPages, setTotalPages] = useState<number | null>(null)
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  // Track blob URLs created during this mount so we can revoke non-cached ones
  const localBlobsRef = useRef<Set<string>>(new Set())
  // Keep a ref to the loaded PDF document for page navigation
  const pdfDocRef = useRef<{ getPage: (n: number) => Promise<unknown>; numPages: number } | null>(null)

  const fullPdfLink = pdfUrl ? `${pdfUrl}#page=${currentPage}` : undefined

  // Track whether the next currentPage change was triggered by the open
  // effect so we can skip the redundant render in the navigation effect.
  const skipNextNavRenderRef = useRef(false)

  // Reset state when sheet opens with a new page
  useEffect(() => {
    if (open) {
      setBlobUrl(null) // Clear stale image immediately
      skipNextNavRenderRef.current = true
      setCurrentPage(pageNumber)
      setSaved(false)
    }
  }, [open, pageNumber])

  // -----------------------------------------------------------------------
  // Render a single PDF page to a blob URL
  // -----------------------------------------------------------------------
  const renderPage = useCallback(
    async (page: number) => {
      if (!pdfUrl) {
        setError("No PDF URL provided")
        return
      }

      const key = cacheKey(pdfUrl, page)
      const cached = pageBlobCache.get(key)
      if (cached) {
        setBlobUrl(cached)
        // Also restore total pages from cache if available
        const cachedTotal = totalPagesCache.get(pdfUrl)
        if (cachedTotal) setTotalPages(cachedTotal)
        return
      }

      setLoading(true)
      setError(null)
      setBlobUrl(null)

      try {
        // Reuse already-loaded PDF doc, or load fresh
        let pdf = pdfDocRef.current
        if (!pdf) {
          const pdfjsLib = await import("pdfjs-dist")
          const { default: pdfWorkerUrl } = await import(
            "pdfjs-dist/build/pdf.worker.mjs?url"
          )
          pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          pdf = (await pdfjsLib.getDocument(await pdfProxySource(pdfUrl)).promise) as any
          pdfDocRef.current = pdf
        }

        if (pdf) {
          setTotalPages(pdf.numPages)
          totalPagesCache.set(pdfUrl, pdf.numPages)

          // Clamp page number to valid range
          const safePage = Math.max(1, Math.min(page, pdf.numPages))
          if (safePage !== page) {
            setCurrentPage(safePage)
          }

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const pdfPage = (await pdf.getPage(safePage)) as any
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
          localBlobsRef.current.add(url)
          setBlobUrl(url)
        }
      } catch (err) {
        console.error("[ManualPageSheet] render failed:", err)
        setError(
          err instanceof Error ? err.message : "Failed to render PDF page"
        )
      } finally {
        setLoading(false)
      }
    },
    [pdfUrl]
  )

  // Render the correct page when sheet opens (uses prop directly to avoid
  // stale-state race where currentPage hasn't updated yet).
  useEffect(() => {
    if (open) {
      renderPage(pageNumber)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- only on open/pageNumber change
  }, [open, pageNumber])

  // Re-render when user navigates to a different page via controls
  useEffect(() => {
    if (skipNextNavRenderRef.current) {
      skipNextNavRenderRef.current = false
      return
    }
    if (open) {
      renderPage(currentPage)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- only on user-initiated page change
  }, [currentPage])

  // Clear PDF doc ref when sheet closes to free memory
  useEffect(() => {
    if (!open) {
      pdfDocRef.current = null
    }
  }, [open])

  // Revoke blob URLs on unmount that are NOT in the module cache
  useEffect(() => {
    const blobs = localBlobsRef.current
    return () => {
      for (const url of blobs) {
        const stillCached = Array.from(pageBlobCache.values()).includes(url)
        if (!stillCached) {
          URL.revokeObjectURL(url)
        }
      }
    }
  }, [])

  const canGoPrev = currentPage > 1
  const canGoNext = totalPages ? currentPage < totalPages : true

  const handleSetPage = () => {
    if (onSetPage) {
      onSetPage(currentPage)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="h-[88vh] rounded-t-2xl flex flex-col"
      >
        <SheetHeader>
          <SheetTitle>
            Manual — Page {currentPage}
            {totalPages && (
              <span className="text-muted-foreground font-normal">
                {" "}
                of {totalPages}
              </span>
            )}
          </SheetTitle>
          {caption && <SheetDescription>{caption}</SheetDescription>}
        </SheetHeader>

        {/* Page navigation bar */}
        <div className="flex items-center justify-between gap-2 px-4 py-2 border-b">
          <Button
            size="icon-sm"
            variant="ghost"
            disabled={!canGoPrev || loading}
            onClick={() => setCurrentPage((p) => p - 1)}
            title="Previous page"
          >
            <ChevronLeft className="size-4" />
          </Button>

          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Page</span>
            <input
              type="number"
              min={1}
              max={totalPages ?? undefined}
              value={currentPage}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10)
                if (!isNaN(val) && val >= 1 && (!totalPages || val <= totalPages)) {
                  setCurrentPage(val)
                }
              }}
              className="w-14 h-11 md:h-8 text-center text-base md:text-sm font-medium border rounded-md bg-muted/30 focus:outline-none focus:ring-1 focus:ring-primary"
              title="Jump to page number"
            />
            {totalPages && (
              <span className="text-sm text-muted-foreground">
                of {totalPages}
              </span>
            )}
          </div>

          <Button
            size="icon-sm"
            variant="ghost"
            disabled={!canGoNext || loading}
            onClick={() => setCurrentPage((p) => p + 1)}
            title="Next page"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>

        {/* Scrollable image area — fit the whole page within the sheet (min-h-0
            lets the flex child shrink so max-h on the image is honored). */}
        <div className="flex-1 min-h-0 overflow-auto px-4 pb-2 flex items-start justify-center">
          {loading && (
            <div className="flex flex-col items-center justify-center gap-2 py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Rendering page {currentPage}...
              </p>
            </div>
          )}

          {error && !loading && (
            // "Invalid PDF structure." on its own is a true sentence that
            // leaves you nowhere — a tester hit it on the manual look-up and
            // reported it as a failure of the feature. The document is usually
            // fine; it is the in-page renderer that cannot cope, and it can
            // still be opened and attached.
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <p className="text-[15px] font-bold text-foreground">This PDF won&apos;t preview here</p>
              <p className="max-w-[34ch] text-[13px] text-muted-foreground">
                It still opens fine in a browser, and you can attach it either way.
              </p>
              {fullPdfLink && (
                <a
                  href={fullPdfLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Open the full PDF in a new tab"
                  className="inline-flex items-center gap-1 text-sm font-medium text-primary underline underline-offset-4 hover:text-primary/80"
                >
                  Open full PDF
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
          )}

          {blobUrl && !loading && (
            <img
              src={blobUrl}
              alt={`Manual page ${currentPage}${caption ? ` — ${caption}` : ""}`}
              className="max-h-full max-w-full w-auto object-contain rounded-lg shadow-sm"
            />
          )}
        </div>

        {/* Footer: Set reference + Open PDF.
            pb clears the home indicator — a tester reported the bottom row
            "too close to the bottom of the screen", which on a modern iPhone
            means it was sitting under the gesture bar. */}
        <div className="border-t px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] flex items-center justify-between gap-3">
          {onSetPage && currentPage !== pageNumber ? (
            <Button
              size="sm"
              variant="default"
              className="gap-1.5"
              onClick={handleSetPage}
              title={`Update this task's manual reference to page ${currentPage}`}
            >
              {saved ? (
                <>
                  <Check className="size-3.5" />
                  Saved
                </>
              ) : (
                <>Set page {currentPage} as reference</>
              )}
            </Button>
          ) : saved ? (
            <span className="flex items-center gap-1.5 text-sm text-[#2D9B82] font-medium">
              <Check className="size-3.5" />
              Reference updated to page {currentPage}
            </span>
          ) : (
            <span className="text-[13px] text-muted-foreground">
              {currentPage === pageNumber
                ? "This is the current reference page"
                : ""}
            </span>
          )}

          {fullPdfLink && (
            <a
              href={fullPdfLink}
              target="_blank"
              rel="noopener noreferrer"
              title="Open the full PDF in a new tab"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Open PDF
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
