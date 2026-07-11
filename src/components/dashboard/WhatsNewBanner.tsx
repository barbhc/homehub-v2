import { useState, useEffect } from "react"
import { SparklesIcon, XIcon, ChevronRightIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { getPreference, setPreference } from "@/lib/userPreferences"
import { WHATS_NEW_ENTRIES, type WhatsNewEntry } from "@/lib/whatsNew"

const PREF_WHATS_NEW_DISMISSED = "whats_new_dismissed_version"

interface WhatsNewBannerProps {
  userId: string
}

export function WhatsNewBanner({ userId }: WhatsNewBannerProps) {
  const [visible, setVisible] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [latest, setLatest] = useState<WhatsNewEntry | null>(null)

  useEffect(() => {
    let cancelled = false
    async function check() {
      const current = WHATS_NEW_ENTRIES[0]
      if (!current) return
      try {
        const dismissed = await getPreference<string>(userId, PREF_WHATS_NEW_DISMISSED)
        if (dismissed === current.version) return
      } catch {
        // First time or pref fetch failed — show the banner
      }
      if (!cancelled) {
        setLatest(current)
        setVisible(true)
      }
    }
    check()
    return () => { cancelled = true }
  }, [userId])

  async function handleDismiss() {
    setVisible(false)
    if (latest) {
      try {
        await setPreference(userId, PREF_WHATS_NEW_DISMISSED, latest.version)
      } catch {
        // Best effort — banner stays dismissed for this session
      }
    }
  }

  if (!visible || !latest) return null

  return (
    <div className={cn(
      "rounded-xl border px-4 py-3",
      "bg-violet-500/5 border-violet-500/20"
    )}>
      <div className="flex items-start gap-3">
        <SparklesIcon className="size-4 text-violet-500 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1 group"
          >
            <p className="text-sm font-medium text-foreground">
              What&apos;s new — {latest.title}
            </p>
            <ChevronRightIcon
              className={cn(
                "size-3.5 text-muted-foreground transition-transform",
                expanded && "rotate-90"
              )}
            />
          </button>
          {!expanded && (
            <p className="text-xs text-muted-foreground mt-0.5">{latest.summary}</p>
          )}
          {expanded && (
            <ul className="mt-2 space-y-1.5">
              {latest.items.map((item, i) => (
                <li key={i} className="text-xs text-muted-foreground flex gap-2">
                  <span className="shrink-0 mt-0.5 size-1.5 rounded-full bg-violet-400" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Dismiss"
        >
          <XIcon className="size-4" />
        </button>
      </div>
    </div>
  )
}
