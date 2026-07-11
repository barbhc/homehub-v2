// ── Appearance / theme ────────────────────────────────────────────────────────
// Light / Dark / System preference, persisted to localStorage and applied by
// toggling the `dark` class on <html>. `system` follows the OS via matchMedia.
//
// NOTE: the initial class is set by an inline script in index.html BEFORE React
// mounts (see THEME_INIT_SNIPPET) so there is no light→dark flash on load. This
// module keeps the class in sync afterwards.

import { useCallback, useEffect, useState } from "react"

export type Appearance = "light" | "dark" | "system"

export const APPEARANCE_KEY = "hh-appearance"

const MEDIA = "(prefers-color-scheme: dark)"

export function getStoredAppearance(): Appearance {
  // Default to Light: the redesign is light-first ("white surfaces, ink text,
  // muted #1B6B5A teal"). Dark stays available via Settings and is opt-in.
  if (typeof localStorage === "undefined") return "light"
  const v = localStorage.getItem(APPEARANCE_KEY)
  return v === "light" || v === "dark" || v === "system" ? v : "light"
}

function systemPrefersDark(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia && window.matchMedia(MEDIA).matches
}

/** Resolve a preference to the actual boolean "is dark" given the current OS. */
export function resolveDark(pref: Appearance): boolean {
  return pref === "dark" || (pref === "system" && systemPrefersDark())
}

/** Apply (or remove) the `dark` class on <html> for the given preference. */
export function applyAppearance(pref: Appearance): void {
  if (typeof document === "undefined") return
  document.documentElement.classList.toggle("dark", resolveDark(pref))
}

/**
 * Inline snippet to run in <head> before paint. Reads the stored preference and
 * sets the `dark` class immediately so there's no flash of the wrong theme.
 */
export const THEME_INIT_SNIPPET = `(function(){try{var k='${APPEARANCE_KEY}';var p=localStorage.getItem(k);if(p!=='light'&&p!=='dark'&&p!=='system')p='light';var d=p==='dark'||(p==='system'&&window.matchMedia&&window.matchMedia('${MEDIA}').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}})();`

/**
 * Hook for reading/setting the appearance preference. Keeps the `dark` class in
 * sync, persists changes, and (in `system` mode) reacts to OS theme changes.
 */
export function useAppearance(): {
  appearance: Appearance
  setAppearance: (pref: Appearance) => void
} {
  const [appearance, setAppearanceState] = useState<Appearance>(getStoredAppearance)

  const setAppearance = useCallback((pref: Appearance) => {
    setAppearanceState(pref)
    try {
      localStorage.setItem(APPEARANCE_KEY, pref)
    } catch {
      /* ignore */
    }
    applyAppearance(pref)
  }, [])

  // Re-apply on mount + when preference changes.
  useEffect(() => {
    applyAppearance(appearance)
  }, [appearance])

  // In `system` mode, follow OS changes live.
  useEffect(() => {
    if (appearance !== "system" || typeof window === "undefined" || !window.matchMedia) return
    const mql = window.matchMedia(MEDIA)
    const onChange = () => applyAppearance("system")
    mql.addEventListener("change", onChange)
    return () => mql.removeEventListener("change", onChange)
  }, [appearance])

  return { appearance, setAppearance }
}
