/** The scan status components (the Items tab count); the rules are in scanStatus.ts. */
import type { ReactNode } from "react"
import { useParseTray } from "@/hooks/useParseTray"
import { ScanTrayContext } from "./scanStatus"

/** One subscription to the home's reads for the whole app. */
export function ScanTrayProvider({ homeId, children }: { homeId: string | null; children: ReactNode }) {
  const tray = useParseTray(homeId)
  return <ScanTrayContext.Provider value={tray}>{children}</ScanTrayContext.Provider>
}

/** The small count on the Items tab. Nothing when there is nothing. Its size follows the tab labels, which stop growing at 1.5x Larger Text. */
export function ScanCountBadge({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null
  return (
    <span aria-hidden="true" data-testid="scan-count"
      className={`grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[length:var(--hh-tabbar-label)] font-bold leading-none ${className ?? ""}`}
      style={{ background: "var(--hh-teal-fill)", color: "var(--hh-on-fill)" }}>
      {count}
    </span>
  )
}
