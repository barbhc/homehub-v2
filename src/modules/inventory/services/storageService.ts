import { supabase } from "@/integrations/shim/client"

const MANUALS_BUCKET = "Manuals"

/** Max upload size in bytes — must match the Supabase bucket file_size_limit */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024 // 50 MB

export type UploadResult =
  | { data: { path: string }; error: null }
  | { data: null; error: { message: string } }

export type UploadWithUrlResult =
  | { data: { path: string; url: string }; error: null }
  | { data: null; error: { message: string } }

/**
 * Upload a PDF to the manuals bucket.
 * Path: {userId}/{itemId}/manual_{timestamp}.pdf (or {itemId}/manual_{timestamp}.pdf if no userId)
 * Note: Create the "manuals" bucket in Supabase Dashboard. Use userId for user-scoped storage policies.
 */
export async function uploadManualPdf(
  itemId: string,
  file: File,
  userId?: string | null
): Promise<UploadResult> {
  const ext = file.name.split(".").pop() || "pdf"
  const path = userId
    ? `${userId}/${itemId}/manual_${Date.now()}.${ext}`
    : `${itemId}/manual_${Date.now()}.${ext}`

  const { error } = await supabase.storage
    .from(MANUALS_BUCKET)
    .upload(path, file, {
      contentType: file.type || "application/pdf",
      upsert: true,
    })

  if (error) return { data: null, error: { message: error.message } }
  return { data: { path }, error: null }
}

/**
 * Remove a previously uploaded manual PDF from storage.
 * Safe to call on an already-missing path (resolves with error null).
 */
export async function removeManualPdf(
  path: string
): Promise<{ data: true; error: null } | { data: null; error: { message: string } }> {
  const { error } = await supabase.storage.from(MANUALS_BUCKET).remove([path])
  if (error) return { data: null, error: { message: error.message } }
  return { data: true, error: null }
}

/**
 * Build the public URL for a file in the manuals bucket.
 * Format: https://[project].supabase.co/storage/v1/object/public/Manuals/[path]
 * The manuals bucket must be PUBLIC in Supabase Dashboard.
 */
function getManualsPublicUrl(path: string): string {
  const base = import.meta.env.VITE_SUPABASE_URL
  if (!base) return ""
  const clean = base.replace(/\/$/, "")
  return `${clean}/storage/v1/object/public/${MANUALS_BUCKET}/${path.replace(/^\//, "")}`
}

/**
 * Upload an item photo (any image) to the Manuals bucket under photos/.
 * Stores at photos/{userId}/{itemId}/photo.{ext} (or photos/{itemId}/photo.{ext}).
 * Returns the public URL. The Manuals bucket must be PUBLIC.
 */
export async function uploadItemPhoto(
  itemId: string,
  file: File,
  userId?: string | null
): Promise<UploadWithUrlResult> {
  const ext = file.name.split(".").pop() ?? "jpg"
  const path = userId
    ? `photos/${userId}/${itemId}/photo.${ext}`
    : `photos/${itemId}/photo.${ext}`

  const { error } = await supabase.storage
    .from(MANUALS_BUCKET)
    .upload(path, file, {
      contentType: file.type || "image/jpeg",
      upsert: true,
    })

  if (error) return { data: null, error: { message: error.message } }

  await supabase
    .from("item_unit")
    .update({ photo_storage_ref: path })
    .eq("item_unit_id", itemId)

  return { data: { path, url: getManualsPublicUrl(path) }, error: null }
}

// ---------------------------------------------------------------------------
// Product image search
// ---------------------------------------------------------------------------

export interface ProductImageCandidate {
  title: string
  thumbnailUrl: string
  imageUrl: string
  sourceUrl: string
}

/**
 * Search for product images via Brave Web Search (edge function).
 */
export async function searchProductImages(
  query: string,
  count = 8
): Promise<{ data: ProductImageCandidate[] | null; error: { message: string } | null }> {
  const { data, error } = await supabase.functions.invoke("search-product-images", {
    body: { query, count },
  })

  if (error) {
    // supabase.functions.invoke returns a generic message for non-2xx;
    // the actual error may be in `data` (the parsed response body)
    const msg = data?.error || error.message || "Search failed"
    return { data: null, error: { message: msg } }
  }
  if (!data?.ok) return { data: null, error: { message: data?.error ?? "Search failed" } }
  return { data: data.images ?? [], error: null }
}

/**
 * Download an image from a URL and upload it as the item photo.
 * Fetches the image client-side, then uploads via the standard photo upload path.
 */
export async function saveProductPhotoFromUrl(
  itemId: string,
  imageUrl: string,
  userId?: string | null
): Promise<UploadWithUrlResult> {
  try {
    const res = await fetch(imageUrl)
    if (!res.ok) return { data: null, error: { message: `Failed to fetch image (HTTP ${res.status})` } }

    const blob = await res.blob()
    const ext = imageUrl.match(/\.(jpe?g|png|webp|gif)/i)?.[1] ?? "jpg"
    const file = new File([blob], `product-photo.${ext}`, { type: blob.type || "image/jpeg" })

    return uploadItemPhoto(itemId, file, userId)
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : "Download failed" } }
  }
}

/**
 * Upload a receipt image or PDF to the Manuals bucket.
 * Path: receipts/{itemUnitId}/{timestamp}-{sanitizedFilename}
 */
export async function uploadReceiptImage(
  itemUnitId: string,
  file: File,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _userId?: string | null
): Promise<UploadResult> {
  const ext = file.name.split(".").pop() ?? "jpg"
  const basename = file.name.replace(/\.[^/.]+$/, "")
  const sanitized = basename.replace(/[^a-zA-Z0-9-]/g, "_").slice(0, 60) || "file"
  const path = `receipts/${itemUnitId}/${Date.now()}-${sanitized}.${ext}`

  const { error } = await supabase.storage
    .from(MANUALS_BUCKET)
    .upload(path, file, {
      contentType: file.type || "image/jpeg",
      upsert: true,
    })

  if (error) return { data: null, error: { message: error.message } }
  return { data: { path }, error: null }
}

/**
 * Upload a PDF and return a URL for fetching (e.g. for AI task generation).
 * Uses explicit public URL — the manuals bucket must be PUBLIC in Supabase Dashboard.
 * For private buckets, createSignedUrl would be needed but can fail when fetched from edge functions.
 */
export async function uploadManualPdfWithUrl(
  itemId: string,
  file: File,
  userId?: string | null
): Promise<UploadWithUrlResult> {
  const result = await uploadManualPdf(itemId, file, userId)
  if (result.error) return result

  const path = result.data!.path
  const url = getManualsPublicUrl(path)

  return {
    data: { path, url },
    error: null,
  }
}

/**
 * Upload a rendered PDF page as a JPEG diagram image.
 * Path: images/{manualId}/page_{pageNum}.jpg
 * Idempotent — re-renders overwrite safely.
 */
export async function uploadDiagramImage(
  manualId: string,
  pageNum: number,
  blob: Blob
): Promise<UploadWithUrlResult> {
  const path = `images/${manualId}/page_${pageNum}.jpg`
  const { error } = await supabase.storage
    .from(MANUALS_BUCKET)
    .upload(path, blob, { contentType: "image/jpeg", upsert: true })

  if (error) return { data: null, error: { message: error.message } }
  return { data: { path, url: getManualsPublicUrl(path) }, error: null }
}
