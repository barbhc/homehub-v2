/**
 * Product analytics (PostHog) — launch-readiness P0. Funnel:
 *   sign_up → home_created → first_item_added → item_content_viewed → task_checked
 * plus item_added (engagement) and manual $pageview on route change (SPA).
 * Timestamps ride on every event, so funnel step deltas (time-to-first-item,
 * time-to-AHA) come free in PostHog.
 *
 * No-key builds (emulator dev, e2e, native shell without config) no-op every
 * call — same guard pattern as Sentry in main.tsx. Session recording stays off
 * for the friends round (events only; also WKWebView-safe).
 */
import type posthogT from "posthog-js"
import { getNativePlatform } from "@/lib/native"

// posthog-js is dynamically imported so it does not sit in the entry chunk and
// does not parse before first paint. Cold start in the iOS WebView is the whole
// reason — nothing here renders anything, so none of it belongs on the critical
// path. Every export below no-ops until the module has landed, exactly as they
// already no-opped without a key.
let posthog: typeof posthogT | null = null
let initialized = false

export async function initAnalytics(): Promise<void> {
  const key = import.meta.env.VITE_POSTHOG_KEY as string | undefined
  if (!key || initialized) return
  posthog = (await import("posthog-js")).default
  posthog.init(key, {
    api_host: (import.meta.env.VITE_POSTHOG_HOST as string | undefined) || "https://us.i.posthog.com",
    capture_pageview: false, // SPA — captured manually on route change (trackPageview)
    capture_pageleave: true,
    autocapture: true,
    disable_session_recording: true,
  })
  // Segment web vs the Capacitor iOS shell in every funnel.
  posthog.register({ platform: getNativePlatform() })
  initialized = true
}

export function track(event: string, properties?: Record<string, unknown>): void {
  if (!initialized || !posthog) return
  posthog.capture(event, properties)
}

export function trackPageview(path: string): void {
  if (!initialized || !posthog) return
  posthog.capture("$pageview", { path })
}

/** Tie events to the Firebase uid (merges the pre-signup anonymous session). */
export function identifyUser(uid: string): void {
  if (!initialized || !posthog) return
  posthog.identify(uid)
}

/** Clear identity on sign-out so a next sign-in on this device isn't merged. */
export function resetAnalyticsIdentity(): void {
  if (!initialized || !posthog) return
  posthog.reset()
}
