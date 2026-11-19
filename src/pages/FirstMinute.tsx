/**
 * The first minute, steps 2 and 3 (D8, design/first-minute-onboarding.md;
 * approved mock https://claude.ai/artifact/2VnY3jhXgB2ALEVkB8CzQC).
 *
 *   2. What your area means for upkeep — only the zip facts that change this
 *      month's list, each with its source and a one-tap "Not true here" with
 *      Undo; then the home type.
 *   3. Worth doing this month — at most three rows and two questions. NOTHING
 *      is saved until Add (the zip and home type, written on the way here,
 *      are kept by "Not now").
 *
 * Step 1 (the zip) is HomeOnboarding, which creates the home.
 */
import { useEffect, useMemo, useRef, useState } from "react"
import { Navigate, useNavigate } from "react-router-dom"
import { CheckIcon, XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useCurrentHome, useHomeProfile } from "@/modules/home"
import { upsertHomeProfile, type HomeProfile, type HomeType } from "@/modules/home/services/homeProfileService"
import { lookupZipArea } from "@/modules/home/services/zipAreaService"
import { OnboardingSteps, OptionRow } from "@/modules/home/components/onboardingParts"
import { HOME_TYPE_OPTIONS, buildingHandlesByDefault } from "@/modules/home/components/onboardingOptions"
import { addLibraryTask } from "@/modules/care/services/careSuggestionService"
import { firstDueDates, firstList, type FirstListInput, type FirstListRow, type LeftOffReason } from "../../shared/care/firstList"
import { coldestNightF, type ZipArea } from "../../shared/area/zipArea"
import type { CareFacts } from "../../shared/care/library"
import { localToday } from "../../shared/dates/calendar"
import { track } from "@/lib/analytics"
import { cn } from "@/lib/utils"

const MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
const HAZARD_TITLE = { earthquake: "Earthquake risk is high", wildfire: "Wildfire risk is high", hurricane: "Hurricane risk is high" } as const
const TYPE_WORD: Record<HomeType, string> = { house: "House", condo: "Condo", townhouse: "Townhouse", apartment: "Apartment", other: "Home" }
const CADENCE: Record<string, string> = { weekly: "Weekly", monthly: "Monthly", quarterly: "Every 3 months", semiannual: "Twice a year", annual: "Yearly" }
type Hazard = keyof typeof HAZARD_TITLE

const thisMonth = () => Number(localToday().slice(5, 7))

export default function FirstMinute() {
  const { home } = useCurrentHome()
  const homeId = home?.home_id ?? null
  const { profile, isLoading, error, refresh } = useHomeProfile(homeId)

  if (!homeId) return <Navigate to="/" replace />
  if (isLoading && !profile) {
    return <div className="min-h-screen bg-background" aria-busy="true" aria-label="Loading" />
  }
  if (error && !profile) {
    return (
      <Shell>
        <h1 className="mb-2 text-2xl font-display font-normal">Couldn&apos;t load your home</h1>
        <p className="mb-6 text-muted-foreground">Check your connection and try again.</p>
        <Button onClick={() => void refresh()}>Try again</Button>
      </Shell>
    )
  }
  return <Flow homeId={homeId} profile={profile} onSaved={() => void refresh()} />
}

function Shell({ children, footer }: { children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <div className={cn("mx-auto w-full max-w-md px-6 pt-10", footer ? "pb-48" : "pb-10")}>{children}</div>
      {footer && (
        <div className="fixed inset-x-0 bottom-0 border-t bg-background" style={{ borderColor: "var(--hh-line)" }}>
          <div className="mx-auto w-full max-w-md px-6 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">{footer}</div>
        </div>
      )}
    </div>
  )
}

type Step = "zip" | "area" | "list"

function Flow({ homeId, profile, onSaved }: { homeId: string; profile: HomeProfile | null; onSaved: () => void }) {
  const navigate = useNavigate()
  // Where to start: a zip → its facts; a climate answer (unknown zip) → home type; nothing (skipped) → the list.
  const [step, setStep] = useState<Step>(profile?.zip || profile?.climate ? "area" : "list")
  const [p, setP] = useState<HomeProfile | null>(profile)
  // Each step starts at its top: the list would otherwise open where step 2 was scrolled to.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [step])

  const done = () => navigate("/home", { replace: true })

  if (step === "zip") {
    return (
      <AddZip homeId={homeId} onBack={() => setStep("list")}
        onSaved={(next) => { setP(next); onSaved(); setStep("area") }} />
    )
  }
  if (step === "area") {
    return (
      <AreaStep homeId={homeId} profile={p}
        onSaved={(next) => { setP(next); onSaved(); setStep("list") }} />
    )
  }
  return <ListStep homeId={homeId} profile={p} onAddZip={() => setStep("zip")} onDone={done} />
}

// ── step 2 ────────────────────────────────────────────────────────────────────

interface Corrections { freeze: boolean | null; hazardsOff: Hazard[] }

/** The list for a home type, with the corrections applied — used to decide which facts matter. */
function listFor(profile: HomeProfile | null, homeType: HomeType | null, c: Corrections) {
  return firstList(listInput(profile, homeType, c, {}))
}

function listInput(profile: HomeProfile | null, homeType: HomeType | null, c: Corrections, answers: CareFacts): FirstListInput {
  const facts: CareFacts = { ...(profile?.care_facts ?? {}), ...answers }
  if (buildingHandlesByDefault(homeType) && facts.building_handles_exterior === undefined) facts.building_handles_exterior = true
  const freeze = c.freeze ?? profile?.freeze_risk ?? null
  return {
    month: thisMonth(),
    climate: profile?.climate ?? null,
    freezeRisk: freeze,
    homeType,
    hazards: (profile?.area?.hazards ?? []).filter((h) => !c.hazardsOff.includes(h)),
    facts,
    derived: {
      freezeRisk: c.freeze === null && profile?.climate_source === "zip",
      buildingHandlesExterior: buildingHandlesByDefault(homeType) && profile?.care_facts?.building_handles_exterior === undefined,
    },
    hasArea: !!profile?.area,
    observesDst: profile?.area?.observesDst ?? null,
  }
}

const sig = (l: ReturnType<typeof firstList>) => JSON.stringify([l.rows.map((r) => r.entry.key), l.leftOff.map((x) => x.reason)])

/** A fact is shown only when it changes this month's list, for some home type (must-be-true 6). */
function factMatters(profile: HomeProfile | null, flip: Partial<Corrections>): boolean {
  const base: Corrections = { freeze: null, hazardsOff: [] }
  return HOME_TYPE_OPTIONS.some(({ value }) => sig(listFor(profile, value, base)) !== sig(listFor(profile, value, { ...base, ...flip })))
}

function AreaStep({ homeId, profile, onSaved }: { homeId: string; profile: HomeProfile | null; onSaved: (p: HomeProfile) => void }) {
  const area = profile?.area ?? null
  const [homeType, setHomeType] = useState<HomeType | null>(profile?.home_type ?? null)
  const [c, setC] = useState<Corrections>({ freeze: null, hazardsOff: [] })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const derivedFreeze = profile?.freeze_risk ?? null
  const showFreeze = !!area && derivedFreeze !== null && factMatters(profile, { freeze: !derivedFreeze })
  const hazards = (area?.hazards ?? []).filter((h) => factMatters(profile, { hazardsOff: [h] }))
  const range = coldestNightF(area?.hardinessZone)

  async function save() {
    if (!homeType || saving) return
    setSaving(true)
    setError(null)
    const freezeChanged = c.freeze !== null && c.freeze !== derivedFreeze
    const r = await upsertHomeProfile(homeId, {
      home_type: homeType,
      ...(freezeChanged ? { freeze_risk: c.freeze, climate_source: "owner" as const } : {}),
      ...(area && c.hazardsOff.length
        ? { area: { ...area, hazards: area.hazards.filter((h) => !c.hazardsOff.includes(h)), hazardsCorrected: [...new Set([...area.hazardsCorrected, ...c.hazardsOff])] } }
        : {}),
      // The zip and home type answer what the old five questions were for.
      completed_at: new Date().toISOString(),
    })
    setSaving(false)
    if (r.error || !r.data) {
      setError("Couldn't save. Check your connection and try again.")
      return
    }
    if (freezeChanged) track("area_fact_corrected", { fact: "freeze" })
    for (const h of c.hazardsOff) track("area_fact_corrected", { fact: h })
    onSaved(r.data)
  }

  return (
    <Shell>
      <OnboardingSteps step={2} />
      {area && (
        <>
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.06em] text-muted-foreground">
            {profile?.zip}{area.county ? ` · ${area.county}` : ""}
          </p>
          <h1 className="mb-4 text-2xl font-display font-normal">What your area means for upkeep</h1>
          {(showFreeze || hazards.length > 0) && (
            <ul className="mb-8 divide-y divide-[var(--hh-line)] overflow-hidden rounded-2xl border bg-[var(--hh-surface)]" style={{ borderColor: "var(--hh-line)" }}>
              {showFreeze && (() => {
                const value = c.freeze ?? derivedFreeze!
                const changed = c.freeze !== null
                return (
                  <FactRow
                    title={value ? "Pipes can freeze here" : "Pipes rarely freeze here"}
                    detail={changed
                      ? `You changed this. Winterizing ${value ? "stays on" : "is off"}.`
                      // Plain temperature, never the zone code: "USDA zone 8b" means nothing to most people.
                      : range ? `A typical winter's coldest night is ${range[0]} to ${range[1]}°F.` : "Based on winter lows for your zip."}
                    action={changed ? "Undo" : "Not true here"}
                    onAction={() => setC((x) => ({ ...x, freeze: changed ? null : !derivedFreeze }))}
                  />
                )
              })()}
              {hazards.map((h) => {
                const off = c.hazardsOff.includes(h)
                return (
                  <FactRow key={h}
                    title={off ? HAZARD_TITLE[h].replace(" is high", ": not here") : HAZARD_TITLE[h]}
                    detail={off ? "You changed this. We won’t suggest tasks for it." : `FEMA risk index for ${area.county ?? "this county"}.`}
                    action={off ? "Undo" : "Not true here"}
                    onAction={() => setC((x) => ({ ...x, hazardsOff: off ? x.hazardsOff.filter((k) => k !== h) : [...x.hazardsOff, h] }))}
                  />
                )
              })}
            </ul>
          )}
        </>
      )}
      {!area && <h1 className="mb-6 text-2xl font-display font-normal">What kind of home?</h1>}
      {area && <p className="mb-3 font-medium">A zip can&apos;t tell us this. What kind of home?</p>}
      <div className="mb-8 space-y-2" role="radiogroup" aria-label="Home type">
        {HOME_TYPE_OPTIONS.map((o) => (
          <OptionRow key={o.value} role="radio" selected={homeType === o.value} ariaChecked={homeType === o.value}
            onClick={() => setHomeType(o.value)} label={o.label} hint={o.hint} />
        ))}
      </div>
      {error && <p role="alert" className="mb-3 text-sm text-destructive">{error}</p>}
      <Button className="h-12 w-full text-base" disabled={!homeType || saving} onClick={() => void save()}>
        {saving ? "Saving…" : "See this month"}
      </Button>
    </Shell>
  )
}

function FactRow({ title, detail, action, onAction }: { title: string; detail: string; action: string; onAction: () => void }) {
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

// ── adding a zip from the skip path ───────────────────────────────────────────

function AddZip({ homeId, onSaved, onBack }: { homeId: string; onSaved: (p: HomeProfile) => void; onBack: () => void }) {
  const [zip, setZip] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return
    setError(null)
    setSaving(true)
    let area: ZipArea
    try {
      const found = await lookupZipArea(zip)
      if (found.kind !== "found") {
        setSaving(false)
        setError(found.kind === "unknown" ? `We don’t have ${zip}. Skip it for now, or set your climate in Settings.` : "Enter the five digits of your zip code.")
        return
      }
      area = found.area
    } catch {
      setSaving(false)
      setError("Couldn’t load area data. Try again.")
      return
    }
    track("onboarding_zip_entered", { known: true })
    const r = await upsertHomeProfile(homeId, {
      zip: area.zip, climate: area.climate, freeze_risk: area.freezeRisk, climate_source: "zip",
      area: { hazards: area.hazards.map((h) => h.hazard), hazardsCorrected: [], hardinessZone: area.hardinessZone, county: area.county?.name ?? null, observesDst: area.observesDst, tableVersion: area.tableVersion },
    })
    setSaving(false)
    if (r.error || !r.data) {
      setError("Couldn’t save your zip. Check your connection and try again.")
      return
    }
    onSaved(r.data)
  }
  return (
    <Shell>
      <h1 className="mb-2 text-2xl font-display font-normal">What&apos;s your zip code?</h1>
      <p className="mb-6 text-muted-foreground">Only the zip, never your street. It stays in Homehub.</p>
      <form onSubmit={save} className="space-y-5">
        <Input aria-label="Zip code" inputMode="numeric" autoComplete="postal-code" maxLength={5} value={zip}
          onChange={(e) => { setZip(e.target.value.replace(/\D/g, "").slice(0, 5)); setError(null) }}
          className="h-12 text-xl font-semibold tracking-[0.2em]" />
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="h-12 w-full text-base" disabled={zip.length !== 5 || saving}>{saving ? "Saving…" : "Continue"}</Button>
        <button type="button" onClick={onBack} className="block min-h-11 w-full text-center font-medium text-muted-foreground">Back</button>
      </form>
    </Shell>
  )
}

// ── step 3 ────────────────────────────────────────────────────────────────────

type Answer = "yes" | "no" | "unsure"
type WhyNot = "building" | "none" | "recent" | "not_for_me"

function ListStep({ homeId, profile, onAddZip, onDone }: { homeId: string; profile: HomeProfile | null; onAddZip: () => void; onDone: () => void }) {
  const homeType = profile?.home_type ?? null
  const [month, setMonth] = useState(thisMonth)
  // "Change" under Not on your list: a correction like any other, saved on Add.
  const [c, setC] = useState<Corrections>({ freeze: null, hazardsOff: [] })
  const [exteriorMine, setExteriorMine] = useState(false)
  const [answers, setAnswers] = useState<Record<string, Answer>>({})
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const [removed, setRemoved] = useState<Record<string, WhyNot | "skip">>({})
  const [added, setAdded] = useState<string[]>([])
  const [askWhy, setAskWhy] = useState<FirstListRow | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const answerFacts = (rows: FirstListRow[]): CareFacts => {
    const f: CareFacts = {}
    for (const r of rows) {
      const a = answers[r.entry.key]
      if (r.question && (a === "yes" || a === "no")) f[r.question.fact] = a === "yes"
    }
    return f
  }

  const list = useMemo(() => {
    const input = listInput(profile, homeType, c, {})
    if (exteriorMine) { input.facts = { ...input.facts, building_handles_exterior: false }; input.derived = { ...input.derived, buildingHandlesExterior: false } }
    return firstList({ ...input, month })
  }, [profile, homeType, c, exteriorMine, month])

  const rows = list.rows.filter((r) => !(r.entry.key in removed) && !added.includes(r.entry.key))
  const isChecked = (r: FirstListRow) => {
    const a = answers[r.entry.key]
    if (a === "no") return false
    return checked[r.entry.key] ?? (r.checked || a === "yes")
  }
  const picked = rows.filter(isChecked)

  // Once per visit, with what she was shown (never the zip).
  const firstRows = useRef(list.rows.length)
  useEffect(() => {
    track("first_list_shown", { rows: firstRows.current, month: thisMonth() })
  }, [])

  async function add() {
    if (saving || picked.length === 0) return
    // Built on the 30th, tapped on the 1st: the list is this month's, not last month's.
    if (thisMonth() !== month) {
      setMonth(thisMonth())
      setNote(`It’s ${MONTH[thisMonth() - 1]} now, so the list has changed. Check it and tap Add again.`)
      return
    }
    setSaving(true)
    setError(null)
    setNote(null)

    // 1. Her answers and corrections — one write, before any task.
    const facts: CareFacts = { ...answerFacts(list.rows) }
    const dismissed: string[] = []
    for (const r of list.rows) {
      const why = removed[r.entry.key]
      if (why === "building") { facts.building_handles_exterior = true; facts.building_handles_pests = true }
      if (why === "none") { if (r.entry.fact) facts[r.entry.fact] = false; else dismissed.push(r.entry.key) }
      if (why === "not_for_me") dismissed.push(r.entry.key)
    }
    if (exteriorMine) facts.building_handles_exterior = false
    else if (buildingHandlesByDefault(homeType) && profile?.care_facts?.building_handles_exterior === undefined && facts.building_handles_exterior === undefined) {
      facts.building_handles_exterior = true // the default she saw, shown and changeable
    }
    const freezeChanged = c.freeze !== null && c.freeze !== (profile?.freeze_risk ?? null)
    const patchNeeded = Object.keys(facts).length > 0 || dismissed.length > 0 || freezeChanged
    if (patchNeeded) {
      const r = await upsertHomeProfile(homeId, {
        care_facts: { ...(profile?.care_facts ?? {}), ...facts },
        ...(dismissed.length ? { dismissed_care: [...new Set([...(profile?.dismissed_care ?? []), ...dismissed])] } : {}),
        ...(freezeChanged ? { freeze_risk: c.freeze, climate_source: "owner" as const } : {}),
      })
      if (r.error) {
        console.warn(`[first minute] could not save the answers (home ${homeId}):`, r.error.message)
        setSaving(false)
        setError("Couldn’t add your tasks. Nothing was saved. Check your connection and try again.")
        return
      }
    }

    // 2. The tasks, due this weekend (must-be-true 11).
    const due = firstDueDates(localToday(), picked.length)
    const failed: FirstListRow[] = []
    const ok: string[] = []
    for (const [i, r] of picked.entries()) {
      const res = await addLibraryTask(homeId, null, r.entry, { firstDue: due[i] })
      if (res.error) {
        console.warn(`[first minute] could not add ${r.entry.key} (home ${homeId}):`, res.error.message)
        failed.push(r)
      } else ok.push(r.entry.key)
    }
    setAdded((a) => [...a, ...ok])
    setSaving(false)
    if (failed.length === 0) {
      track("first_list_added", { count: ok.length, keys: ok.join(",") })
      onDone()
      return
    }
    if (ok.length === 0) {
      setError(patchNeeded
        ? "Couldn’t add your tasks. No tasks were saved. Check your connection and try again."
        : "Couldn’t add your tasks. Nothing was saved. Check your connection and try again.")
    } else {
      setError(`Couldn’t add ${failed.map((r) => `“${r.entry.title}”`).join(" or ")}. The others were added. Try again for the rest.`)
    }
  }

  const eyebrow = [MONTH[month - 1], homeType && profile?.area ? TYPE_WORD[homeType] : null, profile?.area ? profile.zip : null].filter(Boolean).join(" · ")

  const footer = (
    <>
      {error && <p role="alert" className="mb-3 text-sm font-medium" style={{ color: "var(--hh-clay-ink)" }}>{error}</p>}
      {rows.length > 0 ? (
        <Button className="h-12 w-full text-base" disabled={saving || picked.length === 0} onClick={() => void add()}>
          {saving ? "Adding…" : error ? "Try again" : picked.length === 0 ? "Add" : `Add ${picked.length} task${picked.length === 1 ? "" : "s"}`}
        </Button>
      ) : (
        <Button className="h-12 w-full text-base" onClick={onDone}>Go to Home</Button>
      )}
      {rows.length > 0 && (
        <button type="button" onClick={onDone} disabled={saving} className="mt-1 block min-h-11 w-full text-center font-medium text-muted-foreground">
          Not now
        </button>
      )}
    </>
  )

  return (
    <Shell footer={footer}>
      {profile?.area && <OnboardingSteps step={3} />}
      <p className="mb-2 text-xs font-bold uppercase tracking-[0.06em] text-muted-foreground">{eyebrow}</p>
      <h1 className="mb-2 text-2xl font-display font-normal">Worth doing this month</h1>
      <p className="mb-6 text-muted-foreground">
        {profile?.area ? "Nothing is added until you tap Add." : "What most homes need now. Nothing is added until you tap Add."}
      </p>
      {note && <p role="status" className="mb-4 text-sm" style={{ color: "var(--hh-sub)" }}>{note}</p>}

      {rows.length === 0 ? (
        <p className="rounded-2xl border bg-[var(--hh-surface)] px-5 py-6 text-center" style={{ borderColor: "var(--hh-line)" }} data-testid="first-list-empty">
          Nothing pressing this month.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--hh-line)] overflow-hidden rounded-2xl border bg-[var(--hh-surface)]" style={{ borderColor: "var(--hh-line)" }} data-testid="first-list">
          {rows.map((r) => (
            <ListRow key={r.entry.key} row={r} checked={isChecked(r)} answer={answers[r.entry.key] ?? null}
              onToggle={() => setChecked((s) => ({ ...s, [r.entry.key]: !isChecked(r) }))}
              onAnswer={(a) => {
                setAnswers((s) => ({ ...s, [r.entry.key]: a }))
                setChecked((s) => { const n = { ...s }; delete n[r.entry.key]; return a === "yes" ? { ...n, [r.entry.key]: true } : n })
              }}
              onRemove={() => setAskWhy(r)}
            />
          ))}
        </ul>
      )}

      {list.leftOff.length > 0 && (
        <div className="mt-4 rounded-2xl px-5 py-4" style={{ background: "var(--hh-gold-soft)" }} data-testid="not-on-your-list">
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.06em]" style={{ color: "var(--hh-gold-ink)" }}>Not on your list</p>
          <ul className="space-y-2">
            {list.leftOff.map((x) => (
              <li key={x.reason} className="flex items-start gap-3 text-[0.9375rem]">
                <span className="min-w-0 flex-1" style={{ color: "var(--hh-gold-ink)" }}>{x.label}</span>
                <button type="button" className="min-h-11 -my-3 shrink-0 font-bold" style={{ color: "var(--hh-gold-ink)" }}
                  onClick={() => changeLeftOff(x.reason)}>
                  Change
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!profile?.area && (
        <div className="mt-4 flex items-center gap-3 rounded-2xl border border-dashed px-5 py-4" style={{ borderColor: "var(--hh-line2)" }}>
          <span className="min-w-0 flex-1 text-[0.9375rem] text-muted-foreground">Add your zip for tasks that fit your area.</span>
          <button type="button" onClick={onAddZip} className="min-h-11 shrink-0 font-bold" style={{ color: "var(--hh-teal)" }}>Add zip</button>
        </div>
      )}

      <WhyNotSheet row={askWhy} homeType={homeType} onClose={() => setAskWhy(null)}
        onPick={(why) => { if (askWhy) setRemoved((s) => ({ ...s, [askWhy.entry.key]: why })); setAskWhy(null) }} />
    </Shell>
  )

  function changeLeftOff(reason: LeftOffReason) {
    if (reason === "freeze_free") setC((x) => ({ ...x, freeze: true }))
    else setExteriorMine(true)
  }
}

function ListRow({ row, checked, answer, onToggle, onAnswer, onRemove }: {
  row: FirstListRow
  checked: boolean
  answer: Answer | null
  onToggle: () => void
  onAnswer: (a: Answer) => void
  onRemove: () => void
}) {
  const e = row.entry
  const essential = e.priorityTier === "essential"
  const locked = answer === "no"
  return (
    <li className="flex gap-4 px-5 py-5" data-testid="first-list-row">
      <button type="button" role="checkbox" aria-checked={checked} aria-label={`Add ${e.title}`} disabled={locked} onClick={onToggle}
        className={cn("mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border-2 hit-44", checked ? "border-transparent" : "border-[var(--hh-sub)]")}
        style={checked ? { background: "var(--hh-teal-fill)", color: "var(--hh-on-fill)" } : undefined}>
        {checked && <CheckIcon className="size-4" aria-hidden />}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <p className="min-w-0 flex-1 font-semibold" style={{ color: "var(--hh-ink)" }}>{e.title}</p>
          <button type="button" onClick={onRemove} aria-label={`Not ${e.title}`} className="hit-44 -mr-1 shrink-0 p-1 text-muted-foreground">
            <XIcon className="size-5" aria-hidden />
          </button>
        </div>
        <span className="mt-1.5 inline-block rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-[0.04em]"
          style={essential ? { background: "var(--hh-clay-soft)", color: "var(--hh-clay-ink)" } : { background: "var(--hh-teal-wash)", color: "var(--hh-teal)" }}>
          {essential ? "Essential" : "Recommended"}
        </span>
        <p className="mt-1.5 text-sm text-muted-foreground">{CADENCE[e.scheduleType] ?? e.cadenceLabel} · {e.minutes} min</p>
        {row.reason && <p className="mt-1 text-sm text-muted-foreground">{row.reason}</p>}
        {row.question && (
          <div className="mt-3">
            <p className="mb-2 font-medium" style={{ color: "var(--hh-ink)" }}>{row.question.text}</p>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={row.question.text}>
              {(["yes", "no", "unsure"] as const).map((a) => (
                <button key={a} type="button" role="radio" aria-checked={answer === a} onClick={() => onAnswer(a)}
                  className={cn("min-h-11 rounded-full border px-4 font-medium", answer === a ? "border-[var(--hh-teal)]" : "border-[var(--hh-line2)]")}
                  style={answer === a ? { background: "var(--hh-teal-wash)", color: "var(--hh-teal)" } : undefined}>
                  {a === "yes" ? "Yes" : a === "no" ? "No" : "Not sure"}
                </button>
              ))}
            </div>
            {answer === "no" && <p className="mt-2 text-sm text-muted-foreground">Got it. We won&apos;t suggest this.</p>}
          </div>
        )}
      </div>
    </li>
  )
}

function WhyNotSheet({ row, homeType, onClose, onPick }: {
  row: FirstListRow | null
  homeType: HomeType | null
  onClose: () => void
  onPick: (why: WhyNot | "skip") => void
}) {
  const shared = homeType === "condo" || homeType === "apartment" || homeType === "townhouse"
  return (
    <Sheet open={row !== null} onOpenChange={(o) => { if (!o) onClose() }}>
      <SheetContent side="bottom" className="rounded-t-3xl">
        <SheetHeader>
          <SheetTitle className="font-display text-2xl font-normal">Why not this one?</SheetTitle>
          <SheetDescription>Optional. It helps us skip things like it.</SheetDescription>
        </SheetHeader>
        <div className="space-y-2 px-4 pb-2">
          {shared && <OptionRow role="button" selected={false} onClick={() => onPick("building")} label="The building handles it" hint="Hides roof, gutter and pest tasks" />}
          <OptionRow role="button" selected={false} onClick={() => onPick("none")} label="We don’t have one" />
          <OptionRow role="button" selected={false} onClick={() => onPick("recent")} label="Already done recently" hint="We’ll offer it again next season" />
          <OptionRow role="button" selected={false} onClick={() => onPick("not_for_me")} label="Just not for me" />
          <button type="button" onClick={() => onPick("skip")} className="block min-h-11 w-full text-center font-medium text-muted-foreground">Skip</button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
