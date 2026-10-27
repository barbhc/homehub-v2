import { StatusBar, Style } from "@capacitor/status-bar"
import { hasNativePlugin, warnNativeOnce } from "./native"

/**
 * The iOS status bar follows the app's EFFECTIVE appearance — the `dark` class
 * on <html> — not the phone's. They differ whenever someone picks Light or Dark
 * in Settings › Appearance against the phone's setting, and left to iOS the
 * clock would then be dark text on the dark page (or white on the light one).
 *
 * Capacitor's names are about the BACKGROUND, not the text:
 *   Style.Dark  → light text, for a dark page
 *   Style.Light → dark text, for a light page
 */
export function statusBarStyleFor(dark: boolean): Style {
  return dark ? Style.Dark : Style.Light
}

let applied: Style | null = null

/**
 * Set the status bar for a light or dark page. Repeats are skipped; a no-op in
 * a browser and in a shell without the StatusBar plugin. Never throws.
 */
export function syncStatusBar(dark: boolean): void {
  if (!hasNativePlugin("StatusBar")) return
  const style = statusBarStyleFor(dark)
  if (style === applied) return
  applied = style
  try {
    StatusBar.setStyle({ style }).catch((err: unknown) => {
      applied = null // let the next sync try again
      warnNativeOnce("StatusBar", err)
    })
  } catch (err) {
    applied = null
    warnNativeOnce("StatusBar", err)
  }
}

/** Match the status bar to whatever the document is showing right now. */
export function syncStatusBarToDocument(): void {
  if (typeof document === "undefined") return
  syncStatusBar(document.documentElement.classList.contains("dark"))
}

/** Test seam. */
export function resetStatusBarSync(): void {
  applied = null
}
