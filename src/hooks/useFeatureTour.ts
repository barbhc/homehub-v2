import { useCallback, useEffect, useRef } from "react"
import { driver, type DriveStep } from "driver.js"
import "driver.js/dist/driver.css"
import "@/styles/tour.css"
import { useAuth } from "@/modules/auth"
import { getPreference, setPreference, PREF_TOUR_COMPLETED } from "@/lib/userPreferences"
import { tourSteps } from "@/lib/tourSteps"

/**
 * Mobile bottom nav means `side: "bottom"` popovers would land off-screen.
 * Rewrite all nav-anchored steps to float ABOVE the target on mobile so they
 * don't cover the icon they're pointing to.
 */
function adaptStepsForViewport(steps: DriveStep[]): DriveStep[] {
  const isMobile = typeof window !== "undefined"
    && window.matchMedia("(max-width: 767px)").matches
  if (!isMobile) return steps
  return steps.map((s) => ({
    ...s,
    popover: s.popover ? { ...s.popover, side: "top", align: "center" } : s.popover,
  }))
}

export function useFeatureTour() {
  const { user } = useAuth()
  const driverRef = useRef<ReturnType<typeof driver> | null>(null)
  const checkedRef = useRef(false)

  useEffect(() => {
    if (!user?.id || checkedRef.current) return
    checkedRef.current = true

    const startTour = () => {
      const timer = setTimeout(() => {
        const d = driver({
          showProgress: true,
          animate: true,
          allowClose: true,
          overlayColor: "rgba(0, 0, 0, 0.55)",
          stagePadding: 6,
          stageRadius: 10,
          popoverClass: "homehub-tour-popover",
          nextBtnText: "Next",
          prevBtnText: "Back",
          doneBtnText: "Get Started",
          steps: adaptStepsForViewport(tourSteps),
          onDestroyStarted: () => {
            d.destroy()
            if (user?.id) {
              setPreference(user.id, PREF_TOUR_COMPLETED, true).catch(() => {})
            }
          },
        })
        driverRef.current = d
        d.drive()
      }, 600)
      return () => clearTimeout(timer)
    }

    getPreference<boolean>(user.id, PREF_TOUR_COMPLETED)
      .then((completed) => {
        if (!completed) startTour()
      })
      .catch(() => {
        // Table may not exist yet — treat as "not completed"
        startTour()
      })
  }, [user?.id])

  const restartTour = useCallback(() => {
    if (!user?.id) return

    // Clear the preference so it can trigger again, then start
    setPreference(user.id, PREF_TOUR_COMPLETED, false)
      .then(() => {
        checkedRef.current = false
        const d = driver({
          showProgress: true,
          animate: true,
          allowClose: true,
          overlayColor: "rgba(0, 0, 0, 0.55)",
          stagePadding: 6,
          stageRadius: 10,
          popoverClass: "homehub-tour-popover",
          nextBtnText: "Next",
          prevBtnText: "Back",
          doneBtnText: "Get Started",
          steps: adaptStepsForViewport(tourSteps),
          onDestroyStarted: () => {
            d.destroy()
            if (user?.id) {
              setPreference(user.id, PREF_TOUR_COMPLETED, true).catch(() => {})
            }
          },
        })
        driverRef.current = d
        d.drive()
      })
      .catch(() => {})
  }, [user?.id])

  return { restartTour }
}
