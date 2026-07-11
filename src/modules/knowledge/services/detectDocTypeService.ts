import { supabase } from "@/integrations/shim/client"

export type DocType = "manual" | "spec_sheet" | "install_guide" | "warranty" | "other"

export type ServiceResult<T> =
  | { data: T; error: null }
  | { data: null; error: { message: string } }

export type DocTypeResult = ServiceResult<{ docType: DocType; confidence: number; reason: string }>

/**
 * Classifies a manual PDF by manual_id (after upload + manual_document row exist).
 */
export async function detectDocType(manualId: string): Promise<DocTypeResult> {
  try {
    const { data: invokeData, error: invokeError } = await supabase.functions.invoke<{
      docType?: string
      confidence?: number
      reason?: string
      error?: string
    }>("detect-doc-type", {
      body: { manual_id: manualId },
    })

    if (invokeError) {
      return {
        data: { docType: "other", confidence: 0, reason: "Could not classify" },
        error: null,
      }
    }

    const data = invokeData ?? {}
    if (typeof data.error === "string" && data.error && !data.docType) {
      return {
        data: { docType: "other", confidence: 0, reason: "Could not classify" },
        error: null,
      }
    }

    const raw = data.docType ?? "other"
    const docType: DocType =
      raw === "manual" || raw === "spec_sheet" || raw === "install_guide" || raw === "warranty" || raw === "other"
        ? raw
        : "other"
    const confidence =
      typeof data.confidence === "number" && data.confidence >= 0 && data.confidence <= 1 ? data.confidence : 0
    const reason = typeof data.reason === "string" ? data.reason : "Could not classify"

    return { data: { docType, confidence, reason }, error: null }
  } catch {
    return {
      data: { docType: "other", confidence: 0, reason: "Could not classify" },
      error: null,
    }
  }
}
