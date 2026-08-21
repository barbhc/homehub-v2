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
  //
  // The redirect must NOT fire on the first render after "Continue": Index
  // awaits refresh() and navigates here, but the router commit lands before
  // the provider's setHome — so this page always mounted with a stale
  // home=null and bounced every new user straight past the profile questions
  // (and the first-item funnel behind them). A short grace lets the pending
  // context commit arrive; a user with truly no home still gets redirected,
  // just a beat later.
  useEffect(() => {
    if (loading || home) return
    const t = window.setTimeout(() => navigate("/", { replace: true }), 1500)
    return () => window.clearTimeout(t)
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
    <div /* pt-safe-top: rendered OUTSIDE AppLayout, where the inset normally
       comes from — on an iPhone 17 the heading landed under the Dynamic Island */
    className="min-h-screen pt-safe-top flex flex-col items-center justify-center bg-background p-6">
      <HomeProfileOnboarding
        homeId={home.home_id}
        onComplete={goNext}
        onSkip={goNext}
      />
    </div>
  )
}
