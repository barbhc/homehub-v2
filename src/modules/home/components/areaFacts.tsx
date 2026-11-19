/**
 * One area fact from the zip table, with its source and a one-tap "Not true
 * here" (D8, design/first-minute-onboarding.md must-be-true 5). Shared by the
 * first minute's area step and Settings, Your home, so a fact reads the same
 * wherever a zip is entered.
 */
export const HAZARD_TITLE = {
  earthquake: "Earthquake risk is high",
  wildfire: "Wildfire risk is high",
  hurricane: "Hurricane risk is high",
} as const
export type AreaHazard = keyof typeof HAZARD_TITLE

export function FactRow({ title, detail, action, onAction }: {
  title: string
  detail: string
  action: string
  onAction: () => void
}) {
  return (
    <li className="flex items-center gap-3 px-5 py-4">
      <div className="min-w-0 flex-1">
        <p className="font-semibold" style={{ color: "var(--hh-ink)" }}>{title}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">{detail}</p>
      </div>
      <button type="button" onClick={onAction} className="min-h-11 shrink-0 text-sm font-bold" style={{ color: "var(--hh-teal)" }}>
        {action}
      </button>
    </li>
  )
}
