/**
 * OCR service — extracts brand, model, etc. from appliance label images.
 * Calls the ocr Supabase Edge Function (Google Vision API).
 * TODO: Implement when ocr edge function is configured.
 */

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
}

export type OcrResult =
  | { data: OcrExtraction; error: null }
  | { data: null; error: { message: string } }

import { callable } from "@/integrations/firebase"

const ocrCallable = callable<{ image: string }, OcrExtraction & { error?: string }>("ocr")

/** Reads the file → base64 → the `ocr` Cloud Function (Vision + Claude). */
export async function extractFromImage(file: File): Promise<OcrResult> {
  try {
    const reader = new FileReader()
    const base64 = await new Promise<string>((resolve, reject) => {
      reader.onload = () => resolve(((reader.result as string) ?? "").split(",")[1] ?? "")
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(file)
    })

    const data = await ocrCallable({ image: base64 })
    if (data?.error) return { data: null, error: { message: data.error } }
    return { data: data as OcrExtraction, error: null }
  } catch (err) {
    const message = err instanceof Error ? err.message : "OCR failed"
    return { data: null, error: { message } }
  }
}
