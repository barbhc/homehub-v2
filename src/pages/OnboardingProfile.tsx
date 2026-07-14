import { useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { HomeProfileOnboarding, useCurrentHome } from "@/modules/home"

/**
 * Step 2 of first-run onboarding: 4-question home profile Q&A that drives
 * downstream task selection, dashboard layout, and ask-mode defaults.
 * Skippable — partial answers are saved but completed_at stays null.
 */
export default function OnboardingProfile() {
  const navigate = useNavigate()
  const { home, loading } = useCurrentHome()

  // Redirect lives in an effect — navigate() during render is a react-router
  // error, and the `return null` it paired with was the launch-day blank page.
  useEffect(() => {
    if (!loading && !home) navigate("/", { replace: true })
  }, [loading, home, navigate])

  if (loading || !home) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background" aria-busy="true">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    )
  }

  const goNext = () => navigate("/onboarding/inventory", { replace: true })

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6">
      <HomeProfileOnboarding
        homeId={home.home_id}
        onComplete={goNext}
        onSkip={goNext}
      />
    </div>
  )
}
