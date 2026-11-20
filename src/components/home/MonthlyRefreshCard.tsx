/**
 * "This month at your home" — the monthly refresh (design/day-one-home.md,
 * release D; owner asked for it 2026-11-19).
 *
 * The first-minute list was the part testers liked, and it ran once. This is
 * the same list (shared/care/firstList.ts, same rules: at most three rows,
 * timely, nothing the home already has or turned down — and none of the
 * year-round fillers onboarding tops a short list up with), offered again each
 * month on Home. Nothing is added until Add. Add or Not now answers the month
 * for the whole home; next month it comes back with that month's list.
 *
 * Not in the month the home was created: onboarding just showed that list.
 * When it shows, it takes Home's one next-step slot; otherwise the slot's
 * usual card (`fallback`) shows.
 */
import { useEffect, useState, type ReactNode } from "react"
import useSWR from "swr"
import { CheckIcon, Loader2Icon } from "lucide-react"
import { getTaskTemplates, addLibraryTask } from "@/modules/care"
import { upsertHomeProfile, type HomeProfile } from "@/modules/home/services/homeProfileService"
import { listInput, NO_CORRECTIONS } from "@/lib/firstListInput"
import { monthlyRefreshDue, MONTH_NAMES } from "@/lib/monthlyRefresh"
import { InlineError } from "@/components/layout/LoadStates"
import { track } from "@/lib/analytics"
import { cn } from "@/lib/utils"
import { firstDueDates, firstList, type FirstListRow } from "../../../shared/care/firstList"
import type { CareFacts } from "../../../shared/care/library"
import { localToday } from "../../../shared/dates/calendar"

const INK = "var(--hh-ink)", SUB = "var(--hh-sub)"
type Answer = "yes" | "no" | "unsure"

export function MonthlyRefreshCard({ homeId, profile, fallback, onChanged }: {
  homeId: string
  profile: HomeProfile | null
  /** The slot's usual card when there is nothing to offer this month. */
  fallback: ReactNode
  /** A write landed: Home re-reads its list and the profile. */
  onChanged: () => void
}) {
  const today = localToday()
  const due = !!profile && monthlyRefreshDue({ today, createdAt: profile.created_at, answeredMonth: profile.refresh_answered_month })
  const { data: titles, error } = useSWR(due ? `monthly-refresh:${homeId}` : null, async () => {
    const r = await getTaskTemplates(homeId)
    if (r.error || !r.data) throw new Error(r.error?.message ?? "Could not read your tasks")
    return r.data.map((t) => ({ title: t.title, scheduleType: t.schedule?.scheduleType ?? null }))
  }, { revalidateOnFocus: false })

  // Answered this visit: hide at once, before the profile re-read lands.
  const [answered, setAnswered] = useState(false)
  if (!due || answered || !profile) return <>{fallback}</>
  // An unreadable task list would mean offering what she already has — so
  // the card stays away rather than guess. Logged, and the usual card shows.
  if (error) {
    console.warn(`[monthly refresh] could not read tasks for home ${homeId}:`, error instanceof Error ? error.message : error)
    return <>{fallback}</>
  }
  if (!titles) return null

  const month = Number(today.slice(5, 7))
  const input = listInput(profile, profile.home_type, NO_CORRECTIONS, {}, month)
  const list = firstList({ ...input, existing: titles, dismissed: profile.dismissed_care, fillers: false, monthly: true })
  if (list.rows.length === 0) return <>{fallback}</>

  return <Card homeId={homeId} profile={profile} month={month} rows={list.rows} onAnswered={() => { setAnswered(true); onChanged() }} />
}

function Card({ homeId, profile, month, rows: allRows, onAnswered }: {
  homeId: string
  profile: HomeProfile
  month: number
  rows: FirstListRow[]
  onAnswered: () => void
}) {
  const [answers, setAnswers] = useState<Record<string, Answer>>({})
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const [added, setAdded] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Once per card, with what was offered.
  const offered = allRows.length
  useEffect(() => {
    track("monthly_refresh_shown", { rows: offered, month })
  }, [offered, month])

  const rows = allRows.filter((r) => !added.includes(r.entry.key))
  const isChecked = (r: FirstListRow) => {
    const a = answers[r.entry.key]
    if (a === "no") return false
    return checked[r.entry.key] ?? (r.checked || a === "yes")
  }
  const picked = rows.filter(isChecked)
  const monthKey = localToday().slice(0, 7)

  /** Her answers, and the month marked answered — one write, last. */
  const finish = async (): Promise<boolean> => {
    const facts: CareFacts = {}
    for (const r of allRows) {
      const a = answers[r.entry.key]
      if (r.question && (a === "yes" || a === "no")) facts[r.question.fact] = a === "yes"
    }
    const res = await upsertHomeProfile(homeId, {
      ...(Object.keys(facts).length ? { care_facts: { ...profile.care_facts, ...facts } } : {}),
      refresh_answered_month: monthKey,
    })
    if (res.error) {
      console.warn(`[monthly refresh] could not save the answers (home ${homeId}):`, res.error.message)
      return false
    }
    return true
  }

  const add = async () => {
    if (saving) return
    // Tasks all in, only the answers' write failed: try that alone.
    if (picked.length === 0) {
      if (added.length === 0) return
      setSaving(true)
      setError(null)
      if (await finish()) onAnswered()
      else { setSaving(false); setError("Your tasks were added, but this card couldn’t be marked done. Try again.") }
      return
    }
    setSaving(true)
    setError(null)
    const dueDates = firstDueDates(localToday(), picked.length)
    const ok: string[] = []
    const failed: FirstListRow[] = []
    for (const [i, r] of picked.entries()) {
      const res = await addLibraryTask(homeId, null, r.entry, { firstDue: dueDates[i] })
      if (res.error) {
        console.warn(`[monthly refresh] could not add ${r.entry.key} (home ${homeId}):`, res.error.message)
        failed.push(r)
      } else ok.push(r.entry.key)
    }
    setAdded((a) => [...a, ...ok])
    if (failed.length) {
      setSaving(false)
      setError(ok.length
        ? `Couldn’t add ${failed.map((r) => `“${r.entry.title}”`).join(" or ")}. The others were added. Try again for the rest.`
        : "Couldn’t add your tasks. Check your connection and try again.")
      return
    }
    track("monthly_refresh_added", { count: ok.length, keys: ok.join(","), month })
    if (!(await finish())) {
      setSaving(false)
      setError("Your tasks were added, but this card couldn’t be marked done. Try again.")
      return
    }
    onAnswered()
  }

  const notNow = async () => {
    setSaving(true)
    setError(null)
    if (!(await finish())) {
      setSaving(false)
      setError("Couldn’t save that. Check your connection and try again.")
      return
    }
    track("monthly_refresh_dismissed", { month })
    onAnswered()
  }

  return (
    <section aria-labelledby="monthly-refresh-title" data-testid="monthly-refresh" className="rounded-2xl px-5 py-5" style={{ background: "var(--hh-teal-wash)" }}>
      <p className="mb-1.5 text-xs font-bold uppercase tracking-[0.6px]" style={{ color: SUB }}>{MONTH_NAMES[month - 1]}</p>
      <h2 id="monthly-refresh-title" className="text-[1.0625rem] font-extrabold tracking-[-0.015em]" style={{ color: INK }}>
        This month at your home
      </h2>
      <p className="mt-1.5 text-[0.875rem] leading-snug" style={{ color: SUB }}>Worth doing now. Nothing is added until you tap Add.</p>

      <ul className="mt-4 divide-y divide-[var(--hh-line)] overflow-hidden rounded-2xl border" style={{ background: "var(--hh-surface)", borderColor: "var(--hh-line)" }}>
        {rows.map((r) => {
          const e = r.entry
          const on = isChecked(r)
          const a = answers[e.key] ?? null
          const essential = e.priorityTier === "essential"
          return (
            <li key={e.key} className="flex gap-3 px-3.5 py-3" data-testid="monthly-refresh-row">
              <button type="button" role="checkbox" aria-checked={on} aria-label={`Add ${e.title}`} disabled={a === "no" || saving}
                onClick={() => setChecked((s) => ({ ...s, [e.key]: !on }))}
                className={cn("hit-44 mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border-2", on ? "border-transparent" : "border-[var(--hh-sub)]")}
                style={on ? { background: "var(--hh-teal-fill)", color: "var(--hh-on-fill)" } : undefined}>
                {on && <CheckIcon className="size-3.5" strokeWidth={3} aria-hidden />}
              </button>
              <div className="min-w-0 flex-1">
                <p className="text-[0.9375rem] font-semibold leading-snug" style={{ color: INK }}>{e.title}</p>
                <p className="mt-0.5 text-[0.8125rem]" style={{ color: SUB }}>
                  <span style={essential ? { color: "var(--hh-clay-ink)", fontWeight: 600 } : undefined}>{essential ? "Essential" : "Recommended"}</span>
                  {" · "}{e.cadenceLabel} · {e.minutes} min
                </p>
                {r.reason && <p className="mt-0.5 text-[0.8125rem]" style={{ color: SUB }}>{r.reason}</p>}
                {r.question && (
                  <div className="mt-2">
                    <p className="mb-1.5 text-[0.875rem] font-medium" style={{ color: INK }}>{r.question.text}</p>
                    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={r.question.text}>
                      {(["yes", "no", "unsure"] as const).map((v) => (
                        <button key={v} type="button" role="radio" aria-checked={a === v} disabled={saving}
                          onClick={() => {
                            setAnswers((s) => ({ ...s, [e.key]: v }))
                            setChecked((s) => { const n = { ...s }; delete n[e.key]; return v === "yes" ? { ...n, [e.key]: true } : n })
                          }}
                          className={cn("min-h-11 rounded-full border px-3.5 text-[0.875rem] font-medium", a === v ? "border-[var(--hh-teal)]" : "border-[var(--hh-line2)]")}
                          style={a === v ? { background: "var(--hh-teal-wash)", color: "var(--hh-teal)" } : undefined}>
                          {v === "yes" ? "Yes" : v === "no" ? "No" : "Not sure"}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </li>
          )
        })}
      </ul>

      {error && <InlineError className="mt-3">{error}</InlineError>}

      <div className="mt-3 flex items-center gap-2">
        <button type="button" onClick={() => void add()} disabled={saving || (picked.length === 0 && added.length === 0)}
          className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full px-5 text-[0.9375rem] font-bold disabled:opacity-60"
          style={{ background: "var(--hh-teal-fill)", color: "var(--hh-on-fill)" }}>
          {saving && <Loader2Icon className="size-4 animate-spin" aria-hidden />}
          {picked.length === 0 ? (added.length ? "Try again" : "Add") : `Add ${picked.length} ${picked.length === 1 ? "task" : "tasks"}`}
        </button>
        <button type="button" onClick={() => void notNow()} disabled={saving} className="min-h-11 px-3 text-[0.875rem] font-semibold" style={{ color: SUB }}>
          Not now
        </button>
      </div>
    </section>
  )
}
