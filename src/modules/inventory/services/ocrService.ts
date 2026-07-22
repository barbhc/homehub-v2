/**
 * OCR service — extracts brand, model, etc. from appliance label images via
 * the `ocr` Cloud Function (Google Vision text detection → Claude structured
 * extraction, with a Claude-vision fallback when Vision reads nothing).
 * Downscales before base64 so payloads stay ~100s of KB, not 10MB+ camera
 * originals (which exceed the callable limit and made the call die client-side).
 */

import * as Sentry from "@sentry/react"
import { FirebaseError } from "firebase/app"
import { callable } from "@/integrations/firebase"
import { downscaleImage } from "@/lib/downscaleImage"

export type OcrDocType = "nameplate" | "receipt" | "unknown"

export type OcrExtraction = {
  brand?: string | null
  model?: string | null
  name?: string | null
  serialNumber?: string | null
  category?: string | null
  purchaseDate?: string | null
  purchasePrice?: number | null
  docType?: OcrDocType
  confidence?: number
  /** Raw OCR text when Claude parsing failed (graceful degradation) */
  text?: string
  /** Present when Claude parsing failed but Vision OCR succeeded */
  parseWarning?: string
  /** Which engine produced the extraction (telemetry). */
  engine?: "vision" | "claude-vision"
}

export type OcrResult =
  | { data: OcrExtraction; error: null }
  | { data: null; error: { message: string } }

const ocrCallable = callable<{ image: string; mediaType?: string }, OcrExtraction & { error?: string }>("ocr")

/** True when the extraction carries nothing a form field could use. */
export function isEmptyOcrExtraction(r: OcrExtraction): boolean {
  return (
    !r.brand &&
    !r.model &&
    !r.name &&
    !r.serialNumber &&
    !r.category &&
    !r.purchaseDate &&
    r.purchasePrice == null
  )
}

function friendlyOcrError(err: unknown): string {
  if (err instanceof FirebaseError) {
    const code = err.code.replace(/^functions\//, "")
    // The quota message from the server is already user-facing.
    if (code === "resource-exhausted") return err.message
    if (code === "unauthenticated") return "Sign in to read labels from photos."
    if (code === "unavailable" || code === "internal" || code === "deadline-exceeded") {
      return "Couldn't read the label right now — check your connection and try again."
    }
  }
  return err instanceof Error ? err.message : "Couldn't read the label."
}

/** Reads the file → downscale → base64 → the `ocr` Cloud Function. */
export async function extractFromImage(file: File): Promise<OcrResult> {
  try {
    // Belt-and-braces: the caller (IdentifyStep) already downscales so it can
    // reuse the small file as the item photo; this guard keeps any future
    // caller from regressing to multi-MB payloads.
    const sendFile = file.size > 1_500_000 ? await downscaleImage(file) : file
    const reader = new FileReader()
    const base64 = await new Promise<string>((resolve, reject) => {
      reader.onload = () => resolve(((reader.result as string) ?? "").split(",")[1] ?? "")
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(sendFile)
    })

    const data = await ocrCallable({ image: base64, mediaType: sendFile.type || "image/jpeg" })
    if (data?.error) return { data: null, error: { message: data.error } }
    return { data: data as OcrExtraction, error: null }
  } catch (err) {
    Sentry.captureException(err, { tags: { feature: "ocr-label" } })
    return { data: null, error: { message: friendlyOcrError(err) } }
  }
}
