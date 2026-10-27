import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { MotionConfig } from "motion/react"
// Fonts are self-hosted and bundled (latin subset, woff2, font-display: swap)
// rather than fetched from Google Fonts: no third-party request on launch, and
// the iOS shell renders the same glyphs offline. ONLY the weights the app
// uses — `font-synthesis: none` (index.css) means a missing weight is never
// faked, it silently renders the nearest one, so add the file here before
// using a new weight.
//   Inter (--font-sans, everything): 400 normal · 500 medium · 600 semibold ·
//     700 bold · 800 extrabold. 800 also serves `<strong>` inside bold text
//     (`bolder` → 900, nearest loaded is 800 — the same as before).
//   Plus Jakarta Sans (--font-display, page titles + the tour title):
//     400 normal · 600 semibold · 700 bold · 800 extrabold.
// Dropped: 300 (no font-light anywhere), Jakarta 500, and Jakarta 400 italic
// (no italic display text). Inter italic was never loaded from Google either,
// so `italic` text is unchanged.
import "@fontsource/inter/latin-400.css"
import "@fontsource/inter/latin-500.css"
import "@fontsource/inter/latin-600.css"
import "@fontsource/inter/latin-700.css"
import "@fontsource/inter/latin-800.css"
import "@fontsource/plus-jakarta-sans/latin-400.css"
import "@fontsource/plus-jakarta-sans/latin-600.css"
import "@fontsource/plus-jakarta-sans/latin-700.css"
import "@fontsource/plus-jakarta-sans/latin-800.css"
import "./index.css"
import App from "./App.tsx"
import { markNativePlatform } from "@/lib/native"
import { syncStatusBarToDocument } from "@/lib/statusBar"
import { startBackGestureGuard } from "@/lib/backGesture"
import { markBoot } from "@/lib/bootTiming"
import { registerDeepLinkListener } from "@/lib/nativePush"

// Stays synchronous: stamps data-native/data-platform on <html> so CSS can apply
// the status-bar inset before anything paints.
markBoot("js")
markNativePlatform()
// The pre-paint snippet in index.html already chose light or dark (including
// the in-app Appearance override); the iOS status bar follows that choice, not
// the phone's. Both calls are no-ops in a browser and on an older shell.
syncStatusBarToDocument()
startBackGestureGuard()

// Before React, before auth: iOS hands a notification tap to the plugin at
// launch, and an unregistered listener means the deep link is dropped and the
// app opens on Home instead of the task.
void registerDeepLinkListener()

markBoot("react")
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* reducedMotion="user": under iOS Reduce Motion, Motion skips transform
        animations (slides land at once) and keeps opacity fades — Apple's own
        substitution. See src/lib/motion.ts. */}
    <MotionConfig reducedMotion="user">
      <App />
    </MotionConfig>
  </StrictMode>,
)

/**
 * Telemetry boots AFTER first paint, and both libraries are dynamically imported
 * so they leave the entry chunk entirely.
 *
 * Sentry and PostHog were initialised at module scope, so ~300KB of analytics
 * had to download, parse and run before React could mount — on the critical path
 * of an iOS WebView cold start, which is the slowest boot this app has. Neither
 * renders anything.
 *
 * Trade-off, stated plainly: an error thrown in the first few hundred
 * milliseconds now goes unreported. Worth it — that window is dominated by React
 * mounting, and a crash there is reproducible locally anyway.
 */
function bootTelemetry(): void {
  void import("@/lib/analytics").then((m) => m.initAnalytics())

  const dsn = import.meta.env.VITE_SENTRY_DSN
  if (!dsn) {
    // Silence here is indistinguishable from "Sentry is fine": the SDK is
    // imported, the code reads as wired, and nothing ever reports. A build
    // shipped to production with no DSN has NO error reporting at all, so say
    // so once, loudly enough to find in a console session.
    if (import.meta.env.PROD) {
      console.warn(
        "[telemetry] VITE_SENTRY_DSN is not set — this production build reports NO errors to Sentry.",
      )
    }
    return
  }
  void import("@sentry/react").then((Sentry) => {
    Sentry.init({
      dsn,
      environment: import.meta.env.MODE,
      // Must equal the release the source maps were uploaded under (set in
      // vite.config.ts from the git SHA). If these drift, the maps are in
      // Sentry but never applied: traces stay minified and nothing reports an
      // error, because as far as Sentry is concerned no maps exist for THIS
      // release. Empty string means an untagged build — send undefined rather
      // than "", which would be a release literally named empty.
      release: import.meta.env.VITE_SENTRY_RELEASE || undefined,
      integrations: [Sentry.browserTracingIntegration()],
      tracesSampleRate: 0.2,
      enabled: import.meta.env.PROD,
    })
  })
}

if (typeof requestIdleCallback === "function") requestIdleCallback(() => bootTelemetry(), { timeout: 3000 })
else setTimeout(bootTelemetry, 0)
