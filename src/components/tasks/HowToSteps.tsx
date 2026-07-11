import { StepList } from "@/components/tasks/TaskHowTo"
import { CautionCallout } from "@/components/tasks/CautionCallout"
import { parseSteps } from "@/pages/item-detail/utils"
import { splitCautions } from "@/lib/cautions"

/**
 * The shared "how-to" block. Numbered, checkable steps with baked-in warnings
 * ("Do NOT use steel wool") pulled out of the step prose into a ⚠ caution
 * callout, plus an optional "You'll need" supplies row.
 *
 * Prefers the structured `steps` (from the task_template.steps column) and
 * falls back to parsing `notes` (instructions_override) so it works for every
 * task. Used by the Home "See how" panels and the full task view so both
 * render an identical, designed how-to — never a raw instruction paragraph.
 */
export function HowToSteps({
  notes,
  steps: structuredSteps,
  supplies,
  stepsLabel = "Steps",
}: {
  notes: string | null
  steps: string[] | null
  supplies?: string[]
  /** Header above the step list; pass "" to hide it (e.g. when the surrounding
   *  card already has a numbered section heading). */
  stepsLabel?: string
}) {
  const raw = structuredSteps?.length ? structuredSteps : notes ? parseSteps(notes) : []
  const { steps, cautions } = splitCautions(raw)
  const hasSupplies = !!supplies && supplies.length > 0
  if (steps.length === 0 && cautions.length === 0 && !hasSupplies) return null
  return (
    <div className="flex flex-col gap-3.5">
      {steps.length > 0 && <StepList steps={steps} label={stepsLabel} />}
      {cautions.length > 0 && <CautionCallout cautions={cautions} />}
      {hasSupplies && (
        <div>
          <div className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.5px]" style={{ color: "var(--hh-sub)" }}>You&apos;ll need</div>
          <div className="flex flex-wrap gap-1.5">
            {supplies!.map((s, i) => (
              <span key={i} className="rounded-full px-2.5 py-1 text-[12.5px] font-semibold" style={{ background: "var(--hh-teal-wash)", color: "var(--hh-teal)" }}>{s}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
