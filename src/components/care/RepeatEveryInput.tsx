import { useState, type InputHTMLAttributes, type SelectHTMLAttributes } from "react"
import { useDepsChanged } from "@/hooks/useDepsChanged"
import { MAX_INTERVAL_DAYS, UNIT_DAYS, splitInterval, type IntervalUnit } from "../../../shared/care/interval"

/** The box's own ceiling, unchanged from the inputs this replaced. */
const MAX_N = 999

/** Largest count the unit can hold without passing `MAX_INTERVAL_DAYS`. */
function maxNFor(unit: IntervalUnit): number {
  return Math.min(MAX_N, Math.floor(MAX_INTERVAL_DAYS / UNIT_DAYS[unit]))
}

/** A whole number the unit can hold, or null for anything else (empty, 0, 1.5, too big). */
function parseWhole(draft: string, unit: IntervalUnit): number | null {
  if (!/^\d+$/.test(draft)) return null
  const n = Number(draft)
  return n >= 1 && n <= maxNFor(unit) ? n : null
}

/**
 * The "[n] [unit]" half of "Every [n] [unit]", shared by the review sheet and
 * the task feedback sheet so they cannot drift.
 *
 * HH-164 (owner, 2026-10-02): "I can't change the cadence of this task to six
 * weeks because it won't let me override one week." Both boxes used to derive
 * what they showed from the stored day count on every keystroke. Clearing the
 * box stored 1, the box re-rendered "1" with the cursor after it, and typing 6
 * gave 16. And because the unit was re-picked from the days each time
 * (`splitInterval` takes the largest unit that divides evenly), typing 30 into
 * "weeks" turned the row into "7 months" mid-word.
 *
 * So the box keeps what the person typed and the unit they chose. The box may
 * be empty while they type; only a whole number the unit can hold is
 * committed; leaving the box with nothing usable in it puts the last good
 * number back. The unit changes only when they change it.
 *
 * Renders the input and the select only — the "Every" label and the row around
 * them stay with each sheet, which style them differently.
 */
export function RepeatEveryInput({
  days,
  onChange,
  inputProps,
  selectProps,
}: {
  /** The committed interval, in days. */
  days: number
  /** Called with a new interval in days, only ever a whole number of the chosen unit. */
  onChange: (days: number) => void
  inputProps?: Pick<InputHTMLAttributes<HTMLInputElement>, "id" | "aria-label" | "className" | "style">
  selectProps?: Pick<SelectHTMLAttributes<HTMLSelectElement>, "className" | "style">
}) {
  const [unit, setUnit] = useState<IntervalUnit>(() => splitInterval(days).unit)
  const [draft, setDraft] = useState(() => String(splitInterval(days).n))
  const [lastGood, setLastGood] = useState(() => splitInterval(days).n)
  /** The last value this box sent up — so its own commit isn't mistaken for an outside change. */
  const [committed, setCommitted] = useState(days)

  // A value set from outside (a different row's default, the Discuss proposal)
  // re-seeds the box. Our own commits come back as `days === committed` and
  // leave the person's unit alone.
  const daysChanged = useDepsChanged([days])
  if (daysChanged && days !== committed) {
    const next = splitInterval(days)
    setUnit(next.unit)
    setDraft(String(next.n))
    setLastGood(next.n)
    setCommitted(days)
  }

  function commit(n: number, u: IntervalUnit) {
    const d = n * UNIT_DAYS[u]
    setLastGood(n)
    setCommitted(d)
    onChange(d)
  }

  return (
    <>
      <input
        {...inputProps}
        type="number" inputMode="numeric" min={1} max={MAX_N}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value)
          const n = parseWhole(e.target.value, unit)
          if (n !== null) commit(n, unit)
        }}
        onBlur={() => setDraft(String(lastGood))}
      />
      <select
        {...selectProps}
        aria-label="Unit"
        value={unit}
        onChange={(e) => {
          const u = e.target.value as IntervalUnit
          // Keep the number they see; a count too big for the new unit is
          // capped to what it can hold, as the old clamp did.
          const n = Math.min(parseWhole(draft, unit) ?? lastGood, maxNFor(u))
          setUnit(u)
          setDraft(String(n))
          commit(n, u)
        }}
      >
        <option value="days">days</option>
        <option value="weeks">weeks</option>
        <option value="months">months</option>
        <option value="years">years</option>
      </select>
    </>
  )
}
