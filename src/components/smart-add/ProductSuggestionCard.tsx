/**
 * ProductSuggestionCard — review panel for AI-generated spec candidates.
 *
 * Per adversarial review: we never silently apply numeric specs from Claude
 * (wattage, filter_size, MERV, dimensions). A hallucinated filter size could
 * cause a user to buy the wrong replacement part. Instead, we show each
 * suggestion as an explicit "Apply" chip the user must tap.
 *
 * The parent (IdentifyStep) owns the "applied" set and applies/removes
 * category-field values in the form state as the user accepts/rejects.
 */

import { Sparkles, Check, X } from "lucide-react"
import type { ProductLookupCandidate, KnowledgeConfidence } from "@/modules/inventory/services/productLookupService"
import { Button } from "@/components/ui/button"

type Props = {
  candidates: ProductLookupCandidate[]
  knowledgeConfidence: KnowledgeConfidence
  /** Keys that have already been applied (show a "✓ applied" pill). */
  appliedKeys: Set<string>
  onApply: (c: ProductLookupCandidate) => void
  onRemove: (key: string) => void
  onDismiss: () => void
  loading?: boolean
}

function formatValue(v: string | number | boolean): string {
  if (typeof v === "boolean") return v ? "Yes" : "No"
  return String(v)
}

export function ProductSuggestionCard({
  candidates,
  knowledgeConfidence,
  appliedKeys,
  onApply,
  onRemove,
  onDismiss,
  loading,
}: Props) {
  if (loading) {
    return (
      <div
        className="rounded-xl border border-amber-300/60 bg-amber-50/60 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950/20 dark:text-amber-200 dark:border-amber-700/40"
        aria-busy="true"
      >
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 animate-pulse" aria-hidden />
          <span>Looking up specs…</span>
        </div>
      </div>
    )
  }

  if (candidates.length === 0) return null

  return (
    <div
      className="rounded-xl border border-amber-300/60 bg-amber-50/50 px-4 py-3 space-y-3 dark:bg-amber-950/20 dark:border-amber-700/40"
      aria-label="AI spec suggestions"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0">
          <Sparkles className="size-4 mt-0.5 text-amber-700 dark:text-amber-400 shrink-0" aria-hidden />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
              Suggested specs — please verify
            </p>
            <p className="text-xs text-amber-800/80 dark:text-amber-300/80 mt-0.5">
              AI-generated from brand + model.{" "}
              {knowledgeConfidence === "high"
                ? "High confidence."
                : knowledgeConfidence === "medium"
                  ? "Double-check before buying parts."
                  : "Low confidence — check manufacturer specs."}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="text-amber-700/80 hover:text-amber-900 dark:text-amber-400/80 dark:hover:text-amber-200 p-0.5 rounded shrink-0"
          aria-label="Dismiss suggestions"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>

      <ul className="space-y-2">
        {candidates.map((c) => {
          const applied = appliedKeys.has(c.key)
          return (
            <li key={c.key} className="flex items-center gap-2 justify-between flex-wrap">
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-xs font-medium text-amber-900 dark:text-amber-200">
                    {c.label}
                  </span>
                  <span className="text-sm font-semibold text-foreground">{formatValue(c.value)}</span>
                </div>
                {c.rationale && (
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{c.rationale}</p>
                )}
              </div>
              {applied ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => onRemove(c.key)}
                  className="gap-1 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100/50 dark:hover:bg-emerald-900/20"
                  title="Remove this suggestion"
                >
                  <Check className="size-3.5" aria-hidden />
                  Applied
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => onApply(c)}
                  className="gap-1 border-amber-400/60 text-amber-900 hover:bg-amber-100/50 dark:border-amber-600/60 dark:text-amber-200 dark:hover:bg-amber-900/20"
                >
                  Apply
                </Button>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
