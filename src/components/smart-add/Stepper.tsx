import { cn } from "@/lib/utils"
import type { WizardStep } from "@/lib/wizardSession"

const FULL_STEPS: { id: WizardStep; label: string }[] = [
  { id: "identify", label: "Add Item" },
  { id: "manual", label: "Add Manual" },
  { id: "parsing", label: "Reading" },
  { id: "review", label: "Review" },
  { id: "purchase", label: "Purchase" },
]

const SKIP_MANUAL_STEPS: { id: WizardStep; label: string }[] = [
  { id: "identify", label: "Add Item" },
  { id: "manual", label: "Add Manual" },
  { id: "plan", label: "Plan" },
  { id: "purchase", label: "Purchase" },
]

type StepperProps = {
  currentStep: WizardStep
  completedSteps: Set<WizardStep>
  className?: string
  /** Full flow (manual → parse → review) vs skip-manual → plan */
  mode?: "full" | "skip-manual"
}

export function Stepper({ currentStep, completedSteps, className, mode = "full" }: StepperProps) {
  const STEPS = mode === "full" ? FULL_STEPS : SKIP_MANUAL_STEPS
  const currentIdx = STEPS.findIndex((s) => s.id === currentStep)

  return (
    <nav aria-label="Progress" className={cn("w-full max-w-xl mx-auto", className)}>
      <ol className="flex items-center justify-between">
        {STEPS.map((step, i) => {
          const isActive = step.id === currentStep
          const isCompleted = completedSteps.has(step.id)
          const isPast = i < currentIdx

          return (
            <li key={step.id} className="flex flex-1 items-center last:flex-none">
              <div className="flex items-center gap-2 shrink-0">
                <span
                  className={cn(
                    "flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium shrink-0",
                    isActive && "bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2 ring-offset-background",
                    isCompleted && !isActive && "bg-primary/20 text-primary",
                    !isActive && !isCompleted && "bg-muted text-muted-foreground"
                  )}
                >
                  {isCompleted && !isActive ? "✓" : i + 1}
                </span>
                <span
                  className={cn(
                    "text-sm font-medium hidden sm:inline whitespace-nowrap",
                    isActive ? "text-foreground" : "text-muted-foreground"
                  )}
                >
                  {step.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={cn(
                    "h-0.5 flex-1 mx-2 min-w-[12px]",
                    isPast || isCompleted ? "bg-primary/30" : "bg-border"
                  )}
                  aria-hidden
                />
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
