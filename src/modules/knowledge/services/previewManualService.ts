import { supabase } from "@/integrations/shim/client"
import type { PreviewResult } from "../types/previewTypes"

export type PreviewManualResult = PreviewResult | { ok: false; error: string }

export async function previewManual(manualId: string): Promise<PreviewManualResult> {
  const { data, error } = await supabase.functions.invoke("preview-manual", {
    body: { manual_id: manualId },
  })

  if (error) {
    const msg = typeof data?.error === "string" ? data.error : error.message
    return { ok: false, error: msg }
  }

  if (data?.ok === true && Array.isArray(data.chunks) && Array.isArray(data.tasks)) {
    return { ok: true, chunks: data.chunks, tasks: data.tasks }
  }

  return { ok: false, error: typeof data?.error === "string" ? data.error : "Preview failed" }
}
