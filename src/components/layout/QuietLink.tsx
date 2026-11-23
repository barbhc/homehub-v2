import type { ReactNode } from "react"
import { Link } from "react-router-dom"
import { cn } from "@/lib/utils"

/**
 * A quiet text link under a list ("Edit rooms", "Add your own task"): teal
 * words, no chrome. Its box is 44pt tall, so the tap needs no hit-slop and
 * cannot share a neighbour's; the leading is unitless for Larger Text.
 */
export function QuietLink({ to, children, testId, className }: {
  to: string
  children: ReactNode
  testId?: string
  className?: string
}) {
  return (
    <Link
      to={to}
      data-testid={testId}
      className={cn("inline-flex min-h-11 items-center text-[0.8125rem] font-semibold leading-[1.38]", className)}
      style={{ color: "var(--hh-teal)" }}
    >
      {children}
    </Link>
  )
}
