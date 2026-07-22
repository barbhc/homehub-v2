/**
 * Downscale an image File before it goes over the wire. Phone camera photos
 * run 4–12MB; the OCR callable's payload ceiling is ~10MB (base64 inflates by
 * ~33%) and Vision/Claude read a nameplate fine at ≤1600px on the long edge —
 * full-resolution uploads are all cost and latency, no accuracy.
 */

/** Fit (width, height) inside a maxDim square, preserving aspect ratio. */
export function fitWithin(
  width: number,
  height: number,
  maxDim: number
): { width: number; height: number } {
  if (width <= maxDim && height <= maxDim) return { width, height }
  const scale = maxDim / Math.max(width, height)
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

/**
 * Resize + re-encode to JPEG. Returns the ORIGINAL file when decoding fails
 * (unsupported format, corrupt data) or when re-encoding wouldn't help — the
 * caller can always safely send whatever comes back.
 */
export async function downscaleImage(
  file: File,
  opts?: { maxDim?: number; quality?: number }
): Promise<File> {
  const maxDim = opts?.maxDim ?? 1600
  const quality = opts?.quality ?? 0.8
  let bitmap: ImageBitmap
  try {
    // from-image applies the EXIF orientation so portrait phone shots don't
    // reach Vision/Claude sideways.
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" })
  } catch {
    return file
  }
  try {
    const alreadySmall = bitmap.width <= maxDim && bitmap.height <= maxDim
    const { width, height } = fitWithin(bitmap.width, bitmap.height, maxDim)
    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext("2d")
    if (!ctx) return file
    ctx.drawImage(bitmap, 0, 0, width, height)
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality)
    )
    if (!blob) return file
    // Re-encoding a small, already-compressed image can inflate it.
    if (alreadySmall && blob.size >= file.size) return file
    const base = file.name.replace(/\.\w+$/, "") || "label"
    return new File([blob], `${base}.jpg`, { type: "image/jpeg" })
  } finally {
    bitmap.close()
  }
}
