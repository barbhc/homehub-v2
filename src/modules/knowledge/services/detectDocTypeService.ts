import { callable } from "@/integrations/firebase"

export type DocType = "manual" | "spec_sheet" | "install_guide" | "warranty" | "other"

export type ServiceResult<T> =
  | { data: T; error: null }
  | { data: null; error: { message: string } }

export type DocTypeResult = ServiceResult<{ docType: DocType; confidence: number; reason: string }>

const detectDocTypeCallable = callable<
  { homeId: string; manualId: string },
  { docType?: string; confidence?: number; reason?: string }
>("detectDocType")

const NEUTRAL = { docType: "other" as DocType, confidence: 0, reason: "Could not classify" }

/**
 * Classifies a manual PDF (homes/{homeId}/manuals/{manualId}) via the
 * detectDocType Cloud Function. Degrades to a neutral "other" result on any
 * error — never surfaces a hard failure (v1 contract).
 */
export async function detectDocType(homeId: string, manualId: string): Promise<DocTypeResult> {
  try {
    const data = await detectDocTypeCallable({ homeId, manualId })
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
    return { data: NEUTRAL, error: null }
  }
}
