import { Tooltip } from "radix-ui"
import { AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"

interface InfoTooltipProps {
  message: string
  className?: string
}

export function InfoTooltip({ message, className }: InfoTooltipProps) {
  return (
    <Tooltip.Provider delayDuration={100}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <button
            type="button"
            className={cn("inline-flex text-amber-500 hover:text-amber-600 focus:outline-none", className)}
            aria-label="More information"
          >
            <AlertCircle className="size-3.5" />
          </button>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            side="top"
            align="start"
            sideOffset={4}
            className="z-50 max-w-xs rounded-md bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md border border-border"
          >
            {message}
            <Tooltip.Arrow className="fill-border" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  )
}
