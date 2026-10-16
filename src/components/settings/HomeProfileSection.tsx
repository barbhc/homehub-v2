import { useCallback, useEffect, useState } from "react"
import { Loader2Icon, HomeIcon, CheckCircle2Icon } from "lucide-react"
import { useDepsChanged } from "@/hooks/useDepsChanged"
import { SectionCard } from "@/components/layout"
import { CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
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
  type TopConcernKey,
} from "@/modules/home"
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

/** Climate → whether pipes can freeze here. Drives winterizing suppression. */
function freezeRiskFor(climate: Climate | ""): boolean | null {
  if (!climate) return null
  return climate === "mild" || climate === "hot" ? false : true
}

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
  const [climate, setClimate] = useState<Climate | "">("")
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
  /** "Keep them" holds for the rest of the visit — a later Save doesn't re-ask. */
  const [offerDeclined, setOfferDeclined] = useState(false)

  const applyProfile = (p: HomeProfile | null) => {
    setHomeType(p?.home_type ?? "")
    setOwnership(p?.ownership ?? "")
    setDuration(p?.ownership_duration ?? "")
    setClimate(p?.climate ?? "")
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
    setOfferDeclined(false)
  }
  useEffect(() => {
    let cancelled = false
    getHomeProfile(homeId).then((result) => {
      if (cancelled) return
      if (result.error) setError(result.error.message)
      else applyProfile(result.data)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [homeId])

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
    setSaving(true)
    setError(null)
    setOffer(null)
    setOfferError(null)
    const wantClimate = climate || null
    const wantFreezeRisk = freezeRiskFor(climate)
    const result = await upsertHomeProfile(
      homeId,
      {
        home_type: homeType || null,
        ownership: ownership || null,
        ownership_duration: duration || null,
        climate: wantClimate,
        freeze_risk: wantFreezeRisk,
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
    if (result.data.climate !== wantClimate || result.data.freeze_risk !== wantFreezeRisk) {
      setError("Your climate didn't save. Try again.")
      return
    }
    applyProfile(result.data)
    setSavedAt(Date.now())
    setTimeout(() => setSavedAt((ts) => (ts && Date.now() - ts >= 2400 ? null : ts)), 2500)
    if (wantFreezeRisk === false && !offerDeclined) await offerWinterizingSweep()
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

  const handleKeep = () => {
    setOffer(null)
    setOfferError(null)
    setOfferDeclined(true)
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

            {/* Climate — drives winterizing (freeze-prep) suppression during parsing */}
            <div className="space-y-1.5">
              <label htmlFor="hp-climate" className="text-sm font-medium">
                Local climate
              </label>
              <Select value={climate} onValueChange={(v) => setClimate(v as Climate)}>
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
              <p className="text-xs text-muted-foreground">
                A mild climate skips winterizing tasks in new manuals, and offers to turn off the ones you already have.
              </p>
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
                        "min-h-11 md:min-h-8",
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
              <Button onClick={handleSave} disabled={saving}>
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
                <span className="flex items-center gap-1.5 text-sm text-emerald-700">
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
                      <label className="flex min-h-11 cursor-pointer items-start gap-2.5 py-1 md:min-h-8">
                        <input
                          type="checkbox"
                          checked={offer.checked.has(t.taskTemplateId)}
                          onChange={() => toggleOffered(t.taskTemplateId)}
                          disabled={offerBusy}
                          className="mt-0.5 size-4 shrink-0 accent-primary"
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
