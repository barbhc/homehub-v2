import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useAuth } from "@/modules/auth"
import { createHome, getPrimaryHome } from "../services/homeService"
import { getGateStatus, redeemInviteCode } from "../services/growthGate"
import { upsertHomeProfile, type Climate } from "../services/homeProfileService"
import { lookupZipArea, toHomeArea, type ZipLookup } from "../services/zipAreaService"
import { track } from "@/lib/analytics"
import { cn } from "@/lib/utils"
import { OnboardingSteps, OptionRow } from "./onboardingParts"
import { CLIMATE_OPTIONS, freezeRiskFor } from "./onboardingOptions"

/** D1a: the home is named for her; she renames it from the switcher. */
export const FIRST_HOME_NAME = "My home"

type HomeOnboardingProps = {
  /** Called when the user has a home. Carries the home id when this component
   *  knows it (just created / already existed) so the provider can wait for
   *  THAT home to appear rather than re-discovering an empty list. */
  onComplete: (homeId?: string) => void
  className?: string
}

/**
 * Step 1 of the first minute (D8, design/first-minute-onboarding.md): a zip,
 * or Skip. The home is created here either way.
 *
 * Only the zip is asked — never a street address, never device location
 * (must-be-true 1) — and it is looked up in a table on the device (2).
 */
export function HomeOnboarding({ onComplete, className }: HomeOnboardingProps) {
  const { user } = useAuth()
  const [zip, setZip] = useState("")
  const [lookup, setLookup] = useState<ZipLookup | null>(null)
  const [climate, setClimate] = useState<Climate | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tableFailed, setTableFailed] = useState(false)
  const [loading, setLoading] = useState(false)
  // The invite gate. `needsCode` stays false until we have actually READ the
  // flag, so the code field never flashes in front of a user who does not need
  // one — the gate is off by default and looks it.
  const [needsCode, setNeedsCode] = useState(false)
  const [code, setCode] = useState("")
  // A home created on an earlier try whose zip write then failed: Try again
  // writes the zip to THAT home, never a second one.
  const [createdId, setCreatedId] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    let live = true
    void getGateStatus(user.id).then((s) => {
      if (live) setNeedsCode(s.gateOn && !s.admitted)
    })
    return () => {
      live = false
    }
  }, [user])

  const unknown = lookup?.kind === "unknown"

  /** The home, created once — or the one this account already has. */
  async function ensureHome(): Promise<{ homeId: string; existed: boolean } | null> {
    if (!user) return null
    if (createdId) return { homeId: createdId, existed: false }
    // "Do I already have a home?" — same membership lookup the home gate uses
    // (collectionGroup(members).where uid == me, via homeService).
    const existing = await getPrimaryHome()
    if (existing.error) {
      // HARD STOP: if the membership lookup failed we cannot know whether a home
      // already exists — creating one anyway is how duplicate homes get minted.
      console.error("[HomeOnboarding] membership pre-check failed:", existing.error.message)
      setError("We couldn't check your account just now. Please try again in a moment — don't create a new home.")
      return null
    }
    if (existing.data) return { homeId: existing.data.home_id, existed: true }

    // Redeem BEFORE creating, because the rules will refuse the create without
    // an admission and the resulting error is a bare permission-denied with
    // nothing in it a user could act on.
    if (needsCode) {
      try {
        await redeemInviteCode(code)
        setNeedsCode(false)
      } catch (err) {
        setError(err instanceof Error ? err.message : "That invite code isn't valid.")
        return null
      }
    }

    const result = await createHome({ name: FIRST_HOME_NAME, userId: user.id })
    if (result.error || !result.data) {
      const msg = result.error?.message ?? "Couldn't create your home."
      setError(msg === "Failed to fetch" ? "Unable to connect. Check your internet connection and try again." : msg)
      return null
    }
    // True-creation branch only — the already-has-home path must not fire the funnel event.
    track("home_created", { home_id: result.data.homeId })
    setCreatedId(result.data.homeId)
    return { homeId: result.data.homeId, existed: false }
  }

  async function finish(save: (homeId: string) => Promise<string | null>) {
    if (loading) return
    setError(null)
    setLoading(true)
    const home = await ensureHome()
    if (!home) {
      setLoading(false)
      return
    }
    // A home this account already had keeps its own answers: nothing is written over them.
    if (!home.existed) {
      const failed = await save(home.homeId)
      if (failed) {
        setError(failed)
        setLoading(false)
        return
      }
    }
    setLoading(false)
    onComplete(home.homeId)
  }

  async function handleContinue(e: React.FormEvent) {
    e.preventDefault()
    if (unknown) {
      if (!climate) return
      track("onboarding_zip_entered", { known: false })
      await finish(async (homeId) => {
        const r = await upsertHomeProfile(homeId, { climate, freeze_risk: freezeRiskFor(climate), climate_source: "owner" })
        return r.error ? "Couldn't save your climate. Check your connection and try again." : null
      })
      return
    }
    let found: ZipLookup
    try {
      found = await lookupZipArea(zip)
      setTableFailed(false)
    } catch (err) {
      console.warn("[HomeOnboarding] the zip table did not load:", err instanceof Error ? err.message : err)
      setTableFailed(true)
      return
    }
    setLookup(found)
    if (found.kind === "invalid") {
      setError("Enter the five digits of your zip code.")
      return
    }
    if (found.kind === "unknown") return // the climate choices take over
    const a = found.area
    track("onboarding_zip_entered", { known: true })
    await finish(async (homeId) => {
      const r = await upsertHomeProfile(homeId, {
        zip: a.zip,
        climate: a.climate,
        freeze_risk: a.freezeRisk,
        climate_source: "zip",
        area: toHomeArea(a),
      })
      return r.error ? "Couldn't save your zip. Check your connection and try again." : null
    })
  }

  const skip = () => void finish(async () => null)

  return (
    <div className={cn("w-full max-w-md mx-auto", className)}>
      <OnboardingSteps step={1} />
      <h1 className="text-[1.75rem] leading-[2.125rem] font-display font-bold tracking-[-0.01em] mb-2">Where&apos;s home?</h1>
      <p className="text-muted-foreground mb-6">A house in Minneapolis needs different care than one in Miami. Your zip tells Homehub your winters, your storm season and what homes near you usually need.</p>
      <form onSubmit={handleContinue} className="space-y-5">
        <div>
          <label className="text-sm font-medium block mb-1.5" htmlFor="onboarding-zip">
            Zip code
          </label>
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
            <p id="onboarding-zip-note" className="mt-1.5 text-sm text-muted-foreground">
              Just the zip. Never your street.
            </p>
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

        {needsCode && (
          <div>
            <label className="text-sm font-medium block mb-1.5" htmlFor="invite-code">
              Invite code
            </label>
            <Input
              id="invite-code"
              placeholder="8 letters and numbers"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              required
            />
            <p className="text-xs text-muted-foreground mt-1.5">
              Homehub is in a small early round. Whoever invited you has your code.
            </p>
          </div>
        )}

        {tableFailed && (
          <div role="alert" className="rounded-xl border px-4 py-3 text-sm" style={{ borderColor: "var(--hh-line)", background: "var(--hh-surface)" }}>
            Couldn&apos;t load area data. Try again, or skip for now.
          </div>
        )}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

        <Button type="submit" className="w-full h-12 text-base" disabled={loading || (unknown ? !climate : zip.length !== 5)}>
          {loading ? "Setting up…" : tableFailed ? "Try again" : "Continue"}
        </Button>
        <button type="button" onClick={skip} disabled={loading}
          className="block w-full min-h-11 text-center text-[0.9375rem] font-medium text-muted-foreground">
          Skip for now
        </button>
      </form>
    </div>
  )
}
