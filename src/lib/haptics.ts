import { useEffect } from "react"
import { Haptics, NotificationType } from "@capacitor/haptics"
import { hasNativePlugin, warnNativeOnce } from "./native"

/**
 * Haptics — kept to a minimum, by the owner's decision ("Minimize haptics",
 * Apple-polish phase 3). Exactly two moments, and nothing else:
 *
 *  - hapticSuccess(): a task was marked done or snoozed — the write committed.
 *  - hapticError():   a save the person asked for failed.
 *
 * Not on swipes, sheets, pickers, toggles or tabs. Adding a third call site is
 * a design decision, not a code change; it belongs in front of the owner first.
 *
 * Both are fire-and-forget: they return nothing, never throw, never await, so a
 * save path can call them without a haptic problem becoming a save problem. In
 * a browser, and in a shell built before the Haptics plugin was added, they do
 * nothing (see hasNativePlugin). iOS itself honours Settings › Sounds & Haptics
 * › System Haptics, so there is no in-app switch to add.
 */
export function hapticSuccess(): void {
  notify(NotificationType.Success)
}

export function hapticError(): void {
  notify(NotificationType.Error)
}

/**
 * The error haptic for a save-failure line: fires when `failure` becomes truthy,
 * and again if it changes to a different message (a second, different failure).
 * Pass the error state the line renders — `null`/`undefined`/`false` = no
 * failure. Only for writes the person asked for: a failed READ, or a background
 * save they didn't trigger, stays silent.
 */
export function useSaveFailedHaptic(failure: unknown): void {
  const key = failure ? (typeof failure === "string" ? failure : true) : null
  useEffect(() => {
    if (key !== null) hapticError()
  }, [key])
}

function notify(type: NotificationType): void {
  if (!hasNativePlugin("Haptics")) return
  try {
    Haptics.notification({ type }).catch((err: unknown) => warnNativeOnce("Haptics", err))
  } catch (err) {
    // A synchronous throw from the bridge proxy: same treatment as a rejection.
    warnNativeOnce("Haptics", err)
  }
}
