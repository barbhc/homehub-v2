/**
 * Settings → Export your data: one JSON file of the home's records.
 *
 * Moved from the one-page Settings (design/settings-your-home.md). The rule it
 * keeps: a read that failed is never exported as an empty list — the export is
 * refused and says so, rather than downloading a backup that is missing whole
 * sections. The manual list used to come from Settings' own Manuals card; this
 * page reads it with the rest, under the same rule.
 */
import { useCallback, useState } from "react"
import { DownloadIcon, Loader2Icon } from "lucide-react"
import { InlineError, SectionCard } from "@/components/layout"
import { CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useCurrentHome } from "@/modules/home"
import { getItemUnits } from "@/modules/items"
import { getTaskTemplates } from "@/modules/care"
import { getManualsByHome, getKnowledgeChunksByHome, getFaqsByHome } from "@/modules/knowledge"
import { localToday } from "../../../../shared/dates/calendar"

export function ExportPane() {
  const { home } = useCurrentHome()
  const homeId = home?.home_id ?? null
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  const handleExport = useCallback(async () => {
    if (!homeId) return
    setExporting(true)
    setExportError(null)
    try {
      const [itemsRes, tasksRes, chunksRes, faqsRes, manualsRes] = await Promise.all([
        getItemUnits(homeId),
        getTaskTemplates(homeId),
        getKnowledgeChunksByHome(homeId),
        getFaqsByHome(homeId),
        getManualsByHome(homeId),
      ])
      const reads = [["items", itemsRes], ["tasks", tasksRes], ["knowledge", chunksRes], ["saved answers", faqsRes], ["manuals", manualsRes]] as const
      const missing = reads.filter(([, r]) => r.error).map(([name]) => name)
      if (missing.length > 0) {
        console.warn(`[settings] export refused — could not read ${missing.join(", ")} (home ${homeId})`)
        setExportError("Couldn't export your data. Part of it couldn't be read. Check your connection and try again.")
        return
      }

      const data = {
        exported_at: new Date().toISOString(),
        items: itemsRes.data ?? [],
        tasks: tasksRes.data ?? [],
        knowledge: chunksRes.data ?? [],
        faqs: faqsRes.data ?? [],
        manuals: manualsRes.data ?? [],
      }

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
      const url = URL.createObjectURL(blob)
      const date = localToday()
      const a = document.createElement("a")
      a.href = url
      a.download = `homehub-export-${date}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      // A read that threw instead of answering with an error: same refusal, said.
      console.warn(`[settings] export failed (home ${homeId}):`, e instanceof Error ? e.message : e)
      setExportError("Couldn't export your data. Check your connection and try again.")
    } finally {
      setExporting(false)
    }
  }, [homeId])

  if (!homeId) return null
  return (
    <SectionCard>
      <CardContent className="p-4">
        <p className="text-sm text-muted-foreground mb-4">
          A JSON file of your items, task list, saved answers, manual list and the text read from your manuals.
          Not included yet: photos, receipts, manual files, and some household data such as task history and notes.
        </p>
        <Button
          variant="outline"
          size="sm"
          disabled={exporting}
          onClick={() => void handleExport()}
        >
          {exporting ? (
            <Loader2Icon className="size-4 mr-1.5 animate-spin" />
          ) : (
            <DownloadIcon className="size-4 mr-1.5" />
          )}
          {exporting ? "Exporting…" : "Export data (JSON)"}
        </Button>
        {exportError && <InlineError className="mt-3">{exportError}</InlineError>}
      </CardContent>
    </SectionCard>
  )
}
