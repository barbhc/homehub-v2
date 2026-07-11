import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useAuth } from "@/modules/auth"
import { createHome } from "../services/homeService"
import { cn } from "@/lib/utils"
import { supabase } from "@/integrations/shim/client"

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

    const { data: existing, error: existingErr } = await supabase
      .from("home_members")
      .select("home_id")
      .eq("user_id", user.id)
      .limit(1)
    if (existingErr) {
      console.debug("[HomeOnboarding] Check existing home_members error:", existingErr.message)
    }
    if (existing?.length) {
      console.debug("[HomeOnboarding] User already has home:", existing[0]?.home_id)
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
          ? "Unable to connect. Check your internet connection and that your Supabase project is active."
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
