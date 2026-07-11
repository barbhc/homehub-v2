import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { BellRingIcon, XIcon, Loader2Icon } from "lucide-react"
import {
  isPushSupported,
  isSubscribed as checkIsSubscribed,
  subscribeToPush,
} from "@/lib/pushNotifications"
import {
  isNativePlatform,
  isNativePushRegistered,
  registerNativePush,
} from "@/lib/nativePush"

/**
 * Home-page opt-in nudge for push notifications.
 *
 * Settings already has the full Enable/Disable toggle; this is a soft
 * acquisition surface so users who never visit Settings still have a chance
 * to subscribe. Only shown when:
 *   - The browser supports push AND has VAPID configured (isPushSupported)
 *   - The user has NOT already subscribed on this device
 *   - The user hasn't dismissed the nudge for this home
 *
 * Dismissal is per-home in localStorage so reinstalling the PWA or switching
 * homes re-offers the prompt, but normal revisits don't nag.
 */
const DISMISS_KEY_PREFIX = "homehub:push_nudge_dismissed:"

type NudgeState = "checking" | "visible" | "hidden" | "subscribing" | "error"

export function PushOptInNudge({ userId, homeId }: { userId: string; homeId: string }) {
  const storageKey = `${DISMISS_KEY_PREFIX}${homeId}`
  const [state, setState] = useState<NudgeState>("checking")
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function run() {
      // Dismissed? Don't even check the subscription state.
      try {
        if (typeof window !== "undefined" && window.localStorage.getItem(storageKey) === "1") {
          if (!cancelled) setState("hidden")
          return
        }
      } catch {
        // localStorage unavailable — fall through to showing the nudge.
      }

      // Native shell (iOS): use the APNs path; the web-push capability checks
      // below (serviceWorker/PushManager/Notification) don't apply.
      if (isNativePlatform()) {
        const alreadyNative = await isNativePushRegistered()
        if (cancelled) return
        setState(alreadyNative ? "hidden" : "visible")
        return
      }

      if (!isPushSupported()) {
        if (!cancelled) setState("hidden")
        return
      }

      // If permission was already denied, the subscribe prompt won't reopen
      // the OS-level permission; hide the nudge and defer to Settings.
      if (typeof Notification !== "undefined" && Notification.permission === "denied") {
        if (!cancelled) setState("hidden")
        return
      }

      const already = await checkIsSubscribed()
      if (cancelled) return
      setState(already ? "hidden" : "visible")
    }
    run()
    return () => {
      cancelled = true
    }
  }, [storageKey])

  const handleDismiss = () => {
    try {
      window.localStorage.setItem(storageKey, "1")
    } catch {
      // best-effort
    }
    setState("hidden")
  }

  const handleEnable = async () => {
    setState("subscribing")
    setErrorMsg(null)
    const result = isNativePlatform()
      ? await registerNativePush(userId, homeId)
      : await subscribeToPush(userId, homeId)
    if (result.success) {
      setState("hidden")
    } else {
      // "Permission denied" is a final user decision — hide rather than
      // leaving a dead nudge on the page.
      if (result.error === "Permission denied") {
        setState("hidden")
      } else {
        setErrorMsg(result.error ?? "Couldn't enable notifications.")
        setState("error")
      }
    }
  }

  if (state === "checking" || state === "hidden") return null

  return (
    <div className="mt-2 mb-4 rounded-2xl border border-primary/20 bg-primary/5 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <div className="shrink-0 rounded-xl bg-primary/10 p-2.5">
          <BellRingIcon className="size-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-display font-semibold leading-tight">
            Reminders for essential tasks
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Get a morning push notification only when an Essential maintenance task is due —
            things like smoke-detector batteries, HVAC service, or warranty windows. Recommended
            and Optional tasks won't ping you.
          </p>
          {errorMsg ? (
            <p className="text-sm text-destructive mt-2">{errorMsg}</p>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleEnable}
              disabled={state === "subscribing"}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors min-h-11 disabled:opacity-70"
            >
              {state === "subscribing" ? (
                <>
                  <Loader2Icon className="size-4 animate-spin" />
                  Enabling…
                </>
              ) : (
                "Enable notifications"
              )}
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              disabled={state === "subscribing"}
              className="inline-flex items-center rounded-lg border border-border bg-background px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-accent min-h-11 disabled:opacity-70"
            >
              Not now
            </button>
            <Link
              to="/settings"
              className="text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              Manage in Settings
            </Link>
          </div>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          disabled={state === "subscribing"}
          aria-label="Dismiss notifications nudge"
          className="shrink-0 -mr-1 -mt-1 inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent disabled:opacity-70"
        >
          <XIcon className="size-4" />
        </button>
      </div>
    </div>
  )
}
