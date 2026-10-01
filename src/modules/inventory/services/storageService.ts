import { ref, uploadBytes, deleteObject, getDownloadURL } from "firebase/storage"
import { doc, serverTimestamp, writeBatch } from "firebase/firestore"
import { storage, db, callable } from "@/integrations/firebase"
import { sha256Hex } from "@/lib/contentHash"

/** Max upload size in bytes. */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024 // 50 MB

export type UploadResult =
  | { data: { path: string }; error: null }
  | { data: null; error: { message: string } }

export type UploadWithUrlResult =
  | { data: { path: string; url: string }; error: null }
  | { data: null; error: { message: string } }

/** A manual upload: where it landed, and the SHA-256 of what was uploaded
 *  (null only where the browser could not hash it — see manualContentHash). */
export type ManualUploadResult =
  | { data: { path: string; contentHash: string | null }; error: null }
  | { data: null; error: { message: string } }

export type ManualUploadWithUrlResult =
  | { data: { path: string; url: string; contentHash: string | null }; error: null }
  | { data: null; error: { message: string } }

/** The custom-metadata key a manual upload carries its content hash under. */
export const MANUAL_HASH_METADATA_KEY = "sha256"

/**
 * HH-154: the identity a re-upload of the same PDF is recognised by. A missing
 * hash only costs the dedupe — never the upload — so a browser without Web
 * Crypto still attaches the manual, and says why it could not dedupe.
 */
async function manualContentHash(file: File): Promise<string | null> {
  try {
    return await sha256Hex(file)
  } catch (e) {
    console.warn("[storage] could not hash the manual; a re-upload of it will not be recognised:", e instanceof Error ? e.message : e)
    return null
  }
}

/**
 * Upload a PDF to Cloud Storage. Path:
 *   homes/{homeId}/manuals/{userId}/{itemId}/manual_{ts}.{ext}
 *
 * homeId leads the path so Storage rules can tenant-scope the READ on membership
 * of that home (storage.rules) — without it, no path family carried a homeId and
 * any signed-in user who learned a path could fetch the object. userId is still
 * REQUIRED: writes stay scoped to the caller's own uid segment.
 *
 * The file's SHA-256 is returned AND stamped on the object's custom metadata,
 * so createManualDocument can recognise the same PDF uploaded again (HH-154)
 * even from a caller that only hands it the path.
 */
export async function uploadManualPdf(
  homeId: string,
  itemId: string,
  file: File,
  userId?: string | null
): Promise<ManualUploadResult> {
  if (!userId) return { data: null, error: { message: "Not signed in." } }
  const ext = file.name.split(".").pop() || "pdf"
  const path = `homes/${homeId}/manuals/${userId}/${itemId}/manual_${Date.now()}.${ext}`
  const contentHash = await manualContentHash(file)
  try {
    await uploadBytes(ref(storage, path), file, {
      contentType: file.type || "application/pdf",
      ...(contentHash ? { customMetadata: { [MANUAL_HASH_METADATA_KEY]: contentHash } } : {}),
    })
    return { data: { path, contentHash }, error: null }
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
 * Upload an item photo and persist its path onto the item doc.
 * Path: homes/{homeId}/photos/{userId}/{itemId}/photo.{ext} — homeId leads so
 * reads are membership-scoped; userId is REQUIRED (writes stay uid-scoped).
 */
export async function uploadItemPhoto(
  homeId: string,
  itemId: string,
  file: File,
  userId?: string | null
): Promise<UploadWithUrlResult> {
  if (!userId) return { data: null, error: { message: "Not signed in." } }
  const ext = file.name.split(".").pop() ?? "jpg"
  const path = `homes/${homeId}/photos/${userId}/${itemId}/photo.${ext}`
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
 * Upload a receipt image or PDF.
 * Path: homes/{homeId}/receipts/{itemUnitId}/{ts}-{name} (no uid segment — the
 * v1 convention; reads are scoped by the leading homeId).
 */
export async function uploadReceiptImage(
  homeId: string,
  itemUnitId: string,
  file: File,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _userId?: string | null
): Promise<UploadResult> {
  const ext = file.name.split(".").pop() ?? "jpg"
  const basename = file.name.replace(/\.[^/.]+$/, "")
  const sanitized = basename.replace(/[^a-zA-Z0-9-]/g, "_").slice(0, 60) || "file"
  const path = `homes/${homeId}/receipts/${itemUnitId}/${Date.now()}-${sanitized}.${ext}`
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
  homeId: string,
  itemId: string,
  file: File,
  userId?: string | null
): Promise<ManualUploadWithUrlResult> {
  const result = await uploadManualPdf(homeId, itemId, file, userId)
  if (result.error) return result
  const { path, contentHash } = result.data
  try {
    return { data: { path, url: await getDownloadURL(ref(storage, path)), contentHash }, error: null }
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : "Upload failed" } }
  }
}

