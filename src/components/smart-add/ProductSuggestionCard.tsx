/**
 * ProductSuggestionCard — review panel for AI-generated spec candidates.
 *
 * Per adversarial review: we never silently apply numeric specs from Claude
 * (wattage, filter_size, MERV, dimensions). A hallucinated filter size could
 * cause a user to buy the wrong replacement part. Instead, we show each
 * suggestion as an explicit "Apply" chip the user must tap.
 *
 * "Applied" is DERIVED from the form's current value, never from a record of
 * which chips were tapped. The old version kept a separate `appliedCandidateKeys`
 * Set, which drifted the moment a suggestion landed on a key the form does not
 * render: a tester saw "Power (W) 700 ✓ Applied" sitting directly above a
 * Wattage field reading 1690. A label that describes a click instead of the
 * data is a label that can lie.
 */

import { Sparkles, Check, X } from "lucide-react"
import type { ProductLookupCandidate, KnowledgeConfidence } from "@/modules/inventory/services/productLookupService"
import { Button } from "@/components/ui/button"

type Props = {
  candidates: ProductLookupCandidate[]
  knowledgeConfidence: KnowledgeConfidence
  /** The form's CURRENT category-field values. "Applied" and "conflict" are both
   *  read from here, so the card can only ever describe what the form holds. */
  currentValues: Record<string, unknown>
  onApply: (c: ProductLookupCandidate) => void
  onRemove: (key: string) => void
  /** "Keep mine" — drop this one suggestion without touching the form value. */
  onDismissCandidate: (key: string) => void
  onDismiss: () => void
  loading?: boolean
}

/** Same-value comparison across the string/number boundary the form crosses:
 *  a number input yields "700", the suggestion carries 700. */
function sameValue(a: unknown, b: unknown): boolean {
  if (a == null || b == null) return false
  return String(a).trim() === String(b).trim()
}

function formatValue(v: string | number | boolean): string {
  if (typeof v === "boolean") return v ? "Yes" : "No"
  return String(v)
}

export function ProductSuggestionCard({
  candidates,
  knowledgeConfidence,
  currentValues,
  onApply,
  onRemove,
  onDismissCandidate,
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
            {/* States the SOURCE, not a confidence adjective. "High confidence"
                was the model's own self-report printed as fact — and it sat above
                a wrong wattage. What the user can actually act on is where the
                number came from and that nobody has checked it. */}
            <p className="text-xs text-amber-800/80 dark:text-amber-300/80 mt-0.5">
              Guessed from the brand and model by AI — not checked against the
              manufacturer.{" "}
              {knowledgeConfidence === "high"
                ? "Confirm before you buy parts."
                : "Treat as a starting point; confirm on the spec sheet."}
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
          const current = currentValues[c.key]
          const applied = sameValue(current, c.value)
          // The form already holds a DIFFERENT value for this field. Showing
          // both numbers and letting the user pick beats overwriting silently
          // (their value may be the correct one — it was, in the reported case).
          const conflict = !applied && current != null && String(current).trim() !== ""
          return (
            <li key={c.key} className="flex items-center gap-2 justify-between flex-wrap">
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-xs font-medium text-amber-900 dark:text-amber-200">
                    {c.label}
                  </span>
                  <span className="text-sm font-semibold text-foreground">{formatValue(c.value)}</span>
                </div>
                {conflict && (
                  <p className="text-xs text-amber-900 dark:text-amber-200 mt-0.5">
                    You have <b>{formatValue(current as string | number | boolean)}</b> — keep it or use{" "}
                    <b>{formatValue(c.value)}</b>?
                  </p>
                )}
                {/* Full rationale, wrapped. Truncating a citation mid-word
                    ("Ninja DZ201 product specifications li…") reads as a source
                    while being useless as one. */}
                {c.rationale && (
                  <p className="text-xs text-muted-foreground mt-0.5">{c.rationale}</p>
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
              ) : conflict ? (
                <span className="flex items-center gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => onDismissCandidate(c.key)}
                    className="text-muted-foreground"
                  >
                    Keep mine
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => onApply(c)}
                    className="gap-1 border-amber-400/60 text-amber-900 hover:bg-amber-100/50 dark:border-amber-600/60 dark:text-amber-200 dark:hover:bg-amber-900/20"
                  >
                    Use {formatValue(c.value)}
                  </Button>
                </span>
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
