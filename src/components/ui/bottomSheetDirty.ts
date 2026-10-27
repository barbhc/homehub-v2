import { createContext, useContext, useLayoutEffect } from "react"

/** Set by BottomSheet: content below it reports whether it holds unsaved input. */
export const SheetDirtyContext = createContext<((dirty: boolean) => void) | null>(null)

/** Mark the enclosing BottomSheet as holding unsaved input (for content whose
 *  state lives below the component that renders the sheet). A drag, scrim tap
 *  or Escape then asks "Discard changes?" instead of closing. */
export function useSheetDirty(dirty: boolean) {
  const setDirty = useContext(SheetDirtyContext)
  useLayoutEffect(() => {
    setDirty?.(dirty)
    return () => setDirty?.(false)
  }, [dirty, setDirty])
}
