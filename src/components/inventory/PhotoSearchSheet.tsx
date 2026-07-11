import { useState } from "react"
import { ImageIcon, Loader2Icon, SearchIcon, CheckIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import {
  searchProductImages,
  saveProductPhotoFromUrl,
  type ProductImageCandidate,
} from "@/modules/inventory"

interface PhotoSearchSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultQuery: string
  itemId: string
  userId?: string | null
  onPhotoSaved: (path: string) => void
}

export function PhotoSearchSheet({
  open,
  onOpenChange,
  defaultQuery,
  itemId,
  userId,
  onPhotoSaved,
}: PhotoSearchSheetProps) {
  const [query, setQuery] = useState(defaultQuery)
  const [images, setImages] = useState<ProductImageCandidate[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [searched, setSearched] = useState(false)

  const handleSearch = async () => {
    if (!query.trim()) return
    setLoading(true)
    setError(null)
    setImages([])
    setSelectedIdx(null)
    setSearched(true)

    const result = await searchProductImages(query.trim())
    setLoading(false)

    if (result.error) {
      setError(result.error.message)
      return
    }
    setImages(result.data ?? [])
  }

  const handleSave = async () => {
    if (selectedIdx === null || !images[selectedIdx]) return
    setSaving(true)
    setError(null)

    const result = await saveProductPhotoFromUrl(
      itemId,
      images[selectedIdx].imageUrl,
      userId
    )
    setSaving(false)

    if (result.error) {
      setError(result.error.message)
      return
    }

    onPhotoSaved(result.data!.path)
    onOpenChange(false)
  }

  // Reset state when sheet opens
  const handleOpenChange = (open: boolean) => {
    if (open) {
      setQuery(defaultQuery)
      setImages([])
      setSelectedIdx(null)
      setError(null)
      setSearched(false)
    }
    onOpenChange(open)
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="bottom" className="h-[70vh] rounded-t-2xl flex flex-col">
        <SheetHeader>
          <SheetTitle>Find product photo</SheetTitle>
          <SheetDescription>Search for a product image to use as the item photo.</SheetDescription>
        </SheetHeader>

        {/* Search bar */}
        <div className="flex gap-2 px-4 py-3">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="e.g. Nespresso Vertuo Plus"
            className="flex-1"
          />
          <Button onClick={handleSearch} disabled={loading || !query.trim()} size="sm">
            {loading ? <Loader2Icon className="size-4 animate-spin" /> : <SearchIcon className="size-4" />}
          </Button>
        </div>

        {error && (
          <p className="text-sm text-destructive px-4">{error}</p>
        )}

        {/* Image grid */}
        <div className="flex-1 overflow-auto px-4 pb-2">
          {loading && (
            <div className="flex flex-col items-center justify-center gap-2 py-12">
              <Loader2Icon className="size-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Searching images...</p>
            </div>
          )}

          {!loading && searched && images.length === 0 && !error && (
            <div className="flex flex-col items-center justify-center gap-2 py-12">
              <ImageIcon className="size-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No images found. Try a different search.</p>
            </div>
          )}

          {!loading && images.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {images.map((img, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setSelectedIdx(i === selectedIdx ? null : i)}
                  className={`relative rounded-xl overflow-hidden border-2 transition-all aspect-square bg-white ${
                    selectedIdx === i
                      ? "border-primary ring-2 ring-primary/20 scale-[1.02]"
                      : "border-white/70 hover:border-primary/40"
                  }`}
                >
                  <img
                    src={img.thumbnailUrl || img.imageUrl}
                    alt={img.title}
                    className="w-full h-full object-contain p-1"
                    loading="lazy"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = ""
                      ;(e.target as HTMLImageElement).style.display = "none"
                    }}
                  />
                  {selectedIdx === i && (
                    <div className="absolute top-1.5 right-1.5 bg-primary text-primary-foreground rounded-full p-0.5">
                      <CheckIcon className="size-3.5" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {images.length > 0 && (
          <div className="border-t px-4 py-3 flex items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground">
              {selectedIdx !== null ? `Selected image ${selectedIdx + 1}` : "Tap an image to select"}
            </span>
            <Button
              onClick={handleSave}
              disabled={selectedIdx === null || saving}
              size="sm"
            >
              {saving && <Loader2Icon className="size-4 mr-2 animate-spin" />}
              Use as photo
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
