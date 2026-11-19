import { useCallback, useEffect, useRef, useState } from "react"
import { Loader2Icon, HomeIcon, CheckCircle2Icon } from "lucide-react"
import { useDepsChanged } from "@/hooks/useDepsChanged"
import { SectionCard } from "@/components/layout"
import { CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import {
  getHomeProfile,
  upsertHomeProfile,
  type HomeProfile,
  type HomeType,
  type Ownership,
  type OwnershipDuration,
  type PreferredMode,
  type Climate,
  type ClimateSource,
  type HomeArea,
  type TopConcernKey,
  markWinterizingOfferAnswered,
} from "@/modules/home"
import { lookupZipArea, toHomeArea } from "@/modules/home/services/zipAreaService"
import { FactRow, HAZARD_TITLE, type AreaHazard } from "@/modules/home/components/areaFacts"
import { coldestNightF, type ZipArea } from "../../../shared/area/zipArea"
import { track } from "@/lib/analytics"
import {
  climateOffer,
  climateOrigin,
  climatePatch,
  shownClimate,
  type ZipClimateInput,
} from "./zipClimate"
import { useAuth } from "@/modules/auth"
import {
  getWinterizingTasks,
  turnOffWinterizingTasks,
  undoTurnOffWinterizing,
  type TurnOffResult,
  type WinterizingTask,
} from "@/modules/care"
import { UndoBar } from "@/components/ui/UndoBar"

type Props = {
  homeId: string
}

const HOME_TYPES: { value: HomeType; label: string }[] = [
  { value: "house", label: "House" },
  { value: "condo", label: "Condo" },
  { value: "townhouse", label: "Townhouse" },
  { value: "apartment", label: "Apartment" },
  { value: "other", label: "Other" },
]

const OWNERSHIPS: { value: Ownership; label: string }[] = [
  { value: "own", label: "I own it" },
  { value: "rent", label: "I rent it" },
]

const DURATIONS: { value: OwnershipDuration; label: string }[] = [
  { value: "new_under_1yr", label: "Less than 1 year" },
  { value: "1_to_5yr", label: "1–5 years" },
  { value: "5_plus", label: "5+ years" },
]

const CONCERNS: { value: TopConcernKey; label: string }[] = [
  { value: "surprise_repairs", label: "Avoiding surprise repairs" },
  { value: "warranty_tracking", label: "Warranty tracking" },
  { value: "seasonal_maintenance", label: "Seasonal maintenance" },
  { value: "saving_money", label: "Saving money on upkeep" },
  { value: "not_sure", label: "Not sure yet" },
]

const CLIMATES: { value: Climate; label: string }[] = [
  { value: "mild", label: "Mild — rarely freezes" },
  { value: "moderate", label: "Moderate — some frost" },
  { value: "cold", label: "Cold — hard freezes" },
  { value: "hot", label: "Hot / arid" },
]

/** "Mild — rarely freezes", plus the freeze fact when it is not what that climate implies. */
function climateWords(climate: Climate, freeze: boolean | null): string {
  const label = CLIMATES.find((c) => c.value === climate)?.label ?? climate
  const implied = climate === "mild" || climate === "hot" ? false : true
  if (freeze === null || freeze === implied) return label
  return `${label} · pipes ${freeze ? "can freeze" : "rarely freeze"}`
}

/** The zip lookup, which runs on the device as soon as five digits are typed. */
type ZipLookupState =
  | { status: "idle" }
  | { status: "busy" }
  | { status: "found"; area: ZipArea }
  | { status: "unknown" }
  | { status: "failed" }

const MODES: { value: PreferredMode; label: string; hint: string }[] = [
  { value: "ask_first", label: "Ask-first", hint: "Chat hero on Home" },
  { value: "inventory_first", label: "Inventory-first", hint: "Items & tasks hero on Home" },
  { value: "unset", label: "Balanced (default)", hint: "Show everything" },
]

/**
 * HH-166: the offer that follows a Mild/Hot save. The climate answer only ever
 * filtered manuals scanned AFTER it, so the owner — set to mild — still had a
 * "Winterize the washer" task. Now the save lists the winterizing tasks the
 * home already has, all ticked, and turns off only what she confirms.
 */
type WinterizingOffer = { tasks: WinterizingTask[]; checked: Set<string> }

export function HomeProfileSection({ homeId }: Props) {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)

  const [homeType, setHomeType] = useState<HomeType | "">("")
  const [ownership, setOwnership] = useState<Ownership | "">("")
  const [duration, setDuration] = useState<OwnershipDuration | "">("")
  /** A climate the owner picked from the list since the last save; null = untouched. */
  const [pickedClimate, setPickedClimate] = useState<Climate | "" | null>(null)
  const [concerns, setConcerns] = useState<TopConcernKey[]>([])
  const [mode, setMode] = useState<PreferredMode>("unset")
  const [completedAt, setCompletedAt] = useState<string | null>(null)
  // Tracks the last known updated_at so saves use a CAS guard.
  const [knownUpdatedAt, setKnownUpdatedAt] = useState<string | undefined>(undefined)

  const [offer, setOffer] = useState<WinterizingOffer | null>(null)
  const [offerBusy, setOfferBusy] = useState(false)
  const [offerError, setOfferError] = useState<string | null>(null)
  /** The receipt after a turn-off, with its Undo (the app's UndoBar). */
  const [bar, setBar] = useState<{ message: string; onUndo?: () => void; ms: number } | null>(null)
  const dismissBar = useCallback(() => setBar(null), [])
  /** The climate as last read or saved — the offer follows only a CHANGE to
   *  Mild/Hot, never a re-save of the profile (gate-1 review). */
  const [savedClimate, setSavedClimate] = useState<Climate | null>(null)
  const [savedFreeze, setSavedFreeze] = useState<boolean | null>(null)
  const [savedSource, setSavedSource] = useState<ClimateSource | null>(null)

  // D8 edge case: a home from before the first minute adds its zip here.
  // Nothing is written until Save, and an owner's own climate answer is only
  // ever OFFERED the zip's (zipClimate.ts).
  const [savedZip, setSavedZip] = useState<string | null>(null)
  const [savedArea, setSavedArea] = useState<HomeArea | null>(null)
  const [zip, setZip] = useState("")
  const [lookup, setLookup] = useState<ZipLookupState>({ status: "idle" })
  const [zipError, setZipError] = useState<string | null>(null)
  const [freezeFix, setFreezeFix] = useState<boolean | null>(null)
  const [hazardsOff, setHazardsOff] = useState<AreaHazard[]>([])
  const [useZip, setUseZip] = useState(false)
  const [offerKept, setOfferKept] = useState(false)
  /** A lookup that comes back after the zip changed again is dropped. */
  const lookupSeq = useRef(0)

  const resetZipEntry = (savedZipValue: string | null) => {
    lookupSeq.current += 1
    setZip(savedZipValue ?? "")
    setLookup({ status: "idle" })
    setZipError(null)
    setFreezeFix(null)
    setHazardsOff([])
    setUseZip(false)
    setOfferKept(false)
  }

  const applyProfile = (p: HomeProfile | null) => {
    setSavedClimate(p?.climate ?? null)
    setSavedFreeze(p?.freeze_risk ?? null)
    setSavedSource(p?.climate_source ?? null)
    setSavedZip(p?.zip ?? null)
    setSavedArea(p?.area ?? null)
    resetZipEntry(p?.zip ?? null)
    setPickedClimate(null)
    setHomeType(p?.home_type ?? "")
    setOwnership(p?.ownership ?? "")
    setDuration(p?.ownership_duration ?? "")
    setConcerns(p?.top_concerns ?? [])
    setMode(p?.preferred_mode ?? "unset")
    setCompletedAt(p?.completed_at ?? null)
    setKnownUpdatedAt(p?.updated_at ?? undefined)
  }

  // A home switch shows the spinner in the render that switches (it starts on
  // for the first read); the effect only reads.
  if (useDepsChanged([homeId])) {
    setLoading(true)
    setError(null)
    setOffer(null)
    setOfferError(null)
    setBar(null)
    resetZipEntry(null)
  }
  useEffect(() => {
    let cancelled = false
    getHomeProfile(homeId).then((result) => {
      if (cancelled) return
      if (result.error) setError(result.error.message)
      else applyProfile(result.data)
      setLoading(false)
      // HH-166: the owner was ALREADY Mild, so an offer that only follows a
      // change would never reach her. A freeze-free home that has never
      // answered the offer is asked once, here.
      const p = result.data
      if (!p || p.freeze_risk !== false || p.winterizing_offer_answered_at) return
      return getWinterizingTasks(homeId).then((res) => {
        if (cancelled) return
        if (res.error) {
          setOfferError(`Couldn't check for winterizing tasks: ${res.error.message}`)
          return
        }
        if (res.data.length > 0) setOffer({ tasks: res.data, checked: new Set(res.data.map((t) => t.taskTemplateId)) })
      })
    })
    return () => {
      cancelled = true
    }
  }, [homeId])

  const zipChanged = zip !== (savedZip ?? "")
  const pending = zipChanged && lookup.status === "found" ? lookup.area : null
  const zipInput: ZipClimateInput = {
    saved: { climate: savedClimate, freeze_risk: savedFreeze, climate_source: savedSource },
    pending,
    useZip,
    picked: pickedClimate,
    freezeFix,
  }
  const climate = shownClimate(zipInput)
  const origin = climateOrigin(zipInput)
  const suggestion = offerKept ? null : climateOffer(zipInput)

  const runLookup = async (value: string) => {
    const seq = ++lookupSeq.current
    setLookup({ status: "busy" })
    try {
      const found = await lookupZipArea(value)
      if (seq !== lookupSeq.current) return
      setLookup(found.kind === "found" ? { status: "found", area: found.area } : found.kind === "unknown" ? { status: "unknown" } : { status: "idle" })
    } catch (err) {
      if (seq !== lookupSeq.current) return
      console.warn(`[Settings] the zip table did not load (home ${homeId}):`, err instanceof Error ? err.message : err)
      setLookup({ status: "failed" })
    }
  }

  const changeZip = (raw: string) => {
    const next = raw.replace(/\D/g, "").slice(0, 5)
    setZip(next)
    setZipError(null)
    setFreezeFix(null)
    setHazardsOff([])
    setUseZip(false)
    setOfferKept(false)
    if (next.length === 5 && next !== (savedZip ?? "")) void runLookup(next)
    else {
      lookupSeq.current += 1
      setLookup({ status: "idle" })
    }
  }

  const toggleConcern = (key: TopConcernKey) => {
    setConcerns((prev) => {
      if (key === "not_sure") return prev.includes("not_sure") ? [] : ["not_sure"]
      const withoutNotSure = prev.filter((k) => k !== "not_sure")
      return withoutNotSure.includes(key)
        ? withoutNotSure.filter((k) => k !== key)
        : [...withoutNotSure, key]
    })
  }

  const offerWinterizingSweep = async () => {
    const res = await getWinterizingTasks(homeId)
    if (res.error) {
      setOfferError(`Couldn't check for winterizing tasks: ${res.error.message}`)
      return
    }
    if (res.data.length === 0) return
    setOffer({ tasks: res.data, checked: new Set(res.data.map((t) => t.taskTemplateId)) })
  }

  const handleSave = async () => {
    // A zip that is typed but not looked up is not saved quietly without it.
    if (zipChanged && zip !== "") {
      if (zip.length !== 5) {
        setZipError("Enter the five digits of your zip code.")
        return
      }
      if (lookup.status === "failed") {
        setZipError("Couldn't load area data. Try again, or clear the zip to save the rest.")
        return
      }
      if (lookup.status === "busy") return
    }
    setSaving(true)
    setError(null)
    setOffer(null)
    setOfferError(null)
    const climateFields = climatePatch(zipInput)
    const zipFields = pending
      ? { zip: pending.zip, area: toHomeArea(pending, hazardsOff) }
      : zipChanged && zip === "" ? { zip: null, area: null } : {}
    const result = await upsertHomeProfile(
      homeId,
      {
        home_type: homeType || null,
        ownership: ownership || null,
        ownership_duration: duration || null,
        ...climateFields,
        ...zipFields,
        top_concerns: concerns,
        preferred_mode: mode,
        // Promote to "completed" once user fills in the basics from Settings.
        completed_at:
          completedAt ?? (homeType && ownership && duration ? new Date().toISOString() : null),
      },
      knownUpdatedAt,
    )
    setSaving(false)
    if (result.error) {
      setError(result.error.message)
      return
    }
    // HH-166: the owner's home showed "Usually autumn" — the phrase for a home
    // with NO climate — after she had answered mild. Whatever lost it, a save
    // is only "Saved" if the home doc we read back carries what we wrote.
    if (
      (climateFields.climate !== undefined && result.data.climate !== climateFields.climate) ||
      (climateFields.freeze_risk !== undefined && result.data.freeze_risk !== climateFields.freeze_risk)
    ) {
      setError("Your climate didn't save. Try again.")
      return
    }
    if (zipFields.zip !== undefined && result.data.zip !== zipFields.zip) {
      setError("Your zip didn't save. Try again.")
      return
    }
    if (pending) {
      track("settings_zip_entered", { known: true })
      if (freezeFix !== null) track("area_fact_corrected", { fact: "freeze" })
      for (const h of hazardsOff) track("area_fact_corrected", { fact: h })
    }
    const freezeNowOff =
      climateFields.freeze_risk === false && (savedFreeze !== false || savedClimate !== climateFields.climate)
    applyProfile(result.data)
    setSavedAt(Date.now())
    setTimeout(() => setSavedAt((ts) => (ts && Date.now() - ts >= 2400 ? null : ts)), 2500)
    if (freezeNowOff) await offerWinterizingSweep()
  }


  const toggleOffered = (id: string) =>
    setOffer((o) => {
      if (!o) return o
      const checked = new Set(o.checked)
      if (checked.has(id)) checked.delete(id)
      else checked.add(id)
      return { ...o, checked }
    })

  /** Undo puts back exactly what the turn-off changed. A failed Undo comes back
   *  to the bar with the same Undo and stays until acted on — the snooze
   *  bar's rule (home/tasks/shared.ts): a failure is not furniture to time out. */
  const undoTurnOff = async (turnedOff: TurnOffResult) => {
    const res = await undoTurnOffWinterizing(homeId, turnedOff)
    const n = turnedOff.templateIds.length
    if (res.error) {
      setBar({
        message: `Couldn't turn them back on: ${res.error.message} Tap Undo to try again.`,
        onUndo: () => void undoTurnOff(turnedOff),
        ms: 0,
      })
      return
    }
    setBar({ message: `Turned ${n} winterizing task${n === 1 ? "" : "s"} back on`, ms: 4000 })
  }

  const handleTurnOff = async () => {
    if (!offer || !user) return
    const picked = offer.tasks.filter((t) => offer.checked.has(t.taskTemplateId))
    setOfferBusy(true)
    setOfferError(null)
    const res = await turnOffWinterizingTasks(homeId, user.id, picked)
    setOfferBusy(false)
    if (res.error) {
      // The card stays, with the owner's ticks, so a retry is one tap.
      setOfferError(`Couldn't turn them off: ${res.error.message}`)
      return
    }
    setOffer(null)
    const turnedOff = res.data
    const n = turnedOff.templateIds.length
    setBar({
      message: `Turned off ${n} winterizing task${n === 1 ? "" : "s"}`,
      onUndo: () => void undoTurnOff(turnedOff),
      ms: 7000,
    })
  }

  /** "Keep them" is an answer too: recorded on the home so the offer doesn't
   *  come back on the next visit. If that write fails the card stays and says
   *  so — closing it would promise a silence we couldn't save. */
  const handleKeep = async () => {
    setOfferBusy(true)
    setOfferError(null)
    const res = await markWinterizingOfferAnswered(homeId)
    setOfferBusy(false)
    if (res.error) {
      setOfferError(`Couldn't save your answer: ${res.error.message}`)
      return
    }
    setOffer(null)
  }

  return (
    <SectionCard className="mt-6">
      <CardContent className="p-4 space-y-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <HomeIcon className="size-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Home profile</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            Answers to a few questions about your home — drives what the app suggests and how it's laid out.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2Icon className="size-4 animate-spin" />
            Loading profile…
          </div>
        ) : (
          <>
            {/* Home type */}
            <div className="space-y-1.5">
              <label htmlFor="hp-home-type" className="text-sm font-medium">
                Home type
              </label>
              <Select value={homeType} onValueChange={(v) => setHomeType(v as HomeType)}>
                <SelectTrigger id="hp-home-type" className="w-full sm:w-72">
                  <SelectValue placeholder="Select…" />
                </SelectTrigger>
                <SelectContent>
                  {HOME_TYPES.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Ownership + duration */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="hp-ownership" className="text-sm font-medium">
                  Own or rent
                </label>
                <Select value={ownership} onValueChange={(v) => setOwnership(v as Ownership)}>
                  <SelectTrigger id="hp-ownership" className="w-full">
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                  <SelectContent>
                    {OWNERSHIPS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="hp-duration" className="text-sm font-medium">
                  How long
                </label>
                <Select value={duration} onValueChange={(v) => setDuration(v as OwnershipDuration)}>
                  <SelectTrigger id="hp-duration" className="w-full">
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                  <SelectContent>
                    {DURATIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Zip (D8) — looked up on the device; written only on Save */}
            <div className="space-y-1.5">
              <label htmlFor="hp-zip" className="text-sm font-medium">
                Zip code
              </label>
              <Input
                id="hp-zip"
                inputMode="numeric"
                autoComplete="postal-code"
                maxLength={5}
                value={zip}
                onChange={(e) => changeZip(e.target.value)}
                aria-describedby="hp-zip-note"
                aria-invalid={zipError ? true : undefined}
                className="w-full sm:w-40 tracking-[0.12em]"
              />
              {zipError ? (
                <p id="hp-zip-note" role="alert" className="text-sm text-destructive">{zipError}</p>
              ) : lookup.status === "busy" ? (
                <p id="hp-zip-note" className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2Icon className="size-3.5 animate-spin" /> Looking up {zip}…
                </p>
              ) : lookup.status === "unknown" ? (
                <p id="hp-zip-note" role="alert" className="text-sm font-medium" style={{ color: "var(--hh-clay-ink)" }}>
                  We don’t have {zip}, so it won’t be saved. Your climate below still counts.
                </p>
              ) : lookup.status === "failed" ? (
                <div id="hp-zip-note" role="alert" className="flex flex-wrap items-center gap-x-3 text-sm text-destructive">
                  <span>Couldn’t load area data.</span>
                  <button type="button" onClick={() => void runLookup(zip)} className="min-h-11 font-bold" style={{ color: "var(--hh-teal)" }}>
                    Try again
                  </button>
                </div>
              ) : !zipChanged && savedArea?.county ? (
                <p id="hp-zip-note" className="text-xs text-muted-foreground">{savedArea.county}. It stays in Homehub.</p>
              ) : (
                <p id="hp-zip-note" className="text-xs text-muted-foreground">Only the zip, never your street. It stays in Homehub.</p>
              )}
              {pending && <ZipFacts area={pending} freezeFix={freezeFix} hazardsOff={hazardsOff}
                zipDecides={origin === "zip"}
                onFreeze={() => setFreezeFix((f) => (f === null ? !pending.freezeRisk : null))}
                onHazard={(h) => setHazardsOff((x) => (x.includes(h) ? x.filter((k) => k !== h) : [...x, h]))} />}
            </div>

            {/* Climate — drives winterizing (freeze-prep) suppression during parsing */}
            <div className="space-y-1.5">
              <label htmlFor="hp-climate" className="text-sm font-medium">
                Local climate
              </label>
              <Select value={climate} onValueChange={(v) => { setPickedClimate(v as Climate); setUseZip(false) }}>
                <SelectTrigger id="hp-climate" className="w-full sm:w-72">
                  <SelectValue placeholder="Select…" />
                </SelectTrigger>
                <SelectContent>
                  {CLIMATES.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {origin === "zip" ? (
                <p className="text-xs text-muted-foreground" data-testid="climate-from-zip">
                  From your zip. Pick another if it’s wrong.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  A mild or hot climate skips winterizing tasks in new manuals, and offers to turn off the ones you already have.
                </p>
              )}
              {/* An owner's own answer is never overwritten: the zip's is offered, and kept only on "Use". */}
              {suggestion && (
                <div data-testid="zip-climate-offer" className="mt-2 space-y-2.5 rounded-lg border border-border bg-muted/40 p-3.5">
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      Your zip suggests {climateWords(suggestion.climate, suggestion.freeze_risk)}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      You chose {savedClimate ? climateWords(savedClimate, savedFreeze) : `pipes ${savedFreeze ? "can freeze" : "rarely freeze"}`}. Nothing changes unless you pick.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={() => setUseZip(true)}>
                      Use the zip’s
                    </Button>
                    <Button variant="ghost" onClick={() => setOfferKept(true)}>
                      Keep mine
                    </Button>
                  </div>
                </div>
              )}
              {useZip && pending && (
                <button type="button" onClick={() => setUseZip(false)} className="min-h-11 text-sm font-bold" style={{ color: "var(--hh-teal)" }}>
                  Undo, keep mine
                </button>
              )}
            </div>

            {/* Concerns */}
            <div className="space-y-2">
              <p className="text-sm font-medium">What matters most</p>
              <p className="text-xs text-muted-foreground">Pick any that apply.</p>
              <div className="flex flex-wrap gap-2 pt-1">
                {CONCERNS.map((opt) => {
                  const selected = concerns.includes(opt.value)
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => toggleConcern(opt.value)}
                      aria-pressed={selected}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors inline-flex items-center",
                        "min-h-11 md:pointer-fine:min-h-8",
                        selected
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:border-muted-foreground/50 hover:text-foreground",
                      )}
                    >
                      {opt.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Mode */}
            <div className="space-y-1.5">
              <label htmlFor="hp-mode" className="text-sm font-medium">
                Preferred mode
              </label>
              <Select value={mode} onValueChange={(v) => setMode(v as PreferredMode)}>
                <SelectTrigger id="hp-mode" className="w-full sm:w-72">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MODES.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      <span>
                        <span className="font-medium">{opt.label}</span>
                        <span className="text-muted-foreground"> — {opt.hint}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Affects the Home page default layout (wired in a follow-up release).
              </p>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex items-center gap-3 pt-1">
              <Button onClick={handleSave} disabled={saving || lookup.status === "busy"}>
                {saving ? (
                  <>
                    <Loader2Icon className="size-4 animate-spin mr-2" />
                    Saving…
                  </>
                ) : (
                  "Save"
                )}
              </Button>
              {savedAt && (
                <span className="flex items-center gap-1.5 text-sm text-[var(--hh-success)]">
                  <CheckCircle2Icon className="size-4" />
                  Saved
                </span>
              )}
              {!completedAt && !savedAt && (
                <span className="text-xs text-muted-foreground">
                  Profile hasn't been completed yet.
                </span>
              )}
            </div>

            {/* HH-166: offered after a Mild/Hot save; nothing changes until she confirms. */}
            {offer && (
              <div
                data-testid="winterizing-offer"
                className="space-y-3 rounded-lg border border-border bg-muted/40 p-3.5"
              >
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    You have {offer.tasks.length} winterizing task{offer.tasks.length === 1 ? "" : "s"}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Homes that rarely freeze don't need them. Turn off the ones you don't want; nothing is deleted.
                  </p>
                </div>
                <ul className="space-y-1">
                  {offer.tasks.map((t) => (
                    <li key={t.taskTemplateId}>
                      <label className="flex min-h-11 cursor-pointer items-start gap-2.5 py-1 md:pointer-fine:min-h-8">
                        <input
                          type="checkbox"
                          checked={offer.checked.has(t.taskTemplateId)}
                          onChange={() => toggleOffered(t.taskTemplateId)}
                          disabled={offerBusy}
                          className="mt-0.5 size-4 shrink-0 accent-[var(--hh-teal-fill)]"
                        />
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-foreground">{t.title}</span>
                          <span className="block text-xs text-muted-foreground">
                            {[t.where, t.cadence].filter(Boolean).join(" · ")}
                          </span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
                {offerError && <p className="text-sm text-destructive">{offerError}</p>}
                <div className="flex flex-wrap gap-2">
                  <Button onClick={handleTurnOff} disabled={offerBusy || offer.checked.size === 0}>
                    {offerBusy ? (
                      <>
                        <Loader2Icon className="size-4 animate-spin mr-2" />
                        Turning off…
                      </>
                    ) : (
                      `Turn off ${offer.checked.size}`
                    )}
                  </Button>
                  <Button variant="outline" onClick={handleKeep} disabled={offerBusy}>
                    Keep them
                  </Button>
                </div>
              </div>
            )}
            {!offer && offerError && <p className="text-sm text-destructive">{offerError}</p>}
            {bar && <UndoBar message={bar.message} onUndo={bar.onUndo} ms={bar.ms} onDismiss={dismissBar} />}
          </>
        )}
      </CardContent>
    </SectionCard>
  )
}

/** The zip's facts while a new zip is pending, each with "Not true here" (as the first minute's area step). */
function ZipFacts({ area, freezeFix, hazardsOff, zipDecides, onFreeze, onHazard }: {
  area: ZipArea
  freezeFix: boolean | null
  hazardsOff: AreaHazard[]
  /** The zip's freeze answer will be written (no owner answer, or she took the zip's). */
  zipDecides: boolean
  onFreeze: () => void
  onHazard: (h: AreaHazard) => void
}) {
  const range = coldestNightF(area.hardinessZone)
  const county = area.county ? `${area.county.name}` : null
  const showFreeze = area.freezeRisk !== null
  if (!showFreeze && area.hazards.length === 0) return null
  return (
    <div className="pt-2" data-testid="zip-facts">
      <p className="mb-2 text-xs font-bold uppercase tracking-[0.06em] text-muted-foreground">
        {area.zip}{county ? ` · ${county}` : ""}
      </p>
      <ul className="divide-y divide-[var(--hh-line)] overflow-hidden rounded-xl border bg-[var(--hh-surface)]" style={{ borderColor: "var(--hh-line)" }}>
        {showFreeze && (() => {
          const value = freezeFix ?? area.freezeRisk!
          const changed = freezeFix !== null
          return (
            <FactRow
              title={value ? "Pipes can freeze here" : "Pipes rarely freeze here"}
              detail={changed
                ? zipDecides ? `You changed this. Winterizing ${value ? "stays on" : "is off"}.` : "You changed this."
                : range ? `A typical winter's coldest night is ${range[0]} to ${range[1]}°F.` : "Based on winter lows for your zip."}
              action={changed ? "Undo" : "Not true here"}
              onAction={onFreeze}
            />
          )
        })()}
        {area.hazards.map(({ hazard: h }) => {
          const off = hazardsOff.includes(h)
          return (
            <FactRow key={h}
              title={off ? HAZARD_TITLE[h].replace(" is high", ": not here") : HAZARD_TITLE[h]}
              detail={off ? "You changed this. We won’t suggest tasks for it." : `FEMA risk index for ${county ?? "this county"}.`}
              action={off ? "Undo" : "Not true here"}
              onAction={() => onHazard(h)}
            />
          )
        })}
      </ul>
    </div>
  )
}
