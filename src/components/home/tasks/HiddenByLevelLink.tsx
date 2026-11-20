import { Link } from "react-router-dom"
import { cn } from "@/lib/utils"
import { TEAL } from "./shared"

/**
 * D4: what the home's task level is leaving off this list, and where to change
 * it. The same promise HiddenCleaningLink keeps for item cleaning (HH-82,
 * HH-94): a list never withholds work without saying so — here on a full list
 * AND an empty one, because "Nothing due" over hidden tasks is the report that
 * rule exists to prevent.
 */
export function HiddenByLevelLink({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null
  return (
    <Link to="/settings#task-level" className={cn("hit-44", className)} style={{ color: "var(--hh-sub)" }}>
      {count} task{count === 1 ? " is" : "s are"} hidden by your task level. <b style={{ color: TEAL }}>Change</b>
    </Link>
  )
}
