import { useEffect, useState } from "react"
import { Loader2Icon, HomeIcon, CheckCircle2Icon } from "lucide-react"
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
  type TopConcernKey,
} from "@/modules/home"

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

const MODES: { value: PreferredMode; label: string; hint: string }[] = [
  { value: "ask_first", label: "Ask-first", hint: "Chat hero on Home" },
  { value: "inventory_first", label: "Inventory-first", hint: "Items & tasks hero on Home" },
  { value: "unset", label: "Balanced (default)", hint: "Show everything" },
]

export function HomeProfileSection({ homeId }: Props) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)

  const [homeType, setHomeType] = useState<HomeType | "">("")
  const [ownership, setOwnership] = useState<Ownership | "">("")
  const [duration, setDuration] = useState<OwnershipDuration | "">("")
  const [concerns, setConcerns] = useState<TopConcernKey[]>([])
  const [mode, setMode] = useState<PreferredMode>("unset")
  const [completedAt, setCompletedAt] = useState<string | null>(null)
  // Tracks the last known updated_at so saves use a CAS guard.
  const [knownUpdatedAt, setKnownUpdatedAt] = useState<string | undefined>(undefined)

  const applyProfile = (p: HomeProfile | null) => {
    setHomeType(p?.home_type ?? "")
    setOwnership(p?.ownership ?? "")
    setDuration(p?.ownership_duration ?? "")
    setConcerns(p?.top_concerns ?? [])
    setMode(p?.preferred_mode ?? "unset")
    setCompletedAt(p?.completed_at ?? null)
    setKnownUpdatedAt(p?.updated_at ?? undefined)
  }

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
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

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    const result = await upsertHomeProfile(
      homeId,
      {
        home_type: homeType || null,
        ownership: ownership || null,
        ownership_duration: duration || null,
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
    applyProfile(result.data)
    setSavedAt(Date.now())
    setTimeout(() => setSavedAt((ts) => (ts && Date.now() - ts >= 2400 ? null : ts)), 2500)
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
          </>
        )}
      </CardContent>
    </SectionCard>
  )
}
