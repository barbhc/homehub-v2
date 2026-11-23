/** Settings → Data & privacy: where the data lives and which services see it. Moved from the one-page Settings unchanged. */
import { SectionCard } from "@/components/layout"
import { CardContent } from "@/components/ui/card"

export function PrivacyPane() {
  return (
    <SectionCard>
      <CardContent className="p-4">
        <p className="text-sm text-muted-foreground mb-3">
          Your data is stored in your private database. Homehub does not sell data or show ads.
        </p>
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">AI chat &amp; manual scanning</span> — Your
            questions and uploaded PDF manuals are sent to Anthropic (Claude) for answers and task
            extraction. Anthropic does not train on this data.
          </p>
          <p>
            <span className="font-medium text-foreground">Web search</span> — When you use "Search
            the web," your question and item name are sent to Brave Search.
          </p>
          <p>
            <span className="font-medium text-foreground">Photo recognition</span> — Uploaded
            appliance photos are sent to Google Cloud Vision for label detection.
          </p>
        </div>
      </CardContent>
    </SectionCard>
  )
}
