import { Capacitor } from "@capacitor/core"

/** True inside the native iOS/Android shell; false on the web. */
export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform()
}

/** Current platform: "ios" | "android" | "web". */
export function getNativePlatform(): string {
  return Capacitor.getPlatform()
}

/**
 * Stamp `data-native` / `data-platform` on <html> at boot so CSS can target the
 * native shell.
 *
 * Needed because a Capacitor WKWebView is NOT `display-mode: standalone` — the
 * safe-area fallback in index.css was gated on that media query, so inside the
 * iOS app it resolved to `padding-top: 0` and page content slid under the status
 * bar clock (reported 2026-07-29). Mobile Safari must NOT get the fallback (the
 * browser already insets content, and a fixed inset would add a phantom gap), so
 * "is this the native shell?" has to be a real runtime check, not a media query.
 */
export function markNativePlatform(): void {
  if (typeof document === "undefined") return
  const root = document.documentElement
  if (Capacitor.isNativePlatform()) root.setAttribute("data-native", "true")
  root.setAttribute("data-platform", Capacitor.getPlatform())
}

/**
 * Native plugins the web app calls but an OLDER shell may not carry.
 *
 * The iOS shell loads this site live (remote-URL mode), so a hosting deploy
 * reaches every installed build at once — including TestFlight builds made
 * before a plugin was added to the shell. Calling a plugin the binary lacks
 * rejects with UNIMPLEMENTED; for haptics and the status bar that must never
 * surface, and must never reach a save path. So every caller asks here first.
 *
 * The miss is logged ONCE per plugin, so a console session on an old build says
 * why nothing happened, without a line per tap.
 */
const reportedMissing = new Set<string>()
const reportedFailing = new Set<string>()

/** True only inside the native shell AND when this build registered `name`. */
export function hasNativePlugin(name: string): boolean {
  if (!Capacitor.isNativePlatform()) return false
  if (Capacitor.isPluginAvailable(name)) return true
  if (!reportedMissing.has(name)) {
    reportedMissing.add(name)
    console.info(`[native] ${name} is not in this app build — skipping it (expected on a shell built before it was added).`)
  }
  return false
}

/** A native call that failed anyway: log it once per plugin, never throw. */
export function warnNativeOnce(name: string, err: unknown): void {
  if (reportedFailing.has(name)) return
  reportedFailing.add(name)
  console.warn(`[native] ${name} call failed; further failures are not logged:`, err instanceof Error ? err.message : err)
}

/** Test seam: forget what has been logged. */
export function resetNativeLogOnce(): void {
  reportedMissing.clear()
  reportedFailing.clear()
}
