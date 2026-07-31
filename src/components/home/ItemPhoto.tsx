import { useState, type ChangeEvent } from "react"
import { CameraIcon, Loader2Icon, SearchIcon, type LucideIcon } from "lucide-react"
import type { ItemUnit } from "@/integrations/types"
import { useAuth } from "@/modules/auth"
import { uploadItemPhoto } from "@/modules/inventory/services/storageService"
import { PhotoSearchSheet } from "@/components/inventory/PhotoSearchSheet"
import { useStorageUrl } from "@/hooks/useStorageUrl"
import { cn } from "@/lib/utils"

const INK = "var(--hh-ink)", TEAL = "var(--hh-teal)"
// Frosted surface so the controls stay legible over both the empty gradient and
// a real product photo.
const FROST = "color-mix(in srgb, var(--hh-surface) 92%, transparent)"

interface ItemPhotoProps {
  item: ItemUnit
  homeId: string
  /** Category glyph shown as the placeholder until a photo exists. */
  Glyph: LucideIcon
  /** Bubble the photo path change up so the page re-renders the new image. */
  onItemUpdate?: (item: ItemUnit) => void
  /** Outer tile classes — the caller owns size + shape. */
  className?: string
  /** Glyph size class for the empty-state placeholder. */
  glyphClassName?: string
  /**
   * How to render when there's no photo yet.
   *   "tile" — a full-size placeholder holding the photo's eventual footprint.
   *   "cta"  — a compact invitation the height of a row.
   * The item page uses "cta": a 150px empty block at the top of the page reads as
   * a broken image rather than as something you're being asked to add.
   */
  emptyVariant?: "tile" | "cta"
}

/**
 * Item photo tile with a working add / replace / search path, shared by the
 * mobile (RefinedItemDetail) and desktop (DesktopItemDetail) item views.
 *
 * Why this exists: the mobile "Add photo" button was inert markup — no input, no
 * handler — so a phone had no way to add a photo at all. The only working upload
 * lived in HeroCard, which now mounts only inside the desktop Edit dialog. This
 * tile carries HeroCard's handlePhotoSelect → uploadItemPhoto logic so both
 * views can add, replace, or search for a photo directly.
 *
 * Controls are always visible rather than hover-revealed: the primary target is
 * touch, where there is no hover to reveal them.
 */
export function ItemPhoto({ item, homeId, Glyph, onItemUpdate, className, glyphClassName, emptyVariant = "tile" }: ItemPhotoProps) {
  const { user } = useAuth()
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)

  const photoUrl = useStorageUrl(item.photo_storage_ref)

  const handlePhotoSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    setUploading(true)
    const res = await uploadItemPhoto(homeId, item.item_unit_id, file, user?.id ?? null)
    setUploading(false)
    e.target.value = "" // allow re-selecting the same file after an error
    if (res.error) {
      setError(res.error.message)
      return
    }
    if (res.data) onItemUpdate?.({ ...item, photo_storage_ref: res.data.path })
  }

  // Brand + model make the best product-image query; fall back to the name.
  const searchQuery = [item.brand, item.model].filter(Boolean).join(" ").trim() || item.display_name || ""

  const photoSearch = (
    <PhotoSearchSheet
      open={searchOpen}
      onOpenChange={setSearchOpen}
      defaultQuery={searchQuery}
      homeId={homeId}
      itemId={item.item_unit_id}
      userId={user?.id}
      onPhotoSaved={(path) => onItemUpdate?.({ ...item, photo_storage_ref: path })}
    />
  )

  // Compact empty state: an invitation sized like the row it is, not a slab of
  // nothing where a photo should be.
  if (!photoUrl && emptyVariant === "cta") {
    return (
      <>
        <div
          className="flex items-center gap-3 rounded-2xl border-[1.5px] border-dashed px-3.5 py-3"
          style={{ borderColor: "color-mix(in srgb, var(--hh-teal) 35%, var(--hh-line2))", background: "color-mix(in srgb, var(--hh-teal-wash) 55%, transparent)" }}
        >
          <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
            <input type="file" accept="image/*" className="hidden" onChange={handlePhotoSelect} disabled={uploading} />
            <span className="grid size-9 shrink-0 place-items-center rounded-xl" style={{ background: "var(--hh-surface)" }}>
              {uploading
                ? <Loader2Icon className="size-[17px] animate-spin" style={{ color: TEAL }} />
                : <CameraIcon className="size-[17px]" style={{ color: TEAL }} />}
            </span>
            <span className="min-w-0">
              <span className="block text-[14px] font-bold tracking-[-0.2px]" style={{ color: TEAL }}>
                {uploading ? "Uploading…" : "Add a photo"}
              </span>
              <span className="block text-[11.5px]" style={{ color: "var(--hh-sub)" }}>Makes this easier to spot in your item list</span>
            </span>
          </label>
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="shrink-0 rounded-full border px-2.5 py-1 text-[11.5px] font-bold"
            style={{ borderColor: TEAL, color: TEAL }}
          >
            Find one
          </button>
        </div>
        {error && <p className="mt-1.5 text-[11.5px] font-medium" style={{ color: "var(--hh-clay)" }} role="alert">{error}</p>}
        {photoSearch}
      </>
    )
  }

  return (
    <div
      className={cn("relative flex items-center justify-center overflow-hidden", className)}
      style={photoUrl ? { background: "#fff" } : { background: "linear-gradient(135deg,var(--hh-teal-wash),#DCE9E4)" }}
    >
      {photoUrl ? (
        <img src={photoUrl} alt={item.display_name} className="h-full w-full object-contain mix-blend-multiply" />
      ) : (
        // Empty state: the whole tile is the "add photo" target (touch-friendly).
        // Bottom padding keeps the centered glyph + caption clear of the corner
        // controls on the compact (132px) desktop tile.
        <label className="absolute inset-0 flex cursor-pointer flex-col items-center justify-center gap-1.5 pb-8">
          <input type="file" accept="image/*" className="hidden" onChange={handlePhotoSelect} disabled={uploading} />
          <Glyph className={cn("opacity-85", glyphClassName)} strokeWidth={1.3} style={{ color: TEAL }} />
          <span className="inline-flex items-center gap-1 text-[12px] font-semibold" style={{ color: INK }}>
            {uploading && <Loader2Icon className="size-3 animate-spin" />}
            {uploading ? "Uploading…" : "Add photo"}
          </span>
        </label>
      )}

      {/* Corner controls — search always; replace only once a photo exists. */}
      <div className="absolute bottom-2.5 right-2.5 z-10 flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          aria-label="Find a product photo"
          className="grid size-8 place-items-center rounded-full shadow-sm"
          style={{ background: FROST, color: INK }}
        >
          <SearchIcon className="size-[15px]" />
        </button>
        {photoUrl && (
          <label
            aria-label="Replace photo"
            className="grid size-8 cursor-pointer place-items-center rounded-full shadow-sm"
            style={{ background: FROST, color: INK }}
          >
            <input type="file" accept="image/*" className="hidden" onChange={handlePhotoSelect} disabled={uploading} />
            {uploading ? <Loader2Icon className="size-[15px] animate-spin" /> : <CameraIcon className="size-[15px]" />}
          </label>
        )}
      </div>

      {error && (
        <div
          className="absolute inset-x-2.5 top-2.5 z-10 rounded-lg px-2.5 py-1.5 text-[11.5px] font-medium"
          style={{ background: "var(--hh-clay-soft)", color: "var(--hh-clay)" }}
          role="alert"
        >
          {error}
        </div>
      )}

      {photoSearch}
    </div>
  )
}
