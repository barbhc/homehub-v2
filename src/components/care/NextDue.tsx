import { useEffect, useState } from "react"
import { previewCadenceChange, type CadenceChoice } from "@/modules/care/services/cadenceChangeService"
import type { CadenceChangePlan } from "../../../shared/tasks/cadenceChange"
import type { Season } from "@/integrations/types"
import { nextDueText } from "./nextDueText"
import { useDepsChanged } from "@/hooks/useDepsChanged"

/**
 * "Next due: <date>" — what a cadence change will do, shown BEFORE Save in every
 * editor that changes how often a task repeats (owner decision 2026-10-28,
 * "from when you last did it"). The date comes from the same plan the save
 * writes (shared/tasks/cadenceChange.ts), so the line cannot promise one date
 * and the save write another.
 *
 * One short phrase (owner's microcopy rule). A date already past says so in
 * plain words, in the ordinary text colour — honest, not alarming (calm tiers,
 * non-negotiable 6).
 */

export function NextDueLine({ plan, className }: { plan: CadenceChangePlan; className?: string }) {
  const text = nextDueText(plan)
  if (!text) return null
  return (
    <p data-testid="next-due" aria-live="polite" className={`text-[0.78125rem] font-semibold ${className ?? ""}`} style={{ color: "var(--hh-sub)" }}>
      {text}
    </p>
  )
}

const SEASONS: { key: Season; label: string }[] = [
  { key: "spring", label: "Spring" },
  { key: "summer", label: "Summer" },
  { key: "fall", label: "Fall" },
  { key: "winter", label: "Winter" },
]

/** Asked when a task goes seasonal and nobody knows which season — never an
 *  error, never a guess. */
export function SeasonAsk({ value, onChange, className }: { value: Season | null; onChange: (s: Season) => void; className?: string }) {
  return (
    <div className={className} data-testid="season-ask">
      <div className="mb-1.5 text-[0.78125rem] font-semibold" style={{ color: "var(--hh-ink)" }}>Which season?</div>
      <div className="flex flex-wrap gap-x-1.5 gap-y-3.5">
        {SEASONS.map((s) => (
          <button
            key={s.key}
            type="button"
            aria-pressed={value === s.key}
            onClick={() => onChange(s.key)}
            className="hit-44 rounded-full px-3 py-1.5 text-[0.75rem] font-bold"
            style={value === s.key
              ? { border: "1.5px solid var(--hh-teal)", background: "var(--hh-teal-wash)", color: "var(--hh-teal)" }
              : { border: "1px solid var(--hh-line2)", background: "var(--hh-surface)", color: "var(--hh-sub)" }}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * The preview for one stored task, read from its documents. `onPlan` hands the
 * plan to the editor so it can hold Save while a season is still unanswered.
 */
export function CadencePreview({
  homeId, taskTemplateId, choice, onSeason, onPlan, className,
}: {
  homeId: string
  taskTemplateId: string
  choice: CadenceChoice
  onSeason: (s: Season) => void
  onPlan?: (plan: CadenceChangePlan | null) => void
  className?: string
}) {
  const [plan, setPlan] = useState<CadenceChangePlan | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { scheduleType, intervalDays = null, season = null } = choice
  if (useDepsChanged([homeId, taskTemplateId, scheduleType, intervalDays, season])) {
    setPlan(null)
    setError(null)
  }
  useEffect(() => {
    let cancelled = false
    onPlan?.(null)
    previewCadenceChange(homeId, taskTemplateId, { scheduleType, intervalDays, season }).then((res) => {
      if (cancelled) return
      if (res.error) { setError(res.error.message); return }
      setPlan(res.data)
      onPlan?.(res.data)
    })
    return () => { cancelled = true }
    // onPlan is a setter from the parent; a new closure must not refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [homeId, taskTemplateId, scheduleType, intervalDays, season])

  if (error) return <p role="alert" className={`text-[0.78125rem] font-semibold ${className ?? ""}`} style={{ color: "var(--hh-clay)" }}>{error}</p>
  if (!plan) return <p className={`text-[0.78125rem] ${className ?? ""}`} style={{ color: "var(--hh-faint)" }}>Working out the next date…</p>
  if (plan.kind === "needs-season") return <SeasonAsk value={season} onChange={onSeason} className={className} />
  return <NextDueLine plan={plan} className={className} />
}
