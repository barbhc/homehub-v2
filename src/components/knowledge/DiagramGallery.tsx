import { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { ChevronLeft, ChevronRight, ZoomInIcon, ZoomOutIcon } from "lucide-react"
import type { DiagramImageUrl } from "@/integrations/types"
import { cn } from "@/lib/utils"
import { useResolvedDiagramImages } from "@/hooks/useStorageUrl"

export interface DiagramGalleryProps {
  images: DiagramImageUrl[]
  isLoading?: boolean
  className?: string
  variant?: "thumbnails" | "inline"
  /**
   * If provided, DiagramGallery becomes a controlled lightbox.
   * When `controlledImages` is non-empty, render only the overlay (no thumbnails).
   */
  controlledImages?: DiagramImageUrl[] | null
  onClose?: () => void
}

/** Shared lightbox overlay used in both controlled and inline modes */
function LightboxOverlay({
  images,
  activeIndex,
  onIndexChange,
  onClose,
}: {
  images: DiagramImageUrl[]
  activeIndex: number
  onIndexChange: (i: number) => void
  onClose: () => void
}) {
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const isPanningRef = useRef(false)
  const panStart = useRef({ x: 0, y: 0 })
  const lastPan = useRef({ x: 0, y: 0 })
  const imgRef = useRef<HTMLDivElement>(null)

  const activeImage = images[Math.max(0, Math.min(activeIndex, images.length - 1))]

  // Reset zoom/pan on image change
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }, [activeIndex])

  // Keyboard: Escape, arrow keys
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
      if (e.key === "ArrowRight" && images.length > 1) onIndexChange(Math.min(activeIndex + 1, images.length - 1))
      if (e.key === "ArrowLeft" && images.length > 1) onIndexChange(Math.max(activeIndex - 1, 0))
      if (e.key === "+" || e.key === "=") setZoom((z) => Math.min(z + 0.25, 4))
      if (e.key === "-") setZoom((z) => Math.max(z - 0.25, 0.5))
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [activeIndex, images.length, onClose, onIndexChange])

  // Scroll-wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY < 0 ? 0.15 : -0.15
    setZoom((z) => Math.max(0.5, Math.min(4, z + delta)))
  }

  // Pointer drag for pan when zoomed
  const handlePointerDown = (e: React.PointerEvent) => {
    if (zoom <= 1) return
    isPanningRef.current = true
    setIsPanning(true)
    panStart.current = { x: e.clientX - lastPan.current.x, y: e.clientY - lastPan.current.y }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isPanningRef.current) return
    const newPan = { x: e.clientX - panStart.current.x, y: e.clientY - panStart.current.y }
    lastPan.current = newPan
    setPan(newPan)
  }
  const handlePointerUp = () => { isPanningRef.current = false; setIsPanning(false) }

  const resetZoom = () => { setZoom(1); setPan({ x: 0, y: 0 }); lastPan.current = { x: 0, y: 0 }; isPanningRef.current = false; setIsPanning(false) }

  if (!activeImage) return null

  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center"
      role="dialog"
      aria-modal="true"
      onClick={() => { if (zoom <= 1) onClose() }}
    >
      {/* Toolbar */}
      <div
        className="absolute top-4 right-4 flex items-center gap-2 z-10"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => setZoom((z) => Math.min(z + 0.25, 4))}
          className="rounded-full bg-white/10 hover:bg-white/20 p-2 transition"
          aria-label="Zoom in"
        >
          <ZoomInIcon className="size-4 text-white" />
        </button>
        <button
          type="button"
          onClick={() => setZoom((z) => Math.max(z - 0.25, 0.5))}
          className="rounded-full bg-white/10 hover:bg-white/20 p-2 transition"
          aria-label="Zoom out"
        >
          <ZoomOutIcon className="size-4 text-white" />
        </button>
        {zoom !== 1 && (
          <button
            type="button"
            onClick={resetZoom}
            className="rounded-full bg-white/10 hover:bg-white/20 px-3 py-1.5 text-xs text-white transition"
            aria-label="Reset zoom"
          >
            {Math.round(zoom * 100)}% · Reset
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="rounded-full bg-white/10 hover:bg-white/20 px-3 py-1.5 text-xs text-white transition ml-2"
          aria-label="Close"
        >
          ✕ Close
        </button>
      </div>

      {/* Image container */}
      <div
        ref={imgRef}
        className="overflow-hidden flex items-center justify-center"
        style={{ width: "90vw", height: "80vh", cursor: zoom > 1 ? "grab" : "default" }}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={activeImage.url}
          alt={activeImage.caption || `Diagram page ${activeImage.page}`}
          draggable={false}
          style={{
            transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
            transformOrigin: "center center",
            transition: isPanning ? "none" : "transform 0.15s ease",
            maxWidth: "100%",
            maxHeight: "100%",
            objectFit: "contain",
          }}
          className="rounded-lg select-none"
        />
      </div>

      {/* Caption */}
      {activeImage.caption && (
        <div className="text-white/70 text-sm mt-2 text-center px-4" onClick={(e) => e.stopPropagation()}>
          {activeImage.caption}
        </div>
      )}

      {/* Prev/next nav */}
      {images.length > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onIndexChange(Math.max(activeIndex - 1, 0)) }}
            disabled={activeIndex === 0}
            className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-white/10 hover:bg-white/20 p-2 transition disabled:opacity-20"
            aria-label="Previous diagram"
          >
            <ChevronLeft className="size-6 text-white" />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onIndexChange(Math.min(activeIndex + 1, images.length - 1)) }}
            disabled={activeIndex === images.length - 1}
            className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-white/10 hover:bg-white/20 p-2 transition disabled:opacity-20"
            aria-label="Next diagram"
          >
            <ChevronRight className="size-6 text-white" />
          </button>
        </>
      )}

      {/* Thumbnails */}
      {images.length > 1 && (
        <div className="mt-3 flex gap-2 overflow-x-auto max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
          {images.map((img, idx) => (
            <button
              key={img.url}
              type="button"
              onClick={() => onIndexChange(idx)}
              className={cn(
                "shrink-0 ring-1 rounded-md overflow-hidden hover:ring-primary transition",
                idx === activeIndex ? "ring-primary" : "ring-white/20",
              )}
              aria-label={`Show diagram page ${img.page}`}
            >
              <img src={img.url} alt={img.caption || `Page ${img.page}`} loading="lazy" className="w-14 h-14 object-cover" />
            </button>
          ))}
        </div>
      )}

      {/* Zoom hint */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-white/30 text-xs pointer-events-none select-none">
        Scroll to zoom · drag to pan when zoomed
      </div>
    </div>,
    document.body,
  )
}

export function DiagramGallery({
  images,
  isLoading = false,
  className,
  variant = "thumbnails",
  controlledImages,
  onClose,
}: DiagramGalleryProps) {
  const isControlled = controlledImages !== undefined
  // Persisted diagram URLs from before the no-public-read Storage rules are
  // tokenless — swap them for token URLs a plain <img> can fetch.
  const resolvedImages = useResolvedDiagramImages(images)
  const resolvedControlled = useResolvedDiagramImages(controlledImages)
  const openImages = isControlled ? (controlledImages ? resolvedControlled : null) : null

  // Deduplicate by URL — multiple chunks can reference the same PDF page
  const dedupedImages = useMemo(
    () => resolvedImages.filter((img, i, arr) => arr.findIndex((x) => x.url === img.url) === i),
    [resolvedImages]
  )

  const [internalLightboxImages, setInternalLightboxImages] = useState<DiagramImageUrl[] | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const [inlineIndex, setInlineIndex] = useState(0)

  const lightboxImages = isControlled ? openImages : internalLightboxImages

  useEffect(() => {
    if (!lightboxImages || lightboxImages.length === 0) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActiveIndex(0)
  }, [lightboxImages])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setInlineIndex(0)
  }, [dedupedImages])

  const handleClose = () => {
    if (isControlled) onClose?.()
    else setInternalLightboxImages(null)
  }

  // Controlled lightbox mode
  if (isControlled) {
    const shouldShow = lightboxImages && lightboxImages.length > 0
    if (!shouldShow) return null
    if (typeof document === "undefined") return null

    return (
      <LightboxOverlay
        images={lightboxImages}
        activeIndex={activeIndex}
        onIndexChange={setActiveIndex}
        onClose={handleClose}
      />
    )
  }

  // ── Inline variant ─────────────────────────────────────────────────────────
  if (variant === "inline") {
    if (isLoading && dedupedImages.length === 0) {
      return <div className={cn("w-full h-48 rounded-lg bg-muted animate-pulse", className)} />
    }
    if (!dedupedImages || dedupedImages.length === 0) return null

    const currentImage = dedupedImages[Math.max(0, Math.min(inlineIndex, dedupedImages.length - 1))]

    return (
      <>
        <div className={cn("relative w-full", className)}>
          <img
            src={currentImage.url}
            alt={currentImage.caption || `Diagram page ${currentImage.page}`}
            className="w-full rounded-lg object-contain bg-muted/30 max-h-48 sm:max-h-72 cursor-pointer"
            onClick={() => {
              setInternalLightboxImages(dedupedImages)
              setActiveIndex(inlineIndex)
            }}
          />
          {dedupedImages.length > 1 && (
            <>
              <button
                type="button"
                onClick={() => setInlineIndex((i) => Math.max(0, i - 1))}
                disabled={inlineIndex === 0}
                className="absolute left-1 top-1/2 -translate-y-1/2 rounded-full bg-background/80 p-0.5 hover:bg-background transition disabled:opacity-30"
                aria-label="Previous diagram"
              >
                <ChevronLeft className="size-5 text-muted-foreground" />
              </button>
              <button
                type="button"
                onClick={() => setInlineIndex((i) => Math.min(dedupedImages.length - 1, i + 1))}
                disabled={inlineIndex === dedupedImages.length - 1}
                className="absolute right-1 top-1/2 -translate-y-1/2 rounded-full bg-background/80 p-0.5 hover:bg-background transition disabled:opacity-30"
                aria-label="Next diagram"
              >
                <ChevronRight className="size-5 text-muted-foreground" />
              </button>
            </>
          )}
        </div>
        <div className="flex items-center justify-center gap-1 mt-1.5 text-xs text-muted-foreground">
          {currentImage.caption && <span>{currentImage.caption}</span>}
          {dedupedImages.length > 1 && (
            <span>{currentImage.caption ? " · " : ""}{inlineIndex + 1} / {dedupedImages.length}</span>
          )}
        </div>

        {internalLightboxImages && internalLightboxImages.length > 0 && typeof document !== "undefined" && (
          <LightboxOverlay
            images={internalLightboxImages}
            activeIndex={activeIndex}
            onIndexChange={setActiveIndex}
            onClose={handleClose}
          />
        )}
      </>
    )
  }

  // ── Thumbnails variant (default) ───────────────────────────────────────────
  if (isLoading && dedupedImages.length === 0) {
    return <div className={cn("w-20 h-20 rounded-md bg-muted animate-pulse", className)} />
  }

  if (!dedupedImages || dedupedImages.length === 0) return null

  return (
    <>
      <div className={cn("flex gap-2 overflow-x-auto", className)}>
        {dedupedImages.map((img) => (
          <button
            key={img.url}
            type="button"
            onClick={() => { setInternalLightboxImages([img]); setActiveIndex(0) }}
            className="flex flex-col items-center shrink-0"
          >
            <img
              src={img.url}
              alt={img.caption || `Diagram page ${img.page}`}
              className="w-20 h-20 rounded-md object-cover ring-1 ring-border cursor-pointer hover:ring-primary transition"
            />
            <div className="text-xs text-muted-foreground text-center max-w-[80px] truncate mt-1">
              {img.caption || `Page ${img.page}`}
            </div>
          </button>
        ))}
      </div>

      {internalLightboxImages && internalLightboxImages.length > 0 && typeof document !== "undefined" && (
        <LightboxOverlay
          images={internalLightboxImages}
          activeIndex={activeIndex}
          onIndexChange={setActiveIndex}
          onClose={handleClose}
        />
      )}
    </>
  )
}
