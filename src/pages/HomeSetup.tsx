/**
 * Your home — the setup questions behind whole-home care.
 *
 * Owner, 2026-09-06: pests, gutters, smoke alarms and the water heater are the
 * house's care, not any manual's. Homehub asks a few yes/no questions per
 * category (the InterNACHI system list plus pests / exterior, each with "the
 * building handles it"), writes the answers as care facts on the home, and
 * offers the library's whole-home care that those facts unlock — one Add at
 * a time, or all at once. Nothing is created until she says so.
 * Design: design/care-library.md.
 */
import { useCallback, useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { ChevronLeftIcon, ChevronRightIcon, Loader2Icon } from "lucide-react"
import { PageContainer } from "@/components/layout"
import { useCurrentHome, getHomeProfile, upsertHomeProfile } from "@/modules/home"
import { getTaskTemplates, addLibraryTask, addCustomHomeTask, dismissLibrarySuggestion } from "@/modules/care"
import { SuggestedRow } from "@/components/care/SuggestedRow"
import { suggestionsForHome, type CareFacts, type Suggestion } from "../../shared/care/library"
import type { ScheduleType, TaskTemplate } from "@/integrations/types"

const INK = "var(--hh-ink)", SUB = "var(--hh-sub)", FAINT = "var(--hh-faint)", TEAL = "var(--hh-teal)", CLAY = "var(--hh-clay)"
const SURFACE = "var(--hh-surface)", LINE = "var(--hh-line)"

type FactKey = keyof CareFacts

/** One category of the questionnaire. `building` is the fact that hands the whole category to the building. */
type Category = {
  key: string
  label: string
  blurb: string
  building?: FactKey
  questions: { fact: FactKey; text: string }[]
}

export const CATEGORIES: Category[] = [
  {
    key: "safety", label: "Safety", blurb: "Alarms and the extinguisher",
    questions: [
      { fact: "has_smoke_alarms", text: "Smoke or carbon-monoxide alarms in the home?" },
      { fact: "has_extinguisher", text: "A fire extinguisher you keep?" },
    ],
  },
  {
    key: "water", label: "Water heater", blurb: "Tank or tankless",
    questions: [{ fact: "has_water_heater", text: "A water heater that is yours to look after?" }],
  },
  {
    key: "hvac", label: "Heating & cooling", blurb: "Furnace, boiler, central air",
    questions: [{ fact: "has_hvac_service", text: "A furnace or central air system you have serviced?" }],
  },
  {
    key: "pests", label: "Pests", blurb: "Termites, birds, rodents", building: "building_handles_pests",
    questions: [
      { fact: "termite_risk", text: "Termites a known risk where you live?" },
      { fact: "birds_roosting", text: "Birds roosting on ledges, balconies or the roof?" },
      { fact: "rodents", text: "Rodents seen or suspected?" },
    ],
  },
  {
    key: "exterior", label: "Roof, gutters & exterior", blurb: "What the weather reaches", building: "building_handles_exterior",
    questions: [{ fact: "has_gutters", text: "Gutters and downspouts on the home?" }],
  },
]

/** How a category reads on the list: unanswered, N answered, or handed to the building. */
export function categoryStatus(c: Category, facts: CareFacts): string {
  if (c.building && facts[c.building]) return "The building handles it"
  const answered = c.questions.filter((q) => facts[q.fact] !== undefined).length
  if (answered === 0) return "Not answered yet"
  return answered === c.questions.length ? "Answered" : `${answered} of ${c.questions.length} answered`
}

const CADENCES: { value: ScheduleType; label: string }[] = [
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Every 3 months" },
  { value: "semiannual", label: "Twice a year" },
  { value: "annual", label: "Yearly" },
  { value: "as_needed", label: "No schedule" },
]

export default function HomeSetup() {
  const { home } = useCurrentHome()
  const homeId = home?.home_id ?? null

  const [facts, setFacts] = useState<CareFacts>({})
  const [dismissed, setDismissed] = useState<string[]>([])
  const [homeTasks, setHomeTasks] = useState<TaskTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!homeId) return
    let alive = true
    setLoading(true)
    setLoadError(null)
    Promise.all([getHomeProfile(homeId), getTaskTemplates(homeId)]).then(([profile, templates]) => {
      if (!alive) return
      // A failed read must never look like "nothing set up" — the page says so and offers a retry.
      if (profile.error) { setLoadError(profile.error.message); setLoading(false); return }
      if (templates.error) { setLoadError(templates.error.message); setLoading(false); return }
      setFacts(profile.data?.care_facts ?? {})
      setDismissed(profile.data?.dismissed_care ?? [])
      setHomeTasks((templates.data ?? []).filter((t) => t.scope_type === "home" && t.is_active && !t.deleted_at))
      setLoading(false)
    })
    return () => { alive = false }
  }, [homeId, reloadKey])

  const suggestions = useMemo(
    () => suggestionsForHome(facts, homeTasks.map((t) => ({ title: t.title, scheduleType: t.schedule?.scheduleType ?? null })), dismissed),
    [facts, homeTasks, dismissed],
  )

  const saveFacts = useCallback(async (next: CareFacts) => {
    if (!homeId) return { error: { message: "No home selected" } }
    const res = await upsertHomeProfile(homeId, { care_facts: next })
    if (res.error) return { error: res.error }
    setFacts(next)
    return { error: null }
  }, [homeId])

  const add = async (s: Suggestion) => {
    if (!homeId) return { error: { message: "No home selected" } }
    const res = await addLibraryTask(homeId, null, s.entry)
    if (res.error) return { error: res.error }
    setReloadKey((k) => k + 1)
    return { error: null }
  }
  const dismiss = async (s: Suggestion) => {
    if (!homeId) return { error: { message: "No home selected" } }
    const res = await dismissLibrarySuggestion(homeId, null, s.entry.key)
    if (res.error) return { error: res.error }
    setDismissed((d) => [...d, s.entry.key])
    return { error: null }
  }

  const category = CATEGORIES.find((c) => c.key === open) ?? null

  return (
    <PageContainer>
      <div className="mx-auto w-full max-w-[640px] pb-10">
        <div className="mb-4 flex items-center gap-2">
          {category ? (
            <button type="button" onClick={() => setOpen(null)} className="flex min-h-11 items-center gap-1 text-[14px] font-semibold" style={{ color: TEAL }}>
              <ChevronLeftIcon className="size-4" /> All categories
            </button>
          ) : (
            <Link to="/settings" className="flex min-h-11 items-center gap-1 text-[14px] font-semibold" style={{ color: TEAL }}>
              <ChevronLeftIcon className="size-4" /> Settings
            </Link>
          )}
        </div>

        <h1 className="text-[24px] font-extrabold tracking-[-0.4px]" style={{ color: INK }}>{category ? category.label : "Your home"}</h1>
        <p className="mt-1 text-[14px]" style={{ color: SUB }}>
          {category ? "Answer what you know. Skip what you don't." : "A few questions about the house unlock the care no manual covers. Nothing is added until you say so."}
        </p>

        {loading ? (
          <div className="mt-8 flex items-center gap-2 text-[14px]" style={{ color: SUB }}><Loader2Icon className="size-4 animate-spin" /> Loading your answers…</div>
        ) : loadError ? (
          <div role="alert" className="mt-6 rounded-2xl px-4 py-3 text-[14px]" style={{ background: SURFACE, border: `1px solid ${LINE}`, color: CLAY }}>
            Couldn&apos;t load your home: {loadError}{" "}
            <button type="button" onClick={() => setReloadKey((k) => k + 1)} className="font-bold" style={{ color: TEAL }}>Try again</button>
          </div>
        ) : category ? (
          <CategoryQuestions category={category} facts={facts} onSave={saveFacts} onDone={() => setOpen(null)} />
        ) : (
          <>
            <div className="mt-5 overflow-hidden rounded-2xl" style={{ background: SURFACE, border: `1px solid ${LINE}` }} data-testid="setup-categories">
              {CATEGORIES.map((c, i) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setOpen(c.key)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left"
                  style={{ borderTop: i === 0 ? "none" : `1px solid ${LINE}` }}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold" style={{ color: INK }}>{c.label}</span>
                    <span className="block text-[12.5px]" style={{ color: SUB }}>{c.blurb}</span>
                  </span>
                  <span className="shrink-0 text-[12.5px] font-medium" style={{ color: categoryStatus(c, facts) === "Not answered yet" ? FAINT : TEAL }}>{categoryStatus(c, facts)}</span>
                  <ChevronRightIcon className="size-4 shrink-0" style={{ color: FAINT }} />
                </button>
              ))}
            </div>

            <section className="mt-8" data-testid="home-suggestions">
              <div className="mb-2 flex items-center gap-1.5 pl-0.5">
                <span className="size-2 rounded-full" style={{ background: "var(--hh-gold, #8A5A12)" }} />
                <span className="text-[15px] font-extrabold tracking-[-0.2px]" style={{ color: INK }}>Suggested for your home</span>
                <span className="text-[13.5px] font-bold" style={{ color: FAINT }}>{suggestions.length}</span>
                <div className="flex-1" />
                {suggestions.length > 1 && <AddAll suggestions={suggestions} onAdd={add} />}
              </div>
              <div className="overflow-hidden rounded-2xl" style={{ background: SURFACE, border: `1px solid ${LINE}` }}>
                {suggestions.length === 0 ? (
                  <p className="px-4 py-4 text-[13.5px]" style={{ color: SUB }}>
                    {Object.keys(facts).length === 0 ? "Answer a category above and the care it calls for shows up here." : "Nothing left to suggest — everything your answers call for is already on your list."}
                  </p>
                ) : suggestions.map((s, i) => (
                  <SuggestedRow key={s.entry.key} suggestion={s} itemName="Whole home" onAdd={() => add(s)} onDismiss={() => dismiss(s)} last={i === suggestions.length - 1} />
                ))}
              </div>
            </section>

            <CustomTask homeId={homeId} onAdded={() => setReloadKey((k) => k + 1)} />
          </>
        )}
      </div>
    </PageContainer>
  )
}

/** Yes / No / (the building does it) per question; Save writes the facts and surfaces any failure in place. */
function CategoryQuestions({ category, facts, onSave, onDone }: {
  category: Category
  facts: CareFacts
  onSave: (next: CareFacts) => Promise<{ error: { message: string } | null }>
  onDone: () => void
}) {
  const [draft, setDraft] = useState<CareFacts>(facts)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const building = category.building ? !!draft[category.building] : false

  const set = (fact: FactKey, value: boolean | undefined) =>
    setDraft((d) => { const n = { ...d }; if (value === undefined) delete n[fact]; else n[fact] = value; return n })

  const save = async () => {
    setSaving(true); setError(null)
    const res = await onSave(draft)
    setSaving(false)
    if (res.error) { setError(res.error.message); return }
    onDone()
  }

  return (
    <div className="mt-5">
      {category.building && (
        <label className="mb-4 flex items-center gap-3 rounded-2xl px-4 py-3" style={{ background: SURFACE, border: `1px solid ${LINE}` }}>
          <input type="checkbox" checked={building} onChange={(e) => set(category.building!, e.target.checked || undefined)} className="size-4" />
          <span className="text-[14px]" style={{ color: INK }}>The building or an HOA handles this for me</span>
        </label>
      )}
      <div className="overflow-hidden rounded-2xl" style={{ background: SURFACE, border: `1px solid ${LINE}`, opacity: building ? 0.55 : 1 }} data-testid="setup-questions">
        {category.questions.map((q, i) => (
          <div key={q.fact} className="px-4 py-3" style={{ borderTop: i === 0 ? "none" : `1px solid ${LINE}` }}>
            <p className="text-[14.5px] font-medium" style={{ color: INK }}>{q.text}</p>
            <div className="mt-2 flex gap-2" role="radiogroup" aria-label={q.text}>
              {([["Yes", true], ["No", false], ["Not sure", undefined]] as const).map(([label, value]) => {
                const on = draft[q.fact] === value
                return (
                  <button
                    key={label}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    disabled={building}
                    onClick={() => set(q.fact, value)}
                    className="min-h-9 rounded-full px-3.5 text-[13px] font-semibold"
                    style={{ background: on ? "var(--hh-teal-wash)" : "transparent", color: on ? TEAL : SUB, border: `1px solid ${on ? TEAL : LINE}` }}
                  >{label}</button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
      {error && <div role="alert" className="mt-3 text-[13px] font-medium" style={{ color: CLAY }}>Couldn&apos;t save: {error}</div>}
      <button type="button" onClick={() => void save()} disabled={saving} className="mt-4 min-h-11 w-full rounded-2xl text-[15px] font-bold text-white" style={{ background: TEAL, opacity: saving ? 0.7 : 1 }}>
        {saving ? "Saving…" : "Save answers"}
      </button>
    </div>
  )
}

/** Adds every suggestion in order; stops at the first failure and says which one. */
function AddAll({ suggestions, onAdd }: { suggestions: Suggestion[]; onAdd: (s: Suggestion) => Promise<{ error: { message: string } | null }> }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const run = async () => {
    setBusy(true); setError(null)
    for (const s of suggestions) {
      const res = await onAdd(s)
      if (res.error) { setError(`${s.entry.title}: ${res.error.message}`); break }
    }
    setBusy(false)
  }
  return (
    <span className="flex items-center gap-2">
      {error && <span role="alert" className="text-[12px]" style={{ color: CLAY }}>{error}</span>}
      <button type="button" onClick={() => void run()} disabled={busy} className="min-h-9 text-[13px] font-bold" style={{ color: TEAL }}>{busy ? "Adding…" : "Add all"}</button>
    </span>
  )
}

/** "Add something the library missed" — her words, her cadence, a plain task. */
function CustomTask({ homeId, onAdded }: { homeId: string | null; onAdded: () => void }) {
  const [title, setTitle] = useState("")
  const [cadence, setCadence] = useState<ScheduleType>("annual")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [added, setAdded] = useState<string | null>(null)
  const submit = async () => {
    if (!homeId) return
    setBusy(true); setError(null); setAdded(null)
    const res = await addCustomHomeTask(homeId, title, cadence, null)
    setBusy(false)
    if (res.error) { setError(res.error.message); return }
    setAdded(res.data?.title ?? title)
    setTitle("")
    onAdded()
  }
  return (
    <section className="mt-8" data-testid="custom-task">
      <h2 className="text-[15px] font-extrabold tracking-[-0.2px]" style={{ color: INK }}>Add something the library missed</h2>
      <p className="mt-1 text-[13px]" style={{ color: SUB }}>Anything else the house needs, in your own words.</p>
      <form className="mt-3 flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); void submit() }}>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Have the chimney swept"
          aria-label="Task name"
          className="min-h-11 flex-1 rounded-2xl px-4 text-[14px]"
          style={{ background: SURFACE, border: `1px solid ${LINE}`, color: INK }}
        />
        <select value={cadence} onChange={(e) => setCadence(e.target.value as ScheduleType)} aria-label="How often" className="min-h-11 rounded-2xl px-3 text-[14px]" style={{ background: SURFACE, border: `1px solid ${LINE}`, color: INK }}>
          {CADENCES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <button type="submit" disabled={busy || !title.trim()} className="min-h-11 rounded-2xl px-5 text-[14px] font-bold text-white" style={{ background: TEAL, opacity: busy || !title.trim() ? 0.6 : 1 }}>{busy ? "Adding…" : "Add"}</button>
      </form>
      {error && <div role="alert" className="mt-2 text-[13px] font-medium" style={{ color: CLAY }}>Couldn&apos;t add: {error}</div>}
      {added && <div role="status" className="mt-2 text-[13px]" style={{ color: SUB }}>Added <b style={{ color: INK }}>{added}</b> to your Tasks.</div>}
    </section>
  )
}
