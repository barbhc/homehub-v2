import { supabase } from "@/integrations/shim/client"
import type { PreviewChunk, PreviewTask } from "../types/previewTypes"

export type SaveManualParseResult =
  | { ok: true; chunks: number; tasks: number; taskTemplateIds: string[] }
  | { ok: false; error: string }

export async function saveManualParse(
  manualId: string,
  chunks: PreviewChunk[],
  tasks: PreviewTask[]
): Promise<SaveManualParseResult> {
  const { data, error } = await supabase.functions.invoke("save-parsed-manual", {
    body: { manual_id: manualId, chunks, tasks },
  })

  if (error) {
    return { ok: false, error: error.message }
  }

  if (data?.ok === true && typeof data.chunks === "number" && typeof data.tasks === "number") {
    const ids = Array.isArray(data.taskTemplateIds) ? data.taskTemplateIds : []
    return { ok: true, chunks: data.chunks, tasks: data.tasks, taskTemplateIds: ids }
  }

  const errMsg = typeof data?.error === "string" ? data.error : "Save failed"
  return { ok: false, error: errMsg }
}
