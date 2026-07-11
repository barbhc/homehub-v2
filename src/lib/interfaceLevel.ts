import { useSyncExternalStore } from "react"

/**
 * Progressive-complexity override (Phase B).
 *
 * Lets the user opt up or down from the auto-derived level (see useUserLevel):
 *  - "simple"   → force Essentials (a power user who wants a calm surface)
 *  - "standard" → use the derived level (adapts as the home grows) — default
 *  - "advanced" → force Power (a new user who wants everything now)
 *
 * Stored in localStorage as a synchronous cache (so the UI never flashes) and
 * persisted per-user in `user_preferences` (key `interface_level`, Phase 5) so
 * the choice follows the user across devices. localStorage is hydrated from the
 * DB on load (see useInterfaceLevelSync); the derived level is the first-run
 * default when neither is set.
 */
export type InterfaceOverride = "simple" | "standard" | "advanced"

const KEY = "homehub:interface-level"
const EVENT = "homehub:interface-level-changed"

/** Coerces an arbitrary stored value to a valid override (defaults to standard). */
export function coerceInterfaceOverride(raw: unknown): InterfaceOverride {
  return raw === "simple" || raw === "advanced" || raw === "standard" ? raw : "standard"
}

export function getInterfaceOverride(): InterfaceOverride {
  if (typeof window === "undefined") return "standard"
  const v = window.localStorage.getItem(KEY)
  return v === "simple" || v === "advanced" ? v : "standard"
}

export function setInterfaceOverride(value: InterfaceOverride): void {
  if (value === "standard") window.localStorage.removeItem(KEY)
  else window.localStorage.setItem(KEY, value)
  // Notify same-tab consumers (storage events only fire cross-tab).
  window.dispatchEvent(new Event(EVENT))
}

function subscribe(callback: () => void): () => void {
  window.addEventListener(EVENT, callback)
  window.addEventListener("storage", callback)
  return () => {
    window.removeEventListener(EVENT, callback)
    window.removeEventListener("storage", callback)
  }
}

/** Reactive read of the override — re-renders consumers when it changes. */
export function useInterfaceOverride(): InterfaceOverride {
  return useSyncExternalStore(subscribe, getInterfaceOverride, () => "standard")
}
