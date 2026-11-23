/**
 * Settings → Report a problem.
 *
 * The subject and body are pre-filled with the build, platform and OS so a
 * report arrives actionable instead of starting a round-trip for "which
 * version are you on?". Testers on TestFlight also have Apple's own
 * screenshot-feedback channel; this is for everyone else, and for anything
 * that needs a reply. Moved from the one-page Settings unchanged.
 */
import { SectionCard } from "@/components/layout"
import { CardContent } from "@/components/ui/card"
import { FeedbackButton } from "@/components/FeedbackButton"
import { SUPPORT_EMAIL } from "@/lib/feedback"

export function HelpPane() {
  return (
    <SectionCard>
      <CardContent className="p-4">
        <p className="text-sm text-muted-foreground">
          Something broken or confusing? This opens an email with your app version filled in.
          You can also write to{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="hit-44 underline underline-offset-2 larger-text:[overflow-wrap:anywhere]">
            {SUPPORT_EMAIL}
          </a>{" "}
          directly.
        </p>
        <div className="mt-3"><FeedbackButton label="Send report" /></div>
      </CardContent>
    </SectionCard>
  )
}
