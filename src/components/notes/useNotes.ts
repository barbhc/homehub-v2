import { useEffect, useState } from "react"
import type { CareNote } from "@/integrations/types"

type Result = { data: CareNote[]; error: null } | { data: null; error: { message: string } }

/**
 * Loads notes through `load`, re-running when `key` changes or `reload()` is
 * called. A failed load is an error, never an empty list: "Nothing noted yet"
 * on top of a failed read would be a confident wrong answer.
 */
export function useNotes(key: string | null, load: () => Promise<Result>) {
  const [state, setState] = useState<{ key: string | null; notes: CareNote[] | null; error: string | null }>({ key: null, notes: null, error: null })
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!key) return
    let cancelled = false
    void load().then((res) => {
      if (cancelled) return
      setState(res.error ? { key, notes: null, error: res.error.message } : { key, notes: res.data, error: null })
    })
    return () => { cancelled = true }
    // `load` is a fresh closure every render; `key` is what names the query.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tick])

  const current = state.key === key
  return {
    notes: current ? state.notes : null,
    error: current ? state.error : null,
    loading: !current || (state.notes === null && state.error === null),
    reload: () => setTick((n) => n + 1),
  }
}
