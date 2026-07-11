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

export async function extractFromImage(_file: File): Promise<OcrResult> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const { supabase } = await import("@/integrations/shim/client")
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY

  if (!supabaseUrl || !token) {
    return { data: null, error: { message: "OCR not configured" } }
  }

  try {
    const reader = new FileReader()
    const base64 = await new Promise<string>((resolve, reject) => {
      reader.onload = () => {
        const result = reader.result as string
        const base64 = result?.split(",")[1] ?? ""
        resolve(base64)
      }
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(_file)
    })

    const res = await fetch(`${supabaseUrl.replace(/\/$/, "")}/functions/v1/ocr`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ image: base64 }),
    })

    // Try to parse JSON; fall back to raw text so we don't mask the true error.
    const rawText = await res.text().catch(() => "")
    let data: (OcrExtraction & { error?: string }) | null = null
    try {
      data = rawText ? JSON.parse(rawText) as OcrExtraction & { error?: string } : null
    } catch {
      // Non-JSON body — keep rawText as the surfaced message.
    }

    if (!res.ok) {
      const body = data?.error ?? (rawText ? rawText.slice(0, 200) : "")
      const msg = body ? `OCR failed (HTTP ${res.status}): ${body}` : `OCR failed (HTTP ${res.status})`
      return { data: null, error: { message: msg } }
    }
    if (data?.error) {
      return { data: null, error: { message: data.error } }
    }
    if (!data) {
      return { data: null, error: { message: "OCR returned an empty response" } }
    }
    return { data: data as OcrExtraction, error: null }
  } catch (err) {
    const message = err instanceof Error ? err.message : "OCR failed"
    return { data: null, error: { message } }
  }
}
