import { useEffect, useRef, useState } from "react"
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
import { useDepsChanged } from "@/hooks/useDepsChanged"
import { cachedSheetPage, isCachedSheetBlob, renderSheetPage, type LoadedSheetPdf } from "./renderSheetPage"

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
  const pdfDocRef = useRef<LoadedSheetPdf | null>(null)

  const fullPdfLink = pdfUrl ? `${pdfUrl}#page=${currentPage}` : undefined

  // Reset state when sheet opens with a new page — in the render that opens
  // it, so the stale image never paints first.
  const opening = useDepsChanged([open, pageNumber]) && open
  if (opening) {
    setBlobUrl(null) // Clear stale image immediately
    setCurrentPage(pageNumber)
    setSaved(false)
  }
  // The page this render is about: the one just opened to, or the one the
  // controls moved to.
  const page = opening ? pageNumber : currentPage

  // What can be shown for that page at once is decided here, in the render
  // that asks for it — and every time the sheet opens, even onto the page it
  // already holds: a page drawn before shows straight away; anything else
  // shows the spinner while the effect below draws it.
  if ((useDepsChanged([open, pdfUrl, page], { onMount: true }) || opening) && open) {
    const cached = pdfUrl ? cachedSheetPage(pdfUrl, page) : null
    if (!pdfUrl) {
      setError("No PDF URL provided")
    } else if (cached) {
      setBlobUrl(cached.blobUrl)
      // Also restore total pages from cache if available
      if (cached.totalPages) setTotalPages(cached.totalPages)
    } else {
      setLoading(true)
      setError(null)
      setBlobUrl(null)
    }
  }

  // Draw the page on screen. One effect for opening and for the controls: the
  // page it draws is the page state says is showing. `pageNumber` is a
  // dependency it does not read: a new cited page re-draws even when the
  // controls were already on that page, as opening always has.
  useEffect(() => {
    if (!open || !pdfUrl) return
    let cancelled = false
    renderSheetPage(pdfUrl, currentPage, pdfDocRef, (n) => {
      if (!cancelled) setTotalPages(n)
    })
      .then((r) => {
        if (cancelled) return
        localBlobsRef.current.add(r.blobUrl)
        setBlobUrl(r.blobUrl)
        // Also here, not only when the PDF loads: a load the user navigated
        // away from never got to say how many pages there are.
        if (r.totalPages != null) setTotalPages(r.totalPages)
        // Clamped to the PDF's range: show the page it actually has.
        if (r.page !== currentPage) setCurrentPage(r.page)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        console.error("[ManualPageSheet] render failed:", err)
        setError(
          err instanceof Error ? err.message : "Failed to render PDF page"
        )
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, pdfUrl, currentPage, pageNumber])

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
        if (!isCachedSheetBlob(url)) {
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
            // HH-108: this said "This is the current reference page" even when
            // no caller had set one — FindManualCard opens this sheet to VET a
            // search result, so the sentence was about a task's manual
            // reference the user does not have. Say nothing rather than
            // something untrue.
            <span className="text-[13px] text-muted-foreground">
              {onSetPage && currentPage === pageNumber
                ? "This is the current reference page"
                : ""}
            </span>
          )}

          <div className="flex items-center gap-2">
            {fullPdfLink && (
              <a
                href={fullPdfLink}
                target="_blank"
                rel="noopener noreferrer"
                title="Open the full PDF in a new tab"
                className="inline-flex h-11 items-center gap-1.5 px-3 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                Open PDF
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
            {/* The sheet is 88vh with no swipe-to-dismiss, so the shared close X
                was the ONLY exit. One more, where a thumb already is. */}
            <Button size="sm" onClick={() => onOpenChange(false)}>Done</Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
