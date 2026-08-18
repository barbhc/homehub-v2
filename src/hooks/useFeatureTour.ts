import { useCallback, useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { driver, type DriveStep } from "driver.js"
import "driver.js/dist/driver.css"
import "@/styles/tour.css"
import { useAuth } from "@/modules/auth"
import { getPreference, setPreference, PREF_TOUR_COMPLETED } from "@/lib/userPreferences"
import { tourSteps, type TourStep } from "@/lib/tourSteps"

/**
 * Mobile bottom nav means `side: "bottom"` popovers would land off-screen.
 * Rewrite all nav-anchored steps to float ABOVE the target on mobile so they
 * don't cover the icon they're pointing to.
 */
function adaptStepsForViewport(steps: TourStep[]): TourStep[] {
  const isMobile = typeof window !== "undefined"
    && window.matchMedia("(max-width: 767px)").matches
  if (!isMobile) return steps
  return steps.map((s) => ({
    ...s,
    popover: s.popover ? { ...s.popover, side: "top", align: "center" } : s.popover,
  }))
}

/**
 * Resolve each selector to the VISIBLE match at drive time.
 *
 * The nav is rendered twice — a desktop header and a mobile bottom bar — and
 * both carry the same `data-tour` attribute. driver.js calls
 * `document.querySelector`, which returns the FIRST match: on a phone that is
 * the desktop header, collapsed to zero height at the very top of the page. So
 * the popover anchored to an invisible 0×0 box at y=0 and landed under the
 * status bar, which is what a tester photographed: "the calendar and the other
 * upper toolbar icons are covering it."
 *
 * A function element is evaluated per step, so this also survives a viewport
 * change mid-tour.
 */
function visibleTarget(selector: string): () => Element {
  return () => {
    const all = [...document.querySelectorAll(selector)]
    const visible = all.find((el) => {
      const r = el.getBoundingClientRect()
      return r.width > 0 && r.height > 0
    })
    // Fall back to the first match rather than throwing: a missing target
    // degrades to driver.js's centred modal, which is survivable. A crash
    // mid-onboarding is not.
    return visible ?? all[0]
  }
}

/** `route` is ours, not driver.js's — strip it before handing steps over. */
function toDriveSteps(steps: TourStep[]): DriveStep[] {
  return steps.map(({ route: _route, element, ...step }) => ({
    ...step,
    element: typeof element === "string" ? visibleTarget(element) : element,
  }))
}

export function useFeatureTour() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const driverRef = useRef<ReturnType<typeof driver> | null>(null)
  const checkedRef = useRef(false)

  // One config, built once — it was duplicated between the auto-start and
  // restart paths, so any fix had to be made twice or silently applied to only
  // one of them.
  const buildDriver = useCallback(
    (uid: string) => {
      const steps = adaptStepsForViewport(tourSteps)
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
        steps: toDriveSteps(steps),
        // Show the screen being described. The nav buttons live in AppLayout and
        // stay mounted across routes, so the highlighted element survives the
        // navigation and the stage simply re-measures.
        // Match by INDEX: `element` is a resolver function by this point, so
        // comparing it against the source step's selector would never hit.
        onHighlightStarted: (_el, _step, opts) => {
          const idx = opts?.state?.activeIndex ?? -1
          const route = idx >= 0 ? steps[idx]?.route : undefined
          if (route) navigate(route)
        },
        onDestroyStarted: () => {
          d.destroy()
          setPreference(uid, PREF_TOUR_COMPLETED, true).catch(() => {})
        },
      })
      return d
    },
    [navigate],
  )

  useEffect(() => {
    if (!user?.id || checkedRef.current) return
    checkedRef.current = true
    const uid = user.id

    let timer: number | undefined
    const startTour = () => {
      timer = window.setTimeout(() => {
        const d = buildDriver(uid)
        driverRef.current = d
        d.drive()
      }, 600)
    }

    getPreference<boolean>(uid, PREF_TOUR_COMPLETED)
      .then((completed) => {
        if (!completed) startTour()
      })
      .catch(() => {
        // Preference unreadable — treat as "not completed".
        startTour()
      })

    return () => {
      if (timer) window.clearTimeout(timer)
    }
  }, [user?.id, buildDriver])

  const restartTour = useCallback(() => {
    if (!user?.id) return
    const uid = user.id
    setPreference(uid, PREF_TOUR_COMPLETED, false)
      .then(() => {
        checkedRef.current = false
        const d = buildDriver(uid)
        driverRef.current = d
        d.drive()
      })
      .catch(() => {})
  }, [user?.id, buildDriver])

  return { restartTour }
}
