import { Link } from "react-router-dom"
import { MessageCircleIcon, SparklesIcon } from "lucide-react"

/**
 * Ask-first Home hero. Shown above the task surfaces when the user picked
 * "Ask-first" in their home profile — optimizes the top of Home for
 * reactive troubleshooting ("my dishwasher is leaking") instead of
 * proactive task review.
 *
 * Keep it compact: the surfaces below (urgent tasks, warranty alerts) are
 * still useful, so the hero shouldn't push them off the fold.
 */
export function AskFirstHero() {
  const suggestions = [
    "My dishwasher is leaking",
    "How do I reset the garbage disposal?",
    "When should I replace my HVAC filter?",
  ]

  return (
    <div className="mt-2 mb-4 rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 via-primary/5 to-transparent p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <div className="shrink-0 rounded-xl bg-primary/10 p-2.5">
          <SparklesIcon className="size-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base sm:text-lg font-display font-semibold leading-tight">
            Ask about anything in your home
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Troubleshooting, maintenance how-tos, or just figuring out what that noise means.
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <li
                key={s}
                className="inline-flex items-center rounded-full border border-border bg-background/70 px-3 py-1.5 text-xs text-muted-foreground"
              >
                “{s}”
              </li>
            ))}
          </ul>
          <Link
            to="/chat"
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors min-h-11"
          >
            <MessageCircleIcon className="size-4" />
            Start a question
          </Link>
        </div>
      </div>
    </div>
  )
}
