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
