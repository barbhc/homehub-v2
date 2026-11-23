import { useState } from "react"
import { useSWRConfig } from "swr"
import { InlineError, SectionCard } from "@/components/layout"
import { CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { useHomeProfile } from "@/modules/home"
import { setTaskLevel } from "@/modules/care/services/taskLevelService"
import { TASK_LEVELS, TASK_LEVEL_COPY, taskLevelOf, type TaskLevel } from "../../../shared/tasks/taskLevel"

/**
 * Settings › Task level — D4, mock screen 2 (approved 2026-11-20):
 * https://claude.ai/artifact/Ao4AvquYrsTwZDs4oUUSuo#level
 *
 * One choice per HOME, least to most, one per row. It is a page of its own
 * (/settings/task-level, design/settings-your-home.md); the page carries the
 * heading, and "Change" in the review after a scan and in the Tasks footer
 * links straight to it.
 *
 * A home that never chose shows Everything selected, because that is how it
 * behaves (taskLevelOf). The choice is saved before it is shown as made: a
 * failed save leaves the old level selected and says so — the list this
 * setting controls must never disagree with the card that set it.
 */
export function TaskLevelSection({ homeId }: { homeId: string }) {
  const { profile, isLoading, error: loadError, refresh } = useHomeProfile(homeId)
  const { mutate } = useSWRConfig()
  const [saving, setSaving] = useState<TaskLevel | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const current = taskLevelOf(profile?.task_level)
  const ready = !isLoading && !loadError

  const choose = async (value: TaskLevel) => {
    if (!ready || saving || value === current) return
    setSaveError(null)
    setSaving(value)
    const res = await setTaskLevel(homeId, value)
    if (res.error) {
      setSaving(null)
      setSaveError(res.error.message)
      return
    }
    // The level changes what Home and Tasks list: every cached read for this
    // home is stale now, so each is refetched rather than trusted.
    await refresh()
    void mutate((key) => typeof key === "string" && key.includes(homeId))
    setSaving(null)
  }

  return (
    <div>
      <SectionCard>
        <CardContent className="p-4">
          <p className="text-sm text-muted-foreground mb-3">Which upkeep goes into Tasks. It applies to this whole home.</p>
          <div className="flex flex-col gap-2">
            {TASK_LEVELS.map((level) => {
              const copy = TASK_LEVEL_COPY[level]
              return (
                <button
                  key={level}
                  type="button"
                  aria-pressed={ready && current === level}
                  aria-busy={saving === level}
                  disabled={!ready || saving !== null}
                  onClick={() => { void choose(level) }}
                  className={cn(
                    "rounded-lg border px-3 py-2.5 text-left transition-colors disabled:cursor-default",
                    // The selected state is the SAVED level. A choice still
                    // saving is marked busy, not selected.
                    ready && current === level
                      ? "border-[var(--hh-teal)] bg-[var(--hh-teal-wash)] text-[var(--hh-ink)] ring-1 ring-[var(--hh-teal)]"
                      : "border-border bg-background text-foreground hover:border-foreground/40",
                    saving === level && "border-[var(--hh-teal)]",
                  )}
                >
                  <span className="block text-sm font-semibold">
                    {copy.label}
                    {saving === level && <span className="font-normal text-muted-foreground"> · Saving…</span>}
                  </span>
                  <span className={cn("block text-xs mt-0.5", ready && current === level ? "text-[var(--hh-sub)]" : "text-muted-foreground")}>
                    {copy.hint}
                  </span>
                </button>
              )
            })}
          </div>
          <p className="text-sm text-muted-foreground mt-3">This changes what shows. Nothing is deleted.</p>
          {loadError && <InlineError className="mt-3">Couldn&apos;t load this home&apos;s task level. Check your connection and try again.</InlineError>}
          {saveError && <InlineError className="mt-3">{saveError}</InlineError>}
        </CardContent>
      </SectionCard>
    </div>
  )
}
