import { registerPlugin } from "@capacitor/core"
import { hasNativePlugin, warnNativeOnce } from "./native"

/**
 * Edge-swipe back, and the one place it must not work.
 *
 * The iOS shell turns on WKWebView's back/forward swipe (MainViewController in
 * barbhc/homehub), so a swipe in from the left edge walks the web history —
 * React Router hears it as an ordinary popstate. At the first screen there is
 * no history entry behind it and WebKit simply doesn't start the gesture.
 *
 * What a native app never does is go back UNDERNEATH an open sheet or dialog:
 * the sheet would vanish with whatever was typed into it, skipping the "discard
 * changes?" question entirely. So while any modal is open, this asks the shell
 * to switch the gesture off, and back on when the last one closes. Watching the
 * DOM rather than each sheet keeps every present and future sheet covered: the
 * Radix dialogs and the hand-built sheets all render role="dialog" only while
 * open (the feature tour relies on the same signal, useFeatureTour.ts).
 *
 * The shell side is a tiny plugin registered by the app itself, "BackGesture".
 * A shell built before it has neither the plugin nor the gesture, so the
 * missing plugin is exactly right there: nothing to guard, nothing happens.
 */
interface BackGesturePlugin {
  setEnabled(options: { enabled: boolean }): Promise<void>
}

const BackGesture = registerPlugin<BackGesturePlugin>("BackGesture")

export const MODAL_SELECTOR = '[role="dialog"], [role="alertdialog"], [aria-modal="true"]'

export function modalIsOpen(root: ParentNode = document): boolean {
  return root.querySelector(MODAL_SELECTOR) !== null
}

let enabled = true

function setEnabled(next: boolean): void {
  if (next === enabled) return
  enabled = next
  BackGesture.setEnabled({ enabled: next }).catch((err: unknown) => {
    enabled = !next // the shell's state didn't change; let the next check retry
    warnNativeOnce("BackGesture", err)
  })
}

/**
 * Start guarding. Returns a stop function. A no-op off the shell and on a
 * shell without the plugin. DOM changes are coalesced to one check per frame.
 */
export function startBackGestureGuard(): () => void {
  if (typeof document === "undefined" || !hasNativePlugin("BackGesture")) return () => {}
  let frame = 0
  const check = () => {
    frame = 0
    setEnabled(!modalIsOpen())
  }
  const observer = new MutationObserver(() => {
    if (!frame) frame = requestAnimationFrame(check)
  })
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["role", "aria-modal"],
  })
  check()
  return () => {
    observer.disconnect()
    if (frame) cancelAnimationFrame(frame)
    frame = 0
  }
}

/** Test seam. */
export function resetBackGestureState(): void {
  enabled = true
}
