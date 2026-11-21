/**
 * The first minute (D8, design/first-minute-onboarding.md), before any account
 * (design/account-after-list.md; approved mock PBDvYh7MXrHZzibneCCRUH).
 *
 *   1. Where's home? — a zip, or Skip.
 *   2. What your area means for upkeep — only the zip facts that change this
 *      month's list, each with its source and a one-tap "Not true here" with
 *      Undo; then the home type.
 *   3. Worth doing this month — at most three rows and two questions.
 *
 * NOTHING is written to the database on the way. Every step writes to the
 * on-device draft (firstMinuteDraft.ts). "Add N tasks" or "Not now" asks for an
 * account if there isn't one ("Keep your list"), then the home, its profile
 * and the picked tasks are saved together (firstMinuteCommit.ts).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Navigate, useNavigate } from "react-router-dom"
import { CheckIcon, XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { KeepListSheet, type KeepSheetView } from "@/components/onboarding/KeepListSheet"
import { takeAppleRedirectError, useAuth } from "@/modules/auth"
import { useCurrentHome } from "@/modules/home"
import type { HomeProfile, HomeType, Climate } from "@/modules/home/services/homeProfileService"
import { lookupZipArea, toHomeArea, type ZipLookup } from "@/modules/home/services/zipAreaService"
import {
  EMPTY_DRAFT, clearDraft, loadDraft, saveDraft,
  type Answer, type DraftList, type DraftProfile, type FirstMinuteDraft, type Pending, type Step, type WhyNot,
} from "@/modules/home/services/firstMinuteDraft"
import { addToExistingHome, commitFirstMinute } from "@/modules/home/services/firstMinuteCommit"
import { OnboardingSteps, OptionRow } from "@/modules/home/components/onboardingParts"
import { CLIMATE_OPTIONS, HOME_TYPE_OPTIONS, buildingHandlesByDefault, freezeRiskFor } from "@/modules/home/components/onboardingOptions"
import { FactRow, HAZARD_TITLE } from "@/modules/home/components/areaFacts"
import { firstDueDates, firstList, type FirstListRow, type LeftOffReason } from "../../shared/care/firstList"
import { coldestNightF, type ZipArea } from "../../shared/area/zipArea"
import type { CareFacts } from "../../shared/care/library"
import { localToday } from "../../shared/dates/calendar"
import { track } from "@/lib/analytics"
import { listInput, type Corrections } from "@/lib/firstListInput"
import { cn } from "@/lib/utils"

const MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
const TYPE_WORD: Record<HomeType, string> = { house: "House", condo: "Condo", townhouse: "Townhouse", apartment: "Apartment", other: "Home" }
const CADENCE: Record<string, string> = { weekly: "Weekly", monthly: "Monthly", quarterly: "Every 3 months", semiannual: "Twice a year", annual: "Yearly" }
const H1 = "text-[1.75rem] leading-[2.125rem] font-display font-bold tracking-[-0.01em]"

const thisMonth = () => Number(localToday().slice(5, 7))
const tasksWord = (n: number) => `${n} task${n === 1 ? "" : "s"}`
const theseTasks = (n: number) => (n === 1 ? "this task" : `these ${n} tasks`)

/** The draft's fields read as a profile, for the steps and the list maths that take one. */
function asProfile(p: DraftProfile): HomeProfile {
  return {
    home_id: "", task_level: null, task_level_hidden: 0, home_type: p.home_type ?? null, ownership: null, ownership_duration: null,
    top_concerns: [], preferred_mode: "unset", climate: p.climate ?? null, freeze_risk: p.freeze_risk ?? null, zip: p.zip ?? null,
    area: p.area ?? null, climate_source: p.climate_source ?? null, care_facts: p.care_facts ?? {}, dismissed_care: p.dismissed_care ?? [],
    winterizing_offer_answered_at: null, refresh_answered_month: null, completed_at: p.completed_at ?? null, created_at: "", updated_at: "",
  }
}

/** The account ask, worded for what they are about to keep. */
function askFor(pending: Pending, profile: DraftProfile, error: string | null): KeepSheetView {
  if (pending.kind === "add") {
    return { kind: "ask", title: "Keep your list", description: `Make a free account to save ${theseTasks(pending.tasks.length)}.`, error }
  }
  return profile.zip || profile.home_type
    ? { kind: "ask", title: "Keep your area and home type", description: "Make a free account so they’re here next time.", error }
    : { kind: "ask", title: "Save your home", description: "Make a free account to start your home.", error }
}

const savingTitle = (p: Pending) => (p.kind === "add" ? "Saving your list…" : "Saving your home…")

export default function FirstMinute() {
  const navigate = useNavigate()
  const { user, loading: authLoading } = useAuth()
  const { home, loading: homeLoading, refresh } = useCurrentHome()
  const [draft, setDraft] = useState<FirstMinuteDraft>(() => loadDraft() ?? EMPTY_DRAFT)
  const draftRef = useRef(draft)
  const done = useRef(false)
  const running = useRef(false)
  const [sheet, setSheet] = useState<KeepSheetView | null>(null)
  const [existingHomeId, setExistingHomeId] = useState<string | null>(null)
  // A failed Apple redirect reports on the return load; show it in the sheet once.
  const [redirectError] = useState(takeAppleRedirectError)

  useEffect(() => {
    draftRef.current = draft
    if (!done.current) saveDraft(draft)
  }, [draft])

  const update = useCallback((fn: (d: FirstMinuteDraft) => FirstMinuteDraft) => setDraft(fn), [])

  const finish = useCallback(async (homeId: string | null) => {
    done.current = true
    clearDraft()
    setDraft(EMPTY_DRAFT)
    setSheet(null)
    await refresh(homeId ?? undefined)
    navigate("/home", { replace: true })
  }, [refresh, navigate])

  const runSave = useCallback(async (pending: Pending, intoExisting?: string) => {
    if (!user || running.current) return
    running.current = true
    setSheet({ kind: "saving", title: savingTitle(pending) })
    const d = draftRef.current
    const tasks = pending.kind === "add" ? pending.tasks : []
    const r = intoExisting
      ? await addToExistingHome(intoExisting, tasks, d.addedKeys)
      : await commitFirstMinute({ userId: user.id, patch: pending.patch, tasks, createdHomeId: d.createdHomeId, addedKeys: d.addedKeys })
    running.current = false
    if (r.kind === "saved") {
      if (pending.kind === "add") track("first_list_added", { count: r.addedKeys.length, keys: r.addedKeys.join(",") })
      await finish(r.homeId)
      return
    }
    if (r.kind === "existing") {
      // Nothing to add ("Not now"): the home they already have is where they go.
      if (tasks.length === 0) { await finish(r.homeId); return }
      setExistingHomeId(r.homeId)
      setSheet({ kind: "existing", homeName: r.homeName, count: tasks.length })
      return
    }
    update((x) => ({ ...x, createdHomeId: r.createdHomeId, addedKeys: r.addedKeys }))
    setSheet({ kind: "error", message: r.message })
  }, [user, finish, update])

  // The account just appeared with a save waiting (signed in from the sheet, or
  // back from Apple's redirect): run it. Once per sign-in; Try again is manual.
  const autoRan = useRef<string | null>(null)
  useEffect(() => {
    if (!user || !draft.pending || running.current || autoRan.current === user.id) return
    autoRan.current = user.id
    void runSave(draft.pending)
  }, [user, draft.pending, runSave])

  /** Add / Not now: keep what they asked for; save now if there's an account. */
  const request = (pending: Pending) => {
    update((d) => ({ ...d, pending }))
    if (user) {
      autoRan.current = user.id
      void runSave(pending)
    }
  }

  const closeSheet = () => {
    setSheet(null)
    update((d) => ({ ...d, pending: null }))
  }

  if (authLoading || (user && homeLoading && !draft.pending)) {
    return <div className="min-h-screen bg-background" aria-busy="true" aria-label="Loading" />
  }
  // Someone with a home has nothing to set up — unless they just signed in
  // from the sheet and their list is waiting for an answer.
  if (user && home && !draft.pending) return <Navigate to="/home" replace />

  const view = sheet ?? (draft.pending && !user ? askFor(draft.pending, draft.profile, redirectError) : null)

  return (
    <>
      <Flow draft={draft} update={update} onRequest={request} />
      <KeepListSheet view={view}
        onClose={closeSheet}
        onRetry={() => { if (draftRef.current.pending) void runSave(draftRef.current.pending) }}
        onAddToExisting={() => { if (draftRef.current.pending && existingHomeId) void runSave(draftRef.current.pending, existingHomeId) }}
        onSkipExisting={() => void finish(existingHomeId)}
      />
    </>
  )
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

type FlowProps = {
  draft: FirstMinuteDraft
  update: (fn: (d: FirstMinuteDraft) => FirstMinuteDraft) => void
  onRequest: (p: Pending) => void
}

function Flow({ draft, update, onRequest }: FlowProps) {
  const step = draft.step
  const profile = useMemo(() => asProfile(draft.profile), [draft.profile])
  // Each step starts at its top: the list would otherwise open where step 2 was scrolled to.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [step])

  const go = (next: Step, patch: DraftProfile = {}) =>
    update((d) => ({ ...d, step: next, profile: { ...d.profile, ...patch } }))

  if (step === "zip") return <ZipStep onDone={(patch) => go(patch ? "area" : "list", patch ?? {})} />
  if (step === "addzip") return <AddZip onBack={() => go("list")} onSaved={(patch) => go("area", patch)} />
  if (step === "area") return <AreaStep profile={profile} onSaved={(patch) => go("list", patch)} />
  return (
    <ListStep profile={profile} draftProfile={draft.profile} saved={draft.list}
      onChange={(list) => update((d) => ({ ...d, list }))}
      onAddZip={() => go("addzip")} onRequest={onRequest} />
  )
}

// ── step 1 ────────────────────────────────────────────────────────────────────

/**
 * A zip, or Skip. Only the zip is asked — never a street address, never device
 * location (must-be-true 1) — and it is looked up in a table on the device (2).
 * `onDone(null)` is Skip.
 */
function ZipStep({ onDone }: { onDone: (patch: DraftProfile | null) => void }) {
  const [zip, setZip] = useState("")
  const [lookup, setLookup] = useState<ZipLookup | null>(null)
  const [climate, setClimate] = useState<Climate | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tableFailed, setTableFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const unknown = lookup?.kind === "unknown"

  async function handleContinue(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    if (unknown) {
      if (!climate) return
      track("onboarding_zip_entered", { known: false })
      onDone({ climate, freeze_risk: freezeRiskFor(climate), climate_source: "owner" })
      return
    }
    setBusy(true)
    let found: ZipLookup
    try {
      found = await lookupZipArea(zip)
      setTableFailed(false)
    } catch (err) {
      console.warn("[first minute] the zip table did not load:", err instanceof Error ? err.message : err)
      setTableFailed(true)
      setBusy(false)
      return
    }
    setBusy(false)
    setLookup(found)
    if (found.kind === "invalid") {
      setError("Enter the five digits of your zip code.")
      return
    }
    if (found.kind === "unknown") return // the climate choices take over
    const a = found.area
    track("onboarding_zip_entered", { known: true })
    onDone({ zip: a.zip, climate: a.climate, freeze_risk: a.freezeRisk, climate_source: "zip", area: toHomeArea(a) })
  }

  return (
    <Shell>
      <OnboardingSteps step={1} />
      <h1 className={cn(H1, "mb-2")}>Where&apos;s home?</h1>
      <p className="mb-6 text-muted-foreground">A house in Minneapolis needs different care than one in Miami. Your zip tells Homehub your winters, your storm season and what homes near you usually need.</p>
      <form onSubmit={(e) => void handleContinue(e)} className="space-y-5">
        <div>
          <label className="mb-1.5 block text-sm font-medium" htmlFor="onboarding-zip">Zip code</label>
          <Input
            id="onboarding-zip"
            inputMode="numeric"
            autoComplete="postal-code"
            maxLength={5}
            value={zip}
            onChange={(e) => {
              setZip(e.target.value.replace(/\D/g, "").slice(0, 5))
              if (lookup) setLookup(null)
              setClimate(null)
              setError(null)
            }}
            aria-invalid={unknown || undefined}
            aria-describedby="onboarding-zip-note"
            className={cn("h-12 text-xl font-semibold tracking-[0.2em]", unknown && "border-[var(--hh-clay)]")}
          />
          {unknown ? (
            <p id="onboarding-zip-note" role="alert" className="mt-1.5 text-sm font-medium" style={{ color: "var(--hh-clay-ink)" }}>
              We don’t have {zip}. Pick your climate instead.
            </p>
          ) : (
            <p id="onboarding-zip-note" className="mt-1.5 text-sm text-muted-foreground">Just the zip. Never your street.</p>
          )}
        </div>

        {unknown && (
          <div className="space-y-2" role="radiogroup" aria-label="Climate">
            {CLIMATE_OPTIONS.map((o) => (
              <OptionRow key={o.value} role="radio" selected={climate === o.value} ariaChecked={climate === o.value}
                onClick={() => setClimate(o.value)} label={o.label} hint={o.hint} />
            ))}
          </div>
        )}

        {tableFailed && (
          <div role="alert" className="rounded-xl border px-4 py-3 text-sm" style={{ borderColor: "var(--hh-line)", background: "var(--hh-surface)" }}>
            Couldn&apos;t load area data. Try again, or skip for now.
          </div>
        )}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

        <Button type="submit" className="h-12 w-full text-base" disabled={busy || (unknown ? !climate : zip.length !== 5)}>
          {tableFailed ? "Try again" : "Continue"}
        </Button>
        <button type="button" onClick={() => onDone(null)} disabled={busy}
          className="block min-h-11 w-full text-center text-[0.9375rem] font-medium text-muted-foreground">
          Skip for now
        </button>
      </form>
    </Shell>
  )
}

// ── step 2 ────────────────────────────────────────────────────────────────────

/** The list for a home type, with the corrections applied — used to decide which facts matter. */
function listFor(profile: HomeProfile | null, homeType: HomeType | null, c: Corrections) {
  return firstList(listInput(profile, homeType, c, {}))
}

const sig = (l: ReturnType<typeof firstList>) => JSON.stringify([l.rows.map((r) => r.entry.key), l.leftOff.map((x) => x.reason)])

/** A fact is shown only when it changes this month's list, for some home type (must-be-true 6). */
function factMatters(profile: HomeProfile | null, flip: Partial<Corrections>): boolean {
  const base: Corrections = { freeze: null, hazardsOff: [] }
  return HOME_TYPE_OPTIONS.some(({ value }) => sig(listFor(profile, value, base)) !== sig(listFor(profile, value, { ...base, ...flip })))
}

function AreaStep({ profile, onSaved }: { profile: HomeProfile; onSaved: (patch: DraftProfile) => void }) {
  const area = profile.area
  const [homeType, setHomeType] = useState<HomeType | null>(profile.home_type)
  const [c, setC] = useState<Corrections>({ freeze: null, hazardsOff: [] })

  const derivedFreeze = profile.freeze_risk
  const showFreeze = !!area && derivedFreeze !== null && factMatters(profile, { freeze: !derivedFreeze })
  const hazards = (area?.hazards ?? []).filter((h) => factMatters(profile, { hazardsOff: [h] }))
  const range = coldestNightF(area?.hardinessZone)

  function save() {
    if (!homeType) return
    const freezeChanged = c.freeze !== null && c.freeze !== derivedFreeze
    if (freezeChanged) track("area_fact_corrected", { fact: "freeze" })
    for (const h of c.hazardsOff) track("area_fact_corrected", { fact: h })
    onSaved({
      home_type: homeType,
      ...(freezeChanged ? { freeze_risk: c.freeze, climate_source: "owner" as const } : {}),
      ...(area && c.hazardsOff.length
        ? { area: { ...area, hazards: area.hazards.filter((h) => !c.hazardsOff.includes(h)), hazardsCorrected: [...new Set([...area.hazardsCorrected, ...c.hazardsOff])] } }
        : {}),
      // The zip and home type answer what the old five questions were for.
      completed_at: new Date().toISOString(),
    })
  }

  return (
    <Shell>
      <OnboardingSteps step={2} />
      {area && (
        <>
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.06em] text-muted-foreground">
            {profile.zip}{area.county ? ` · ${area.county}` : ""}
          </p>
          <h1 className={cn(H1, "mb-4")}>What your area means for upkeep</h1>
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
      {!area && <h1 className={cn(H1, "mb-6")}>What kind of home?</h1>}
      {area && <p className="mb-3 font-medium">A zip can&apos;t tell us this. What kind of home?</p>}
      <div className="mb-8 space-y-2" role="radiogroup" aria-label="Home type">
        {HOME_TYPE_OPTIONS.map((o) => (
          <OptionRow key={o.value} role="radio" selected={homeType === o.value} ariaChecked={homeType === o.value}
            onClick={() => setHomeType(o.value)} label={o.label} hint={o.hint} />
        ))}
      </div>
      <Button className="h-12 w-full text-base" disabled={!homeType} onClick={save}>See this month</Button>
    </Shell>
  )
}

// ── adding a zip from the skip path ───────────────────────────────────────────

function AddZip({ onSaved, onBack }: { onSaved: (patch: DraftProfile) => void; onBack: () => void }) {
  const [zip, setZip] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    setError(null)
    setBusy(true)
    let area: ZipArea
    try {
      const found = await lookupZipArea(zip)
      if (found.kind !== "found") {
        setBusy(false)
        setError(found.kind === "unknown" ? `We don’t have ${zip}. Skip it for now, or set your climate in Settings.` : "Enter the five digits of your zip code.")
        return
      }
      area = found.area
    } catch (err) {
      console.warn("[first minute] the zip table did not load:", err instanceof Error ? err.message : err)
      setBusy(false)
      setError("Couldn’t load area data. Try again.")
      return
    }
    setBusy(false)
    track("onboarding_zip_entered", { known: true })
    onSaved({ zip: area.zip, climate: area.climate, freeze_risk: area.freezeRisk, climate_source: "zip", area: toHomeArea(area) })
  }
  return (
    <Shell>
      <h1 className={cn(H1, "mb-2")}>Where&apos;s home?</h1>
      <p className="mb-6 text-muted-foreground">A house in Minneapolis needs different care than one in Miami. Your zip tells Homehub your winters, your storm season and what homes near you usually need. Just the zip. Never your street.</p>
      <form onSubmit={(e) => void save(e)} className="space-y-5">
        <Input aria-label="Zip code" inputMode="numeric" autoComplete="postal-code" maxLength={5} value={zip}
          onChange={(e) => { setZip(e.target.value.replace(/\D/g, "").slice(0, 5)); setError(null) }}
          className="h-12 text-xl font-semibold tracking-[0.2em]" />
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="h-12 w-full text-base" disabled={zip.length !== 5 || busy}>Continue</Button>
        <button type="button" onClick={onBack} className="block min-h-11 w-full text-center font-medium text-muted-foreground">Back</button>
      </form>
    </Shell>
  )
}

// ── step 3 ────────────────────────────────────────────────────────────────────

const freshList = (): DraftList => ({
  month: thisMonth(), answers: {}, checked: {}, removed: {}, corrections: { freeze: null, hazardsOff: [] }, exteriorMine: false,
})

type ListProps = {
  profile: HomeProfile
  draftProfile: DraftProfile
  /** The choices from before a reload (Apple's redirect); last month's are not reused. */
  saved: DraftList | null
  onChange: (list: DraftList) => void
  onAddZip: () => void
  onRequest: (p: Pending) => void
}

function ListStep({ profile, draftProfile, saved, onChange, onAddZip, onRequest }: ListProps) {
  const homeType = profile.home_type
  const [ls, setLs] = useState<DraftList>(() => (saved && saved.month === thisMonth() ? saved : freshList()))
  const { month, answers, checked, removed, corrections: c, exteriorMine } = ls
  const [askWhy, setAskWhy] = useState<FirstListRow | null>(null)
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => {
    onChange(ls)
    // onChange is a fresh closure each render; the list state is what changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ls])

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

  const rows = list.rows.filter((r) => !(r.entry.key in removed))
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

  function add() {
    if (picked.length === 0) return
    // Built on the 30th, tapped on the 1st: the list is this month's, not last month's.
    if (thisMonth() !== month) {
      setLs((x) => ({ ...x, month: thisMonth() }))
      setNote(`It’s ${MONTH[thisMonth() - 1]} now, so the list has changed. Check it and tap Add again.`)
      return
    }
    setNote(null)

    // Her answers and corrections, saved with the home.
    const facts: CareFacts = { ...answerFacts(list.rows) }
    const dismissed: string[] = []
    for (const r of list.rows) {
      const why = removed[r.entry.key]
      if (why === "building") { facts.building_handles_exterior = true; facts.building_handles_pests = true }
      if (why === "none") { if (r.entry.fact) facts[r.entry.fact] = false; else dismissed.push(r.entry.key) }
      if (why === "not_for_me") dismissed.push(r.entry.key)
    }
    if (exteriorMine) facts.building_handles_exterior = false
    else if (buildingHandlesByDefault(homeType) && profile.care_facts.building_handles_exterior === undefined && facts.building_handles_exterior === undefined) {
      facts.building_handles_exterior = true // the default she saw, shown and changeable
    }
    const freezeChanged = c.freeze !== null && c.freeze !== profile.freeze_risk
    const patch: DraftProfile = {
      ...draftProfile,
      care_facts: { ...profile.care_facts, ...facts },
      ...(dismissed.length ? { dismissed_care: [...new Set([...profile.dismissed_care, ...dismissed])] } : {}),
      ...(freezeChanged ? { freeze_risk: c.freeze, climate_source: "owner" as const } : {}),
    }
    // The tasks, due this weekend (must-be-true 11).
    const due = firstDueDates(localToday(), picked.length)
    onRequest({ kind: "add", patch, tasks: picked.map((r, i) => ({ key: r.entry.key, due: due[i] })) })
  }

  const skip = () => onRequest({ kind: "keep", patch: draftProfile })

  const eyebrow = [MONTH[month - 1], homeType && profile.area ? TYPE_WORD[homeType] : null, profile.area ? profile.zip : null].filter(Boolean).join(" · ")

  const footer = (
    <>
      {/* Owner, 2026-11-20: after answering Yes it "wasn't clear if it had
          saved". The count says what is picked and that nothing is saved yet
          (Footnote, 13/18, secondary). */}
      {rows.length > 0 && picked.length > 0 && (
        <p role="status" className="mb-2 text-center text-[0.8125rem] leading-[1.125rem] text-muted-foreground" data-testid="picked-status">
          {picked.length} picked, not added yet
        </p>
      )}
      {rows.length > 0 ? (
        <Button className="h-12 w-full text-base" disabled={picked.length === 0} onClick={add}>
          {picked.length === 0 ? "Add" : `Add ${tasksWord(picked.length)}`}
        </Button>
      ) : (
        <Button className="h-12 w-full text-base" onClick={skip}>Go to Home</Button>
      )}
      {rows.length > 0 && (
        <button type="button" onClick={skip} className="mt-1 block min-h-11 w-full text-center font-medium text-muted-foreground">
          Not now
        </button>
      )}
    </>
  )

  return (
    <Shell footer={footer}>
      {profile.area && <OnboardingSteps step={3} />}
      <p className="mb-2 text-xs font-bold uppercase tracking-[0.06em] text-muted-foreground">{eyebrow}</p>
      <h1 className={cn(H1, "mb-2")}>Worth doing this month</h1>
      <p className="mb-6 text-muted-foreground">
        {profile.area ? "Nothing is added until you tap Add." : "What most homes need now. Nothing is added until you tap Add."}
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
              onToggle={() => setLs((x) => ({ ...x, checked: { ...x.checked, [r.entry.key]: !isChecked(r) } }))}
              onAnswer={(a) => setLs((x) => {
                const nextChecked = { ...x.checked }
                delete nextChecked[r.entry.key]
                return { ...x, answers: { ...x.answers, [r.entry.key]: a }, checked: a === "yes" ? { ...nextChecked, [r.entry.key]: true } : nextChecked }
              })}
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

      {!profile.area && (
        <div className="mt-4 flex items-center gap-3 rounded-2xl border border-dashed px-5 py-4" style={{ borderColor: "var(--hh-line2)" }}>
          <span className="min-w-0 flex-1 text-[0.9375rem] text-muted-foreground">Add your zip for tasks that fit your area.</span>
          <button type="button" onClick={onAddZip} className="min-h-11 shrink-0 font-bold" style={{ color: "var(--hh-teal)" }}>Add zip</button>
        </div>
      )}

      <WhyNotSheet row={askWhy} homeType={homeType} onClose={() => setAskWhy(null)}
        onPick={(why) => { const key = askWhy?.entry.key; if (key) setLs((x) => ({ ...x, removed: { ...x.removed, [key]: why } })); setAskWhy(null) }} />
    </Shell>
  )

  function changeLeftOff(reason: LeftOffReason) {
    if (reason === "freeze_free") setLs((x) => ({ ...x, corrections: { ...x.corrections, freeze: true } }))
    else setLs((x) => ({ ...x, exteriorMine: true }))
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
      {/* Owner, walk comments 2026-11-20: the gap above the priority must
          match the gap below it, and the type must match the rest of the app.
          Apple text styles — name Headline (17/22 semibold), priority Caption 1
          (12/16), how often Subhead (15/20), the question Callout (16/21
          semibold) — on one 6 pt step; the HIG gives no row spacing, so 6 pt
          and the 12 pt before a question are ours. The × is held to the name's
          22 pt line (its 44 pt target comes from hit-44), so it no longer makes
          that line taller than the others. */}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-start gap-2">
          <p className="min-w-0 flex-1 text-[1.0625rem] leading-[1.375rem] font-semibold" style={{ color: "var(--hh-ink)" }}>{e.title}</p>
          <button type="button" onClick={onRemove} aria-label={`Not ${e.title}`} className="hit-44 -my-0.5 -mr-1 shrink-0 p-0.5 text-muted-foreground">
            <XIcon className="size-5" aria-hidden />
          </button>
        </div>
        <span className="self-start rounded-full px-2.5 py-0.5 text-xs leading-4 font-bold uppercase tracking-[0.04em]"
          style={essential ? { background: "var(--hh-clay-soft)", color: "var(--hh-clay-ink)" } : { background: "var(--hh-teal-wash)", color: "var(--hh-teal)" }}>
          {essential ? "Essential" : "Recommended"}
        </span>
        <p className="text-[0.9375rem] leading-5 text-muted-foreground">{CADENCE[e.scheduleType] ?? e.cadenceLabel} · {e.minutes} min</p>
        {/* No "why this month" line: owner, 2026-11-20 — "only include if
            they're absolutely critical to the task". firstList still computes
            row.reason; nothing on this screen shows it. */}
        {row.question && (
          <div className="mt-1.5">
            <p className="mb-2 text-base leading-[1.3125rem] font-semibold" style={{ color: "var(--hh-ink)" }}>{row.question.text}</p>
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
