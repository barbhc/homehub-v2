import { useEffect, useState } from "react"
import { HistoryIcon, TrendingUpIcon, TrendingDownIcon, CheckIcon } from "lucide-react"
import { SectionCard } from "@/components/layout"
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion"
import { cn } from "@/lib/utils"
import {
  getCompletionHistory,
  getTierChangeHistory,
  type CompletionHistoryEntry,
  type TierChangeHistoryEntry,
} from "@/modules/care/services/taskService"
import type { PriorityTier } from "@/integrations/types"
import { tierDotStyles, tierTextStyles } from "./utils"

interface HistorySectionProps {
  homeId: string
  itemId: string
  /** Increment to trigger a re-fetch of history */
  refreshKey?: number
}

type TimelineEvent =
  | {
      kind: "completion"
      id: string
      timestamp: string
      taskTitle: string
      priorityTier: PriorityTier
      completionNotes: string | null
    }
  | {
      kind: "tier-change"
      id: string
      timestamp: string
      taskTitle: string
      oldTier: PriorityTier
      newTier: PriorityTier
      source: string
    }

const TIER_RANK: Record<PriorityTier, number> = {
  essential: 3,
  recommended: 2,
  optional: 1,
}

const TIER_LABEL: Record<PriorityTier, string> = {
  essential: "Essential",
  recommended: "Recommended",
  optional: "Optional",
}

const SOURCE_LABEL: Record<string, string> = {
  manual: "manual edit",
  import: "manual scan",
  drag: "drag",
}

function groupByDate(events: TimelineEvent[]): { label: string; events: TimelineEvent[] }[] {
  const now = new Date()
  const todayStr = now.toLocaleDateString("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayStr = yesterday.toLocaleDateString("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })

  const grouped = new Map<string, TimelineEvent[]>()

  for (const evt of events) {
    const d = new Date(evt.timestamp)
    const dateKey = d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
    if (!grouped.has(dateKey)) grouped.set(dateKey, [])
    grouped.get(dateKey)!.push(evt)
  }

  return Array.from(grouped.entries()).map(([dateKey, items]) => {
    let label: string
    if (dateKey === todayStr) {
      label = "Today"
    } else if (dateKey === yesterdayStr) {
      label = "Yesterday"
    } else {
      const d = new Date(items[0].timestamp)
      label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
    }
    return { label, events: items }
  })
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  })
}

function toTimelineEvents(
  completions: CompletionHistoryEntry[],
  tierChanges: TierChangeHistoryEntry[]
): TimelineEvent[] {
  const events: TimelineEvent[] = [
    ...completions.map(
      (c): TimelineEvent => ({
        kind: "completion",
        id: `c:${c.instanceId}`,
        timestamp: c.completedAt,
        taskTitle: c.taskTitle,
        priorityTier: c.priorityTier,
        completionNotes: c.completionNotes,
      })
    ),
    ...tierChanges.map(
      (t): TimelineEvent => ({
        kind: "tier-change",
        id: `t:${t.id}`,
        timestamp: t.changedAt,
        taskTitle: t.taskTitle,
        oldTier: t.oldTier,
        newTier: t.newTier,
        source: t.source,
      })
    ),
  ]
  events.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
  return events
}

export function HistorySection({ homeId, itemId, refreshKey = 0 }: HistorySectionProps) {
  const [events, setEvents] = useState<TimelineEvent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      getCompletionHistory(homeId, itemId, 20),
      getTierChangeHistory(homeId, itemId, 20),
    ]).then(([completionResult, tierResult]) => {
      if (cancelled) return
      setLoading(false)
      const completions = completionResult.data ?? []
      const tierChanges = tierResult.data ?? []
      setEvents(toTimelineEvents(completions, tierChanges))
    }).catch(() => {
      // History is supplementary: an empty timeline is an acceptable outcome,
      // an endless spinner is not.
      if (!cancelled) setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [homeId, itemId, refreshKey])

  if (loading) return null
  if (events.length === 0) return null

  const groups = groupByDate(events)

  return (
    <SectionCard id="history-section" className="px-4 sm:px-6 py-0 scroll-mt-6">
      <Accordion type="single" collapsible>
        <AccordionItem value="history" className="border-b-0">
          <AccordionTrigger>
            <span className="flex items-center gap-2">
              <HistoryIcon className="size-4 text-muted-foreground" />
              History
              <span className="ml-1 inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                {events.length}
              </span>
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-4 pb-2">
              {groups.map((group) => (
                <div key={group.label}>
                  <p className="text-[10px] font-bold uppercase tracking-[0.09em] text-muted-foreground mb-2 px-1">
                    {group.label}
                  </p>
                  <div className="relative ml-2.5">
                    {group.events.length > 1 && (
                      <div className="absolute left-[3px] top-2 bottom-2 w-px bg-white/50" />
                    )}
                    <ul className="space-y-3 list-none p-0 m-0">
                      {group.events.map((evt) => {
                        if (evt.kind === "completion") {
                          return (
                            <li
                              key={evt.id}
                              className="relative flex items-start gap-3 pl-5"
                            >
                              <span
                                className={cn(
                                  "absolute left-0 top-1.5 size-[7px] rounded-full ring-2 ring-background shrink-0",
                                  tierDotStyles[evt.priorityTier] ?? "bg-muted-foreground"
                                )}
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-baseline justify-between gap-2">
                                  <span className="text-sm font-medium truncate flex items-center gap-1.5">
                                    <CheckIcon className="size-3 text-muted-foreground shrink-0" />
                                    {evt.taskTitle}
                                  </span>
                                  <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
                                    {formatTime(evt.timestamp)}
                                  </span>
                                </div>
                                {evt.completionNotes && (
                                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                                    {evt.completionNotes}
                                  </p>
                                )}
                              </div>
                            </li>
                          )
                        }

                        // tier-change
                        const goingUp =
                          TIER_RANK[evt.newTier] > TIER_RANK[evt.oldTier]
                        const TrendIcon = goingUp ? TrendingUpIcon : TrendingDownIcon
                        const sourceLabel = SOURCE_LABEL[evt.source] ?? evt.source
                        return (
                          <li
                            key={evt.id}
                            className="relative flex items-start gap-3 pl-5"
                          >
                            <span
                              className={cn(
                                "absolute left-0 top-1.5 size-[7px] rounded-full ring-2 ring-background shrink-0",
                                tierDotStyles[evt.newTier] ?? "bg-muted-foreground"
                              )}
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-baseline justify-between gap-2">
                                <span className="text-sm font-medium truncate flex items-center gap-1.5">
                                  <TrendIcon className="size-3 text-muted-foreground shrink-0" />
                                  {evt.taskTitle}
                                </span>
                                <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
                                  {formatTime(evt.timestamp)}
                                </span>
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                Tier changed ·{" "}
                                <span className={tierTextStyles[evt.oldTier]}>
                                  {TIER_LABEL[evt.oldTier]}
                                </span>
                                {" → "}
                                <span className={tierTextStyles[evt.newTier]}>
                                  {TIER_LABEL[evt.newTier]}
                                </span>
                                {" · "}
                                <span className="italic">from {sourceLabel}</span>
                              </p>
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                </div>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </SectionCard>
  )
}
