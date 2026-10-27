import { createContext, useContext, useLayoutEffect } from "react"

/** Set by BottomSheet for the content inside it. */
export interface SheetControls {
  /** Report whether the content holds unsaved input. */
  setDirty: (dirty: boolean) => void
  /** Close the sheet the way its own ✕, the scrim and Escape do: when the
   *  content is dirty, ask "Discard changes?" first. */
  dismiss: () => void
}

export const SheetDirtyContext = createContext<SheetControls | null>(null)

/** Mark the enclosing BottomSheet as holding unsaved input (for content whose
 *  state lives below the component that renders the sheet). A drag, scrim tap
 *  or Escape then asks "Discard changes?" instead of closing. */
export function useSheetDirty(dirty: boolean) {
  const controls = useContext(SheetDirtyContext)
  useLayoutEffect(() => {
    controls?.setDirty(dirty)
    return () => controls?.setDirty(false)
  }, [dirty, controls])
}

/** A close control inside the sheet's content (a header ✕) that should go
 *  through the same dirty gate as the sheet's own ✕. Falls back to `fallback`
 *  outside a BottomSheet. */
export function useSheetDismiss(fallback: () => void): () => void {
  const controls = useContext(SheetDirtyContext)
  return controls ? controls.dismiss : fallback
}
