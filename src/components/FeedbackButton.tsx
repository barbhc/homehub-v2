import { useCallback, useState } from "react"
import { MessageSquareWarningIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { openFeedback, SUPPORT_EMAIL, type FeedbackKind } from "@/lib/feedback"
import { cn } from "@/lib/utils"

/**
 * "Something's wrong" in one tap, from wherever the user already is.
 *
 * Renders the support address as TEXT alongside the button, not only as a
 * link: mailto does nothing on a machine with no mail client configured, and a
 * dead button is worse than no button — the user thinks they reported it.
 */
export function FeedbackButton({
  kind = "problem",
  label = "Report a problem",
  extra,
  variant = "outline",
  size = "sm",
  showAddress = false,
  className,
}: {
  kind?: FeedbackKind
  label?: string
  /** Extra key/value lines appended to the report (e.g. an error message). */
  extra?: Record<string, string | undefined>
  variant?: "outline" | "ghost" | "default" | "secondary"
  size?: "sm" | "default"
  /** Show the address as selectable text under the button. */
  showAddress?: boolean
  className?: string
}) {
  const [busy, setBusy] = useState(false)
  const onClick = useCallback(async () => {
    setBusy(true)
    try {
      await openFeedback(kind, extra)
    } finally {
      // Not left spinning: mailto navigates away from the page in some
      // browsers and does nothing at all in others, so the button has to come
      // back either way.
      setBusy(false)
    }
  }, [kind, extra])

  return (
    <div className={cn("flex flex-col items-start gap-1.5", className)}>
      <Button onClick={onClick} variant={variant} size={size} disabled={busy}>
        <MessageSquareWarningIcon className="size-4" aria-hidden="true" />
        {label}
      </Button>
      {showAddress && (
        <p className="text-xs text-muted-foreground">
          or email{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="underline underline-offset-2">
            {SUPPORT_EMAIL}
          </a>
        </p>
      )}
    </div>
  )
}
