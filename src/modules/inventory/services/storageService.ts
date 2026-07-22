import { ref, uploadBytes, deleteObject, getDownloadURL } from "firebase/storage"
import { doc, serverTimestamp, writeBatch } from "firebase/firestore"
import { storage, db, callable } from "@/integrations/firebase"

/** Max upload size in bytes. */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024 // 50 MB

export type UploadResult =
  | { data: { path: string }; error: null }
  | { data: null; error: { message: string } }

export type UploadWithUrlResult =
  | { data: { path: string; url: string }; error: null }
  | { data: null; error: { message: string } }

/**
 * Upload a PDF to Cloud Storage. Path (v1 convention preserved):
 *   {userId}/{itemId}/manual_{ts}.{ext}
 * userId is REQUIRED: storage rules scope manual writes to the caller's own
 * uid prefix, so the old unscoped `{itemId}/…` fallback would be denied anyway.
 */
export async function uploadManualPdf(
  itemId: string,
  file: File,
  userId?: string | null
): Promise<UploadResult> {
  if (!userId) return { data: null, error: { message: "Not signed in." } }
  const ext = file.name.split(".").pop() || "pdf"
  const path = `${userId}/${itemId}/manual_${Date.now()}.${ext}`
  try {
    await uploadBytes(ref(storage, path), file, { contentType: file.type || "application/pdf" })
    return { data: { path }, error: null }
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : "Upload failed" } }
  }
}

/**
 * Remove a previously uploaded object. Safe on an already-missing path.
 */
export async function removeManualPdf(
  path: string
): Promise<{ data: true; error: null } | { data: null; error: { message: string } }> {
  try {
    await deleteObject(ref(storage, path))
    return { data: true, error: null }
  } catch (e) {
    // object-not-found is a no-op success (matches v1's tolerant remove).
    const code = (e as { code?: string })?.code
    if (code === "storage/object-not-found") return { data: true, error: null }
    return { data: null, error: { message: e instanceof Error ? e.message : "Remove failed" } }
  }
}

/**
 * Upload an item photo under photos/ and persist its path onto the item doc.
 * Path: photos/{userId}/{itemId}/photo.{ext}. userId is REQUIRED (rules scope
 * photo writes to the caller's own uid prefix).
 */
export async function uploadItemPhoto(
  homeId: string,
  itemId: string,
  file: File,
  userId?: string | null
): Promise<UploadWithUrlResult> {
  if (!userId) return { data: null, error: { message: "Not signed in." } }
  const ext = file.name.split(".").pop() ?? "jpg"
  const path = `photos/${userId}/${itemId}/photo.${ext}`
  try {
    const objectRef = ref(storage, path)
    await uploadBytes(objectRef, file, { contentType: file.type || "image/jpeg" })
    // Persist the storage ref onto the item (v1 did this inside the upload).
    await writeBatch(db)
      .set(doc(db, `homes/${homeId}/items/${itemId}`), { photoPath: path, updatedAt: serverTimestamp() }, { merge: true })
      .commit()
    return { data: { path, url: await getDownloadURL(objectRef) }, error: null }
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : "Upload failed" } }
  }
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

const searchProductImagesCallable = callable<
  { query: string; count: number },
  { ok: boolean; images?: ProductImageCandidate[]; error?: string }
>("searchProductImages")

/**
 * Search for product images via the Brave Web Search Cloud Function (Phase 4).
 */
export async function searchProductImages(
  query: string,
  count = 8
): Promise<{ data: ProductImageCandidate[] | null; error: { message: string } | null }> {
  try {
    const res = await searchProductImagesCallable({ query, count })
    if (!res.ok) return { data: null, error: { message: res.error ?? "Search failed" } }
    return { data: res.images ?? [], error: null }
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : "Search failed" } }
  }
}

/**
 * Download an image from a URL client-side and upload it as the item photo.
 */
export async function saveProductPhotoFromUrl(
  homeId: string,
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
    return uploadItemPhoto(homeId, itemId, file, userId)
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : "Download failed" } }
  }
}

/**
 * Upload a receipt image or PDF. Path: receipts/{itemUnitId}/{ts}-{name}.
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
  try {
    await uploadBytes(ref(storage, path), file, { contentType: file.type || "image/jpeg" })
    return { data: { path }, error: null }
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : "Upload failed" } }
  }
}

/**
 * Upload a PDF and return its download URL (e.g. for the manual viewer).
 */
export async function uploadManualPdfWithUrl(
  itemId: string,
  file: File,
  userId?: string | null
): Promise<UploadWithUrlResult> {
  const result = await uploadManualPdf(itemId, file, userId)
  if (result.error) return result
  const path = result.data!.path
  try {
    return { data: { path, url: await getDownloadURL(ref(storage, path)) }, error: null }
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : "Upload failed" } }
  }
}

/**
 * Upload a rendered PDF page as a JPEG diagram image. Idempotent.
 * Path: images/{manualId}/page_{pageNum}.jpg
 */
export async function uploadDiagramImage(
  manualId: string,
  pageNum: number,
  blob: Blob
): Promise<UploadWithUrlResult> {
  const path = `images/${manualId}/page_${pageNum}.jpg`
  try {
    const objectRef = ref(storage, path)
    await uploadBytes(objectRef, blob, { contentType: "image/jpeg" })
    // Token URL — it gets PERSISTED into Firestore (diagram_image_urls) and must
    // stay renderable in a plain <img> under the no-public-read Storage rules.
    return { data: { path, url: await getDownloadURL(objectRef) }, error: null }
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : "Upload failed" } }
  }
}
