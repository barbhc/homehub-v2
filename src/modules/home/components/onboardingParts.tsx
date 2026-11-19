/**
 * Pieces the first minute's three screens share (D8): the step bar, the option
 * row, and the choices that replace the old profile questions.
 */
import { cn } from "@/lib/utils"

export const ONBOARDING_STEPS = 3

/** The three-segment bar and "Step n of 3". Not shown on the skip path's list. */
export function OnboardingSteps({ step }: { step: 1 | 2 | 3 }) {
  return (
    <div className="mb-8">
      <div className="mb-3 flex items-center gap-2" aria-hidden="true">
        {Array.from({ length: ONBOARDING_STEPS }).map((_, i) => (
          <div key={i} className={cn("h-1 flex-1 rounded-full", i < step ? "bg-primary" : "bg-muted")} />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Step {step} of {ONBOARDING_STEPS}</p>
    </div>
  )
}

export function OptionRow({ selected, onClick, label, hint, role, ariaChecked }: {
  selected: boolean
  onClick: () => void
  label: string
  hint?: string
  role: "radio" | "checkbox" | "button"
  ariaChecked?: boolean
}) {
  return (
    <button
      type="button"
      role={role}
      aria-checked={role === "button" ? undefined : ariaChecked}
      onClick={onClick}
      className={cn(
        "flex min-h-11 w-full flex-col justify-center rounded-xl border-2 px-4 py-3 text-left transition-colors",
        selected ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/40 hover:bg-muted/30",
      )}
    >
      <span className={cn("font-medium", selected && "text-primary")}>{label}</span>
      {hint && <span className="mt-0.5 text-sm text-muted-foreground">{hint}</span>}
    </button>
  )
}
