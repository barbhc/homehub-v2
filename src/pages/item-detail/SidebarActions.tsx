import { BookOpenIcon, HistoryIcon, RefreshCwIcon, CpuIcon, WrenchIcon } from "lucide-react"
import { SectionCard } from "@/components/layout"

interface SidebarActionsProps {
  onOpenManual: () => void
  onRescan?: () => void
  onTroubleshoot?: () => void
}

export function SidebarActions({ onOpenManual, onRescan, onTroubleshoot }: SidebarActionsProps) {
  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  return (
    <SectionCard className="hidden lg:grid grid-cols-2 gap-2 p-3">
      <button
        type="button"
        onClick={onOpenManual}
        className="flex flex-col items-center gap-1 rounded-lg border border-white/50 bg-white/40 px-2 py-2.5 text-xs font-semibold text-muted-foreground hover:bg-white/60 hover:text-primary transition-colors"
      >
        <BookOpenIcon className="size-4" />
        Manual
      </button>
      {onRescan && (
        <button
          type="button"
          onClick={onRescan}
          className="flex flex-col items-center gap-1 rounded-lg border border-white/50 bg-white/40 px-2 py-2.5 text-xs font-semibold text-muted-foreground hover:bg-white/60 hover:text-primary transition-colors"
        >
          <RefreshCwIcon className="size-4" />
          Rescan
        </button>
      )}
      <button
        type="button"
        onClick={() => scrollTo("history-section")}
        className="flex flex-col items-center gap-1 rounded-lg border border-white/50 bg-white/40 px-2 py-2.5 text-xs font-semibold text-muted-foreground hover:bg-white/60 hover:text-primary transition-colors"
      >
        <HistoryIcon className="size-4" />
        History
      </button>
      <button
        type="button"
        onClick={() => scrollTo("specs-section")}
        className="flex flex-col items-center gap-1 rounded-lg border border-white/50 bg-white/40 px-2 py-2.5 text-xs font-semibold text-muted-foreground hover:bg-white/60 hover:text-primary transition-colors"
      >
        <CpuIcon className="size-4" />
        Specs
      </button>
      {onTroubleshoot && (
        <button
          type="button"
          onClick={onTroubleshoot}
          className="col-span-2 flex items-center justify-center gap-2 rounded-lg border border-white/50 bg-white/40 px-2 py-2.5 text-xs font-semibold text-muted-foreground hover:bg-white/60 hover:text-primary transition-colors"
        >
          <WrenchIcon className="size-4 text-primary" />
          Fix a problem
        </button>
      )}
    </SectionCard>
  )
}
