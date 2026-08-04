import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "./index.css"
import App from "./App.tsx"
import { markNativePlatform } from "@/lib/native"
import { markBoot } from "@/lib/bootTiming"

// Stays synchronous: stamps data-native/data-platform on <html> so CSS can apply
// the status-bar inset before anything paints.
markBoot("js")
markNativePlatform()

markBoot("react")
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
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
  if (!dsn) return
  void import("@sentry/react").then((Sentry) => {
    Sentry.init({
      dsn,
      environment: import.meta.env.MODE,
      integrations: [Sentry.browserTracingIntegration()],
      tracesSampleRate: 0.2,
      enabled: import.meta.env.PROD,
    })
  })
}

if (typeof requestIdleCallback === "function") requestIdleCallback(() => bootTelemetry(), { timeout: 3000 })
else setTimeout(bootTelemetry, 0)
