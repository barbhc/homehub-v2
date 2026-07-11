import { useCallback, useEffect, useState, type CSSProperties, type ReactNode, type PointerEvent as ReactPointerEvent } from "react"
import {
  ChevronLeft, ChevronRight, X, ZoomIn, ZoomOut, ExternalLink, Loader2, Check,
} from "lucide-react"

/**
 * Resizable split manual viewer (design option 4). Docks beside the item page —
 * a right panel on desktop, a bottom panel on mobile — so both stay visible and
 * scroll independently. A draggable divider on the panel's inner edge rebalances
 * the split; the page renders fit-to-width (readable) and zooms with −/+ (scroll
 * to pan when magnified). The parent pads its content by `size` so nothing hides
 * behind the panel.
 */
export function ManualDockPanel({
  open, onOpenChange, pdfUrl, pageNumber, isDesktop, size, onSizeChange, onSetPage,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  pdfUrl: string | null
  pageNumber: number
  /** True → dock to the right (width = size vw); false → dock to the bottom (height = size vh). */
  isDesktop: boolean
  size: number
  onSizeChange: (pct: number) => void
  /** When set, shows "Set as reference" to correct a chunk's cited page. */
  onSetPage?: (newPage: number) => void
}) {
  const [currentPage, setCurrentPage] = useState(pageNumber)
  const [totalPages, setTotalPages] = useState<number | null>(null)
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (open) { setCurrentPage(pageNumber); setZoom(1); setSaved(false) }
  }, [open, pageNumber])

  useEffect(() => {
    if (!open || !pdfUrl) return
    let cancelled = false
    setLoading(true); setError(false)
    import("./renderManualPage").then(({ renderManualPage }) =>
      renderManualPage(pdfUrl, currentPage)
    ).then((r) => {
      if (cancelled) return
      setBlobUrl(r.blobUrl); setTotalPages(r.totalPages)
      if (r.page !== currentPage) setCurrentPage(r.page)
    }).catch(() => { if (!cancelled) setError(true) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [open, pdfUrl, currentPage])

  // Drag the divider on the panel's inner edge to resize the split.
  const startResize = useCallback((e: ReactPointerEvent) => {
    e.preventDefault()
    const move = (ev: PointerEvent) => {
      if (isDesktop) {
        const pct = ((window.innerWidth - ev.clientX) / window.innerWidth) * 100
        onSizeChange(Math.max(25, Math.min(72, pct)))
      } else {
        const pct = ((window.innerHeight - ev.clientY) / window.innerHeight) * 100
        onSizeChange(Math.max(30, Math.min(85, pct)))
      }
    }
    const up = () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
      document.body.style.userSelect = ""
    }
    document.body.style.userSelect = "none"
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
  }, [isDesktop, onSizeChange])

  if (!open) return null

  const canPrev = currentPage > 1
  const canNext = totalPages ? currentPage < totalPages : true
  const fullPdfLink = pdfUrl ? `${pdfUrl}#page=${currentPage}` : undefined

  const panelStyle: CSSProperties = isDesktop
    ? { position: "fixed", top: 0, right: 0, bottom: 0, width: `${size}vw`, borderLeft: "1px solid var(--hh-line)" }
    : { position: "fixed", left: 0, right: 0, bottom: 0, height: `${size}vh`, borderTop: "1px solid var(--hh-line)" }

  const setPage = () => {
    onSetPage?.(currentPage); setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="z-[60] flex flex-col shadow-[0_-2px_24px_rgba(11,26,22,0.12)]" style={{ ...panelStyle, background: "var(--hh-surface)" }}>
      {/* Divider handle on the inner edge */}
      <div
        onPointerDown={startResize}
        role="separator"
        aria-orientation={isDesktop ? "vertical" : "horizontal"}
        aria-label="Resize manual panel"
        className={isDesktop
          ? "absolute inset-y-0 left-0 w-2 -translate-x-1/2 cursor-col-resize flex items-center justify-center"
          : "absolute inset-x-0 top-0 h-2 -translate-y-1/2 cursor-row-resize flex items-center justify-center"}
      >
        <span className="rounded-full" style={{ background: "var(--hh-line2)", ...(isDesktop ? { width: 3, height: 34 } : { width: 34, height: 3 }) }} />
      </div>

      {/* Header + toolbar */}
      <div className="flex items-center gap-2 border-b px-3 py-2" style={{ borderColor: "var(--hh-line)" }}>
        <span className="text-[13px] font-bold" style={{ color: "var(--hh-ink)" }}>
          Manual · p.{currentPage}{totalPages ? <span className="font-normal" style={{ color: "var(--hh-sub)" }}> of {totalPages}</span> : null}
        </span>
        <div className="flex items-center gap-0.5">
          <IconBtn label="Previous page" disabled={!canPrev || loading} onClick={() => setCurrentPage((p) => p - 1)}><ChevronLeft className="size-4" /></IconBtn>
          <IconBtn label="Next page" disabled={!canNext || loading} onClick={() => setCurrentPage((p) => p + 1)}><ChevronRight className="size-4" /></IconBtn>
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-0.5">
          <IconBtn label="Zoom out" disabled={zoom <= 1} onClick={() => setZoom((z) => Math.max(1, +(z - 0.25).toFixed(2)))}><ZoomOut className="size-4" /></IconBtn>
          <span className="w-10 text-center text-[12px] tabular-nums" style={{ color: "var(--hh-sub)" }}>{Math.round(zoom * 100)}%</span>
          <IconBtn label="Zoom in" disabled={zoom >= 3} onClick={() => setZoom((z) => Math.min(3, +(z + 0.25).toFixed(2)))}><ZoomIn className="size-4" /></IconBtn>
        </div>
        <IconBtn label="Close manual" onClick={() => onOpenChange(false)}><X className="size-4" /></IconBtn>
      </div>

      {/* Scrollable page — fit width at 100%, scroll to pan when zoomed */}
      <div className="flex-1 min-h-0 overflow-auto bg-[var(--hh-bg)] px-3 py-3">
        {loading && (
          <div className="flex flex-col items-center justify-center gap-2 py-16" style={{ color: "var(--hh-sub)" }}>
            <Loader2 className="size-7 animate-spin" /><span className="text-[13px]">Rendering page {currentPage}…</span>
          </div>
        )}
        {error && !loading && (
          <div className="flex flex-col items-center gap-3 py-16 text-center text-[13px]" style={{ color: "var(--hh-sub)" }}>
            Couldn&apos;t render this page.
            {fullPdfLink && <a href={fullPdfLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-bold" style={{ color: "var(--hh-teal)" }}>Open full PDF <ExternalLink className="size-3.5" /></a>}
          </div>
        )}
        {blobUrl && !loading && (
          <img
            src={blobUrl}
            alt={`Manual page ${currentPage}`}
            className="mx-auto rounded-lg shadow-sm"
            style={{ width: `${zoom * 100}%`, maxWidth: zoom === 1 ? "100%" : "none" }}
          />
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-3 border-t px-3 py-2" style={{ borderColor: "var(--hh-line)" }}>
        {onSetPage ? (
          <button type="button" onClick={setPage} className="inline-flex items-center gap-1.5 text-[12.5px] font-bold" style={{ color: "var(--hh-teal)" }}>
            {saved ? <><Check className="size-3.5" /> Saved</> : <>Set p.{currentPage} as reference</>}
          </button>
        ) : <span />}
        {fullPdfLink && (
          <a href={fullPdfLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold" style={{ color: "var(--hh-sub)" }}>
            Open PDF <ExternalLink className="size-3.5" />
          </a>
        )}
      </div>
    </div>
  )
}

function IconBtn({ children, label, onClick, disabled }: { children: ReactNode; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled}
      className="grid size-8 place-items-center rounded-[8px] disabled:opacity-40"
      style={{ color: "var(--hh-ink)" }}
    >
      {children}
    </button>
  )
}
