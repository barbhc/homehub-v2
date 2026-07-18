import { useState } from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  upsertHomeProfile,
  type HomeType,
  type Ownership,
  type OwnershipDuration,
  type PreferredMode,
  type Climate,
  type TopConcernKey,
} from "../services/homeProfileService"

type HomeProfileOnboardingProps = {
  homeId: string
  onComplete: () => void
  onSkip: () => void
  className?: string
}

const HOME_TYPE_OPTIONS: { value: HomeType; label: string; hint: string }[] = [
  { value: "house", label: "House", hint: "Single-family, detached" },
  { value: "condo", label: "Condo", hint: "Owned unit in a building" },
  { value: "townhouse", label: "Townhouse", hint: "Shared walls, own entrance" },
  { value: "apartment", label: "Apartment", hint: "Rented unit" },
  { value: "other", label: "Other", hint: "" },
]

const OWNERSHIP_OPTIONS: { value: Ownership; label: string }[] = [
  { value: "own", label: "I own it" },
  { value: "rent", label: "I rent it" },
]

const DURATION_OPTIONS: { value: OwnershipDuration; label: string }[] = [
  { value: "new_under_1yr", label: "Less than 1 year" },
  { value: "1_to_5yr", label: "1–5 years" },
  { value: "5_plus", label: "5+ years" },
]

const CONCERN_OPTIONS: { value: TopConcernKey; label: string; hint: string }[] = [
  { value: "surprise_repairs", label: "Avoiding surprise repairs", hint: "Catch issues before they break" },
  { value: "warranty_tracking", label: "Warranty tracking", hint: "Don't miss expiration windows" },
  { value: "seasonal_maintenance", label: "Seasonal maintenance", hint: "HVAC filters, gutter cleaning, etc." },
  { value: "saving_money", label: "Saving money on upkeep", hint: "DIY when possible, hire when not" },
  { value: "not_sure", label: "Not sure yet", hint: "I'm still figuring it out" },
]

const MODE_OPTIONS: { value: PreferredMode; label: string; hint: string }[] = [
  {
    value: "ask_first",
    label: "Ask-first",
    hint: "I usually come here when something's wrong and I need help",
  },
  {
    value: "inventory_first",
    label: "Inventory-first",
    hint: "I want to keep an organized record of what I own",
  },
  { value: "unset", label: "Not sure — show me both", hint: "Default Home with everything" },
]

const CLIMATE_OPTIONS: { value: Climate; label: string; hint: string }[] = [
  { value: "mild", label: "Mild", hint: "Rarely freezes — no winterizing needed" },
  { value: "moderate", label: "Moderate", hint: "Some frost in winter" },
  { value: "cold", label: "Cold", hint: "Hard freezes — pipes can burst" },
  { value: "hot", label: "Hot / arid", hint: "Hot summers, mild winters" },
]

/** Climate → whether pipes can freeze here. Drives winterizing suppression. */
function freezeRiskFor(climate: Climate | null): boolean | null {
  if (!climate) return null
  return climate === "mild" || climate === "hot" ? false : true
}

type Step = 0 | 1 | 2 | 3 | 4
const TOTAL_STEPS = 5

export function HomeProfileOnboarding({
  homeId,
  onComplete,
  onSkip,
  className,
}: HomeProfileOnboardingProps) {
  const [step, setStep] = useState<Step>(0)
  const [homeType, setHomeType] = useState<HomeType | null>(null)
  const [ownership, setOwnership] = useState<Ownership | null>(null)
  const [duration, setDuration] = useState<OwnershipDuration | null>(null)
  const [climate, setClimate] = useState<Climate | null>(null)
  const [concerns, setConcerns] = useState<TopConcernKey[]>([])
  const [mode, setMode] = useState<PreferredMode>("unset")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const toggleConcern = (key: TopConcernKey) => {
    setConcerns((prev) => {
      // "not_sure" is exclusive
      if (key === "not_sure") return prev.includes("not_sure") ? [] : ["not_sure"]
      const withoutNotSure = prev.filter((k) => k !== "not_sure")
      return withoutNotSure.includes(key)
        ? withoutNotSure.filter((k) => k !== key)
        : [...withoutNotSure, key]
    })
  }

  const canAdvance = (() => {
    if (step === 0) return homeType !== null
    if (step === 1) return ownership !== null && duration !== null
    if (step === 2) return climate !== null
    if (step === 3) return concerns.length > 0
    if (step === 4) return true // mode always has a value (default "unset")
    return false
  })()

  const save = async (markComplete: boolean) => {
    setSaving(true)
    setError(null)
    const result = await upsertHomeProfile(homeId, {
      home_type: homeType,
      ownership,
      ownership_duration: duration,
      climate,
      freeze_risk: freezeRiskFor(climate),
      top_concerns: concerns,
      preferred_mode: mode,
      completed_at: markComplete ? new Date().toISOString() : null,
    })
    setSaving(false)
    if (result.error) {
      setError(result.error.message)
      return false
    }
    return true
  }

  const handleNext = async () => {
    if (step < 4) {
      setStep((step + 1) as Step)
      return
    }
    const ok = await save(true)
    if (ok) onComplete()
  }

  const handleSkip = async () => {
    // Save whatever they filled in so partial answers aren't lost; mark incomplete.
    await save(false)
    onSkip()
  }

  return (
    <div className={cn("w-full max-w-lg mx-auto", className)}>
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <div
              key={i}
              className={cn(
                "h-1 flex-1 rounded-full transition-colors",
                i <= step ? "bg-primary" : "bg-muted",
              )}
              aria-hidden="true"
            />
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Step {step + 1} of {TOTAL_STEPS}
        </p>
      </div>

      {step === 0 && (
        <div>
          <h2 className="text-xl sm:text-2xl font-display font-normal mb-2">
            What kind of home is this?
          </h2>
          <p className="text-sm text-muted-foreground mb-6">
            Helps us suggest the right maintenance tasks.
          </p>
          <div className="space-y-2" role="radiogroup" aria-label="Home type">
            {HOME_TYPE_OPTIONS.map((opt) => (
              <OptionRow
                key={opt.value}
                selected={homeType === opt.value}
                onClick={() => setHomeType(opt.value)}
                label={opt.label}
                hint={opt.hint}
                role="radio"
                ariaChecked={homeType === opt.value}
              />
            ))}
          </div>
        </div>
      )}

      {step === 1 && (
        <div>
          <h2 className="text-xl sm:text-2xl font-display font-normal mb-2">
            Do you own or rent?
          </h2>
          <p className="text-sm text-muted-foreground mb-6">
            Renters see fewer long-term upkeep tasks and more "talk to your landlord" prompts.
          </p>
          <div className="space-y-2 mb-6" role="radiogroup" aria-label="Ownership">
            {OWNERSHIP_OPTIONS.map((opt) => (
              <OptionRow
                key={opt.value}
                selected={ownership === opt.value}
                onClick={() => setOwnership(opt.value)}
                label={opt.label}
                role="radio"
                ariaChecked={ownership === opt.value}
              />
            ))}
          </div>
          <p className="text-sm font-medium mb-2">How long have you lived here?</p>
          <div className="space-y-2" role="radiogroup" aria-label="Duration">
            {DURATION_OPTIONS.map((opt) => (
              <OptionRow
                key={opt.value}
                selected={duration === opt.value}
                onClick={() => setDuration(opt.value)}
                label={opt.label}
                role="radio"
                ariaChecked={duration === opt.value}
              />
            ))}
          </div>
        </div>
      )}

      {step === 2 && (
        <div>
          <h2 className="text-xl sm:text-2xl font-display font-normal mb-2">
            What's the climate where you live?
          </h2>
          <p className="text-sm text-muted-foreground mb-6">
            So we only schedule seasonal tasks that apply — a mild climate skips winterizing.
          </p>
          <div className="space-y-2" role="radiogroup" aria-label="Climate">
            {CLIMATE_OPTIONS.map((opt) => (
              <OptionRow
                key={opt.value}
                selected={climate === opt.value}
                onClick={() => setClimate(opt.value)}
                label={opt.label}
                hint={opt.hint}
                role="radio"
                ariaChecked={climate === opt.value}
              />
            ))}
          </div>
        </div>
      )}

      {step === 3 && (
        <div>
          <h2 className="text-xl sm:text-2xl font-display font-normal mb-2">
            What matters most to you?
          </h2>
          <p className="text-sm text-muted-foreground mb-6">
            Pick one or more — we'll tune what shows up first on your dashboard.
          </p>
          <div className="space-y-2" role="group" aria-label="Top concerns">
            {CONCERN_OPTIONS.map((opt) => {
              const selected = concerns.includes(opt.value)
              return (
                <OptionRow
                  key={opt.value}
                  selected={selected}
                  onClick={() => toggleConcern(opt.value)}
                  label={opt.label}
                  hint={opt.hint}
                  role="checkbox"
                  ariaChecked={selected}
                />
              )
            })}
          </div>
        </div>
      )}

      {step === 4 && (
        <div>
          <h2 className="text-xl sm:text-2xl font-display font-normal mb-2">
            How do you like to use apps like this?
          </h2>
          <p className="text-sm text-muted-foreground mb-6">
            We'll set a default — you can change it later in Settings.
          </p>
          <div className="space-y-2" role="radiogroup" aria-label="Preferred mode">
            {MODE_OPTIONS.map((opt) => (
              <OptionRow
                key={opt.value}
                selected={mode === opt.value}
                onClick={() => setMode(opt.value)}
                label={opt.label}
                hint={opt.hint}
                role="radio"
                ariaChecked={mode === opt.value}
              />
            ))}
          </div>
        </div>
      )}

      {error && <p className="text-sm text-destructive mt-4">{error}</p>}

      <div className="mt-8 flex items-center justify-between gap-3">
        <Button
          variant="ghost"
          onClick={handleSkip}
          disabled={saving}
          className="text-muted-foreground"
        >
          Skip for now
        </Button>
        <div className="flex items-center gap-2">
          {step > 0 && (
            <Button
              variant="outline"
              onClick={() => setStep((step - 1) as Step)}
              disabled={saving}
            >
              Back
            </Button>
          )}
          <Button onClick={handleNext} disabled={!canAdvance || saving}>
            {saving ? "Saving..." : step === 4 ? "Finish" : "Next"}
          </Button>
        </div>
      </div>
    </div>
  )
}

type OptionRowProps = {
  selected: boolean
  onClick: () => void
  label: string
  hint?: string
  role: "radio" | "checkbox"
  ariaChecked: boolean
}

function OptionRow({ selected, onClick, label, hint, role, ariaChecked }: OptionRowProps) {
  return (
    <button
      type="button"
      role={role}
      aria-checked={ariaChecked}
      onClick={onClick}
      className={cn(
        "w-full text-left rounded-lg border-2 px-4 py-3 transition-colors",
        "min-h-11 flex flex-col justify-center",
        selected
          ? "border-primary bg-primary/5"
          : "border-border hover:border-muted-foreground/40 hover:bg-muted/30",
      )}
    >
      <span className={cn("font-medium", selected && "text-primary")}>{label}</span>
      {hint && <span className="text-xs text-muted-foreground mt-0.5">{hint}</span>}
    </button>
  )
}
