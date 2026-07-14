import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useAuth } from "@/modules/auth"
import { createHome, getPrimaryHome } from "../services/homeService"
import { cn } from "@/lib/utils"

type HomeOnboardingProps = {
  onComplete: () => void
  className?: string
}

export function HomeOnboarding({ onComplete, className }: HomeOnboardingProps) {
  const { user } = useAuth()
  const [name, setName] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

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
      onComplete()
      return
    }

    const result = await createHome({ name: name.trim(), userId: user.id })
    if (result.data) {
      console.debug("[HomeOnboarding] Created home:", result.data.homeId)
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
    onComplete()
  }

  return (
    <div className={cn("w-full max-w-md mx-auto", className)}>
      <h1 className="text-2xl font-display font-normal mb-2">Set up your home</h1>
      <p className="text-muted-foreground mb-6">Name your home to get started.</p>
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
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Creating..." : "Continue"}
        </Button>
      </form>
    </div>
  )
}
