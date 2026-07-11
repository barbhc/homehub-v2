import { ChevronRightIcon, HardHatIcon, ShieldAlertIcon } from "lucide-react"
import { Link } from "react-router-dom"
import type { TaskActor } from "@/lib/taskActor"

/**
 * Reframes a pro/hazardous task away from a DIY checklist.
 *  - hazardous: red safety notice + "Find a pro" — caller should suppress steps.
 *  - pro: muted "best done by a professional" notice + "Schedule a pro".
 */
export function ProTaskNotice({ actor }: { actor: Exclude<TaskActor, "diy"> }) {
  if (actor === "hazardous") {
    return (
      <div className="rounded-lg border border-red-400/50 bg-red-50/70 px-3 py-2.5 dark:bg-red-950/20 dark:border-red-700/40">
        <div className="flex items-start gap-2">
          <ShieldAlertIcon className="size-4 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-red-800 dark:text-red-300">
              Leave this to a licensed professional
            </p>
            <p className="text-xs text-red-700/90 dark:text-red-300/80 mt-0.5 leading-snug">
              This involves gas, combustion, or live electrical work — don&apos;t attempt it
              yourself. If you ever smell gas, leave and call your gas company.
            </p>
            <Link
              to="/settings"
              className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 dark:text-red-300 mt-1.5 hover:underline"
            >
              Find a pro <ChevronRightIcon className="size-3" />
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border bg-muted/40 px-3 py-2.5">
      <div className="flex items-start gap-2">
        <HardHatIcon className="size-4 text-muted-foreground mt-0.5 shrink-0" />
        <div className="min-w-0">
          <p className="text-xs font-semibold text-foreground">Best done by a professional</p>
          <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
            This usually needs a technician&apos;s tools and training. The steps below are what
            they&apos;ll check.
          </p>
          <Link
            to="/settings"
            className="inline-flex items-center gap-1 text-xs font-semibold text-primary mt-1.5 hover:underline"
          >
            Schedule a pro <ChevronRightIcon className="size-3" />
          </Link>
        </div>
      </div>
    </div>
  )
}
