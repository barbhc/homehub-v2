import { AlertTriangleIcon } from "lucide-react"

/**
 * Renders task/clean cautions (warnings split out of step prose) as a distinct
 * amber ⚠ callout. Shared across item-detail task cards, the cleaning session
 * checklist, and Deep Clean so warnings read as warnings, never as a step.
 */
export function CautionCallout({ cautions }: { cautions: string[] }) {
  if (cautions.length === 0) return null
  return (
    <div className="rounded-lg border border-amber-400/40 bg-amber-50/60 px-3 py-2.5 space-y-1.5 dark:bg-amber-950/15 dark:border-amber-700/40">
      {cautions.map((caution, i) => (
        <div key={i} className="flex gap-2 items-start">
          <AlertTriangleIcon className="size-3.5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-800 dark:text-amber-300 leading-snug">{caution}</p>
        </div>
      ))}
    </div>
  )
}
