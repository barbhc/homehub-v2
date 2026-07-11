import { Loader2Icon } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import type { ItemUnit } from "@/integrations/types"

interface RecallBannerProps {
  item: ItemUnit
  onCheckNow: () => void
  isChecking?: boolean
}

interface ParsedRecall {
  title?: string | null
  recall_number?: string | null
  date?: string | null
  url?: string | null
  hazard?: string | null
  remedy?: string | null
}

function parseRecallNotes(notes: string | null): ParsedRecall | null {
  if (!notes) return null
  try {
    return JSON.parse(notes) as ParsedRecall
  } catch {
    // Legacy plain-text format — extract URL and use text as title
    const urlMatch = notes.match(/https?:\/\/[^\s<>"{}|\\^`[\]]+/i)
    return { title: urlMatch ? notes.replace(urlMatch[0], "").trim() : notes, url: urlMatch?.[0] ?? null }
  }
}

function formatRecallDate(iso: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

export function RecallBanner({ item, onCheckNow, isChecking }: RecallBannerProps) {
  const { brand, model, recall_status, recall_notes, recall_checked_at } = item

  if (!brand && !model) return null

  const checkedDate = recall_checked_at ? formatRecallDate(recall_checked_at) : null

  if (recall_status === "found") {
    const recall = parseRecallNotes(recall_notes ?? null)
    return (
      <Alert variant="destructive" className="mb-4">
        <AlertTitle className="text-sm font-semibold">
          {recall?.recall_number ? `Recall #${recall.recall_number}` : "Active Recall Found"}
          {recall?.date ? ` · ${formatRecallDate(recall.date)}` : ""}
        </AlertTitle>
        <AlertDescription className="mt-1 space-y-1">
          {recall?.title && <p className="text-sm">{recall.title}</p>}
          {recall?.hazard && (
            <p className="text-xs opacity-80">Hazard: {recall.hazard}</p>
          )}
          {recall?.remedy && (
            <p className="text-xs opacity-80">Remedy: {recall.remedy}</p>
          )}
          {recall?.url && (
            <a
              href={recall.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium underline underline-offset-2 mt-1 inline-block"
            >
              View full recall on CPSC.gov →
            </a>
          )}
        </AlertDescription>
      </Alert>
    )
  }

  if (recall_status === "none_found") {
    return (
      <div className="flex items-center gap-3 mb-4">
        <p className="text-sm text-muted-foreground">
          ✓ No active recalls found
          {checkedDate && ` · checked ${checkedDate}`}
        </p>
        <Button
          variant="ghost"
          size="sm"
          onClick={onCheckNow}
          disabled={isChecking}
          className="gap-1.5 text-xs h-7 text-muted-foreground"
        >
          {isChecking && <Loader2Icon className="h-3 w-3 animate-spin" />}
          Re-check
        </Button>
      </div>
    )
  }

  // unknown — never checked or inconclusive
  return (
    <div className="flex items-center gap-2 mb-4">
      <span className="text-sm text-muted-foreground">Recall status unknown</span>
      <Button
        variant="outline"
        size="sm"
        onClick={onCheckNow}
        disabled={isChecking}
        className="gap-1.5"
      >
        {isChecking && <Loader2Icon className="h-3.5 w-3.5 animate-spin" aria-hidden />}
        {checkedDate ? "Re-check" : "Check now"}
      </Button>
    </div>
  )
}
