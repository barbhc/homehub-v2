import { useCallback, useEffect, useState } from "react"

/**
 * Whether to search for a manual automatically, or wait to be asked.
 *
 * OFF for the beta. Attaching the wrong manual is the most expensive mistake in
 * the product — it parses cleanly and becomes a care plan for someone else's
 * appliance — so the default path is the one where a person chose the file. The
 * search still exists, one tap away and labelled Beta; this only decides whether
 * it runs before anyone asks.
 *
 * Device-local rather than per-home: it is a preference about how much you trust
 * a work-in-progress feature, which belongs to the person, not the house.
 */
const KEY = "homehub:auto-find-manuals"
/** Fires on change so every mounted surface agrees within the same tab —
 *  `storage` only reaches OTHER tabs. */
const EVENT = "homehub:auto-find-manuals-changed"

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === "true"
  } catch {
    return false
  }
}

export function useAutoFindManuals(): [boolean, (next: boolean) => void] {
  const [enabled, setEnabled] = useState(read)

  useEffect(() => {
    const sync = () => setEnabled(read())
    window.addEventListener(EVENT, sync)
    window.addEventListener("storage", sync)
    return () => {
      window.removeEventListener(EVENT, sync)
      window.removeEventListener("storage", sync)
    }
  }, [])

  const set = useCallback((next: boolean) => {
    try {
      localStorage.setItem(KEY, String(next))
    } catch {
      // Private mode. The toggle still works for this session.
    }
    setEnabled(next)
    window.dispatchEvent(new Event(EVENT))
  }, [])

  return [enabled, set]
}
