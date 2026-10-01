import { Link } from "react-router-dom"
import { TEAL } from "./shared"

/**
 * HH-94's footer: the cleaning a NON-empty Tasks list leaves out, and where it
 * lives. (An empty list says it in its headline instead — nothingDueLine.)
 *
 * The rule's third invisibility report: with tasks on the list, a scheduled
 * item-cleaning job was simply absent and nothing said so. The phone grew this
 * line, but it could never render — the count was only taken for an EMPTY
 * agenda — and the desktop never had it at all. One implementation now, which
 * both trees render under their groups, fed by the count useWeekAgenda takes
 * on every read. ("1 cleaning job … lives", as nothingDueLine says it: the
 * phone's never-rendered draft read "1 cleaning job … live".)
 */
export function HiddenCleaningLink({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null
  return (
    <Link to="/clean" className={className} style={{ color: "var(--hh-sub)" }}>
      {count} cleaning job{count === 1 ? " for your items lives" : "s for your items live"} in <b style={{ color: TEAL }}>Deep Clean</b> →
    </Link>
  )
}
