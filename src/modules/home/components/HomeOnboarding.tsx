import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useAuth } from "@/modules/auth"
import { createHome, getPrimaryHome } from "../services/homeService"
import { getGateStatus, redeemInviteCode } from "../services/growthGate"
import { track } from "@/lib/analytics"
import { cn } from "@/lib/utils"

type HomeOnboardingProps = {
  /** Called when the user has a home. Carries the home id when this component
   *  knows it (just created / already existed) so the provider can wait for
   *  THAT home to appear rather than re-discovering an empty list. */
  onComplete: (homeId?: string) => void
  className?: string
}

export function HomeOnboarding({ onComplete, className }: HomeOnboardingProps) {
  const { user } = useAuth()
  const [name, setName] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  // The invite gate. `needsCode` stays false until we have actually READ the
  // flag, so the code field never flashes in front of a user who does not need
  // one — the gate is off by default and looks it.
  const [needsCode, setNeedsCode] = useState(false)
  const [code, setCode] = useState("")

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || loading) return
    setError(null)
    setLoading(true)

    // "Do I already have a home?" — same membership lookup the home gate uses
    // (collectionGroup(members).where uid == me, via homeService).
    const existing = await getPrimaryHome()
    if (existing.error) {
      // HARD STOP: if the membership lookup failed we cannot know whether a home
      // already exists — creating one anyway is how duplicate homes get minted.
      console.error("[HomeOnboarding] membership pre-check failed:", existing.error.message)
      setError("We couldn't check your account just now. Please try again in a moment — don't create a new home.")
      setLoading(false)
      return
    }
    if (existing.data) {
      console.debug("[HomeOnboarding] User already has home:", existing.data.home_id)
      setLoading(false)
      onComplete(existing.data.home_id)
      return
    }

    // Redeem BEFORE creating, because the rules will refuse the create without
    // an admission and the resulting error is a bare permission-denied with
    // nothing in it a user could act on.
    if (needsCode) {
      try {
        await redeemInviteCode(code)
        setNeedsCode(false)
      } catch (err) {
        setError(err instanceof Error ? err.message : "That invite code isn't valid.")
        setLoading(false)
        return
      }
    }

    const result = await createHome({ name: name.trim(), userId: user.id })
    if (result.data) {
      console.debug("[HomeOnboarding] Created home:", result.data.homeId)
      // True-creation branch only — the already-has-home early return above must
      // not fire the funnel event.
      track("home_created", { home_id: result.data.homeId })
    }
    if (result.error) {
      const msg = result.error.message
      if (msg.includes("duplicate") || msg.includes("23505")) {
        onComplete()
        setLoading(false)
        return
      }
      setError(
        msg === "Failed to fetch"
          ? "Unable to connect. Check your internet connection and try again."
          : msg
      )
      setLoading(false)
      return
    }
    onComplete(result.data?.homeId)
  }

  return (
    <div className={cn("w-full max-w-md mx-auto", className)}>
      <h1 className="text-2xl font-display font-normal mb-2">Set up your home</h1>
      <p className="text-muted-foreground mb-6">
        {/* HH-79: the old line ended "there is no long setup", which names the
            fear instead of the payoff. Owner picked this wording. */}
        Give it a name. You can add appliances one at a time — start with one.
      </p>
      {/* THE ESCAPE HATCH IS GONE, and it is worth saying why rather than
          leaving a silent gap.

          It read "Not sure yet? Look around a sample home first" and linked to
          /sample. It existed for a real reason: this screen asks for a
          commitment before the person has seen anything the product does, and
          the sample was the "find out first" half.

          Removed at the owner's request (round 18) because /sample still renders
          the pre-round-18 layout, and the fix for showing someone a stale
          product is not to show it to the people who have seen nothing else.
          BACKLOG §4b parks the redesign until the add-item flow and the item
          page are final; both doors reopen when it lands.

          The route still exists and still works by direct link — this closed the
          doors, it did not retire the page. Restoring this one is a three-line
          change, and the argument it was built on has not stopped being true. */}
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="text-sm font-medium block mb-1.5">Home name</label>
          <Input
            placeholder="e.g., My House, Downtown Apartment"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
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
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Creating..." : "Continue"}
        </Button>
      </form>
    </div>
  )
}
