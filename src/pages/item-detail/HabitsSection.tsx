/**
 * HabitsSection — Phase 3 (RUT reframe)
 *
 * Renders habit-type tasks (`as_needed`, `after_each_use`) on item detail.
 * These are NOT scheduled recurring tasks — no due date, not in the task feed.
 *
 * Grouped by what the task actually IS, not by care_type:
 *  - "Habits" (after_each_use): routine, do as part of regular use.
 *  - "When needed" (as_needed): reactive/reference — only when the situation
 *    arises (e.g. "Replace oven light bulb"). Framing these as routine habits
 *    misleads; they belong in their own group with honest copy.
 *
 * Each card is still tinted by care_type: amber for maintenance/mixed (real
 * consequence), teal for cleaning (good practice, lower urgency).
 */

import { BellRingIcon, SparklesIcon, WrenchIcon } from "lucide-react"
import { SectionCard } from "@/components/layout"
import type { TaskTemplateWithSchedule } from "@/modules/care"
import { cn } from "@/lib/utils"

interface HabitsSectionProps {
  tasks: TaskTemplateWithSchedule[]
}

function scheduleType(t: TaskTemplateWithSchedule): string {
  return t.schedule_rule?.[0]?.schedule_type ?? "as_needed"
}

function HabitCard({ task }: { task: TaskTemplateWithSchedule }) {
  const isCleaning = task.care_type === "cleaning"
  const Icon = isCleaning ? SparklesIcon : WrenchIcon
  return (
    <div
      className={cn(
        "flex gap-3 rounded-lg border px-3 py-2.5",
        isCleaning
          ? "border-teal-400/30 bg-teal-50/40 dark:bg-teal-950/15 dark:border-teal-700/30"
          : "border-amber-400/30 bg-amber-50/40 dark:bg-amber-950/15 dark:border-amber-700/30",
      )}
    >
      <Icon
        className={cn(
          "size-3.5 mt-0.5 shrink-0",
          isCleaning
            ? "text-teal-600 dark:text-teal-400"
            : "text-amber-600 dark:text-amber-400",
        )}
      />
      <div className="min-w-0">
        <p className="text-sm font-medium leading-snug">{task.title}</p>
        {task.justification && (
          <p className="text-xs text-muted-foreground mt-0.5 leading-snug line-clamp-2">
            {task.justification}
          </p>
        )}
      </div>
    </div>
  )
}

function HabitGroup({
  title,
  subtitle,
  tasks,
}: {
  title: string
  subtitle: string
  tasks: TaskTemplateWithSchedule[]
}) {
  if (tasks.length === 0) return null
  return (
    <div className="mb-4 last:mb-0">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">
        {title}
      </p>
      <p className="text-xs text-muted-foreground mb-2">{subtitle}</p>
      <div className="space-y-2">
        {tasks.map((task) => (
          <HabitCard key={task.task_template_id} task={task} />
        ))}
      </div>
    </div>
  )
}

export function HabitsSection({ tasks }: HabitsSectionProps) {
  if (tasks.length === 0) return null

  const habits = tasks.filter((t) => scheduleType(t) === "after_each_use")
  const whenNeeded = tasks.filter((t) => scheduleType(t) !== "after_each_use")

  return (
    <SectionCard>
      <div className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <BellRingIcon className="size-4 text-muted-foreground shrink-0" />
          <h3 className="text-sm font-semibold">Habits &amp; Reminders</h3>
        </div>

        <HabitGroup
          title="Habits"
          subtitle="Do these as part of regular use."
          tasks={habits}
        />
        <HabitGroup
          title="When needed"
          subtitle="Only when the situation calls for it — not on a schedule."
          tasks={whenNeeded}
        />
      </div>
    </SectionCard>
  )
}
