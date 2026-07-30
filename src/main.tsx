import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import * as Sentry from "@sentry/react"
import "./index.css"
import App from "./App.tsx"
import { initAnalytics } from "@/lib/analytics"
import { markNativePlatform } from "@/lib/native"

initAnalytics()
// Stamps data-native/data-platform on <html> so CSS can apply the status-bar
// inset inside the Capacitor shell (which is not display-mode: standalone).
markNativePlatform()

const dsn = import.meta.env.VITE_SENTRY_DSN
if (dsn) {
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    integrations: [
      Sentry.browserTracingIntegration(),
    ],
    tracesSampleRate: 0.2,
    // Only send errors from production
    enabled: import.meta.env.PROD,
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
