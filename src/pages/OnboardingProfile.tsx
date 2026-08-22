import { useEffect, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { PlusIcon, HomeIcon } from "lucide-react"
import { HomeProfileOnboarding, useCurrentHome } from "@/modules/home"

/**
 * Step 2 of first-run onboarding: 4-question home profile Q&A that drives
 * downstream task selection, dashboard layout, and ask-mode defaults.
 * Skippable — partial answers are saved but completed_at stays null.
 */
export default function OnboardingProfile() {
  const navigate = useNavigate()
  const { home, loading } = useCurrentHome()
  const [finished, setFinished] = useState(false)

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

  return (
    <div /* pt-safe-top: rendered OUTSIDE AppLayout, where the inset normally
       comes from — on an iPhone 17 the heading landed under the Dynamic Island */
    className="min-h-screen pt-safe-top flex flex-col items-center justify-center bg-background p-6">
      {finished ? (
        <ProfileDone />
      ) : (
        <HomeProfileOnboarding
          homeId={home.home_id}
          onComplete={() => setFinished(true)}
          onSkip={() => setFinished(true)}
        />
      )}
    </div>
  )
}

/**
 * HH-93: where finishing the profile lands you — asked, not assumed.
 *
 * "Finish" used to drop the user straight into the add-item form with no way
 * out but the tab bar. The profile questions and adding an item are separate
 * jobs (the owner's words), so the hand-off between them is a choice: add the
 * first item now, or go look at the home the answers just shaped. The owner
 * explicitly picked "go to the home page" over a sample-home tour as the
 * second option.
 *
 * Also serves the ProfileCompletionBanner path — someone with items finishing
 * a skipped profile — for whom the home-page option is the natural exit.
 */
function ProfileDone() {
  return (
    <div className="w-full max-w-md text-center">
      <div className="flex justify-center mb-4">
        <span className="inline-flex items-center justify-center size-14 rounded-2xl bg-primary/10 text-primary">
          <HomeIcon className="size-7" />
        </span>
      </div>
      <h1 className="font-display text-2xl font-bold text-foreground mb-2 leading-tight">
        Your home profile is set
      </h1>
      <p className="text-[15px] text-muted-foreground mb-8 leading-relaxed">
        Your answers shape which tasks show up, and when. Where to next?
      </p>
      <div className="flex flex-col items-center gap-3">
        <Link
          to="/inventory/add"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-primary text-primary-foreground font-semibold text-base hover:bg-primary/90 transition-colors shadow-sm"
        >
          <PlusIcon className="size-5" />
          Add your first item
        </Link>
        <Link to="/home" className="px-4 py-2 text-[14.5px] font-semibold text-primary">
          Take me to my home page
        </Link>
      </div>
    </div>
  )
}
