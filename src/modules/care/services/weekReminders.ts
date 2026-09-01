import { getWeekAgenda, type WeekAgendaItem } from "./weekAgenda"
import { getTaskTemplates, type ServiceResult } from "./taskService"
import { notifiesInMode, type PushMode } from "../../../../shared/notifications/preferences.js"
import type { TemplateSupply } from "@/integrations/types"

/**
 * The week, through the notification lens.
 *
 * `remindEnabled` lives on the TEMPLATE and is deliberately not denormalized
 * onto instances (commitDraft's stated decision), so the agenda alone cannot
 * say what will notify. This module is the one place that joins the two — the
 * Home "This week" section, /week, the Buy-first strip, and (via the same
 * `notifiesInMode` predicate in shared/) the push lanes all answer "does this
 * remind you?" identically. Screen equals push, in every mode.
 */

export type WeekReminder = WeekAgendaItem & {
  /** The template's raw flag — null means "never chose", tier default applies. */
  remindEnabled: boolean | null
  supplies: TemplateSupply[]
}

export type WeekRemindersResult = {
  items: WeekReminder[]
  /** Rows the mode filtered out — the honest count behind "N more in Tasks". */
  hiddenCount: number
}

export async function getWeekReminders(
  homeId: string,
  mode: PushMode,
  opts?: { days?: number }
): Promise<ServiceResult<WeekRemindersResult>> {
  // Both reads must succeed. A failed template fetch degrading to "no rows"
  // would render a false "nothing this week" — the silent-fallback failure
  // the error-handling standard forbids. Errors propagate, never emptiness.
  const [agenda, templates] = await Promise.all([
    getWeekAgenda(homeId, { days: opts?.days }),
    getTaskTemplates(homeId),
  ])
  if (agenda.error || !agenda.data) return { data: null, error: agenda.error ?? { message: "Could not load the week" } }
  if (templates.error || !templates.data)
    return { data: null, error: templates.error ?? { message: "Could not load your tasks" } }

  const byId = new Map(templates.data.map((t) => [t.task_template_id, t]))
  const joined: WeekReminder[] = agenda.data.map((row) => {
    const tpl = byId.get(row.taskTemplateId)
    return {
      ...row,
      // A missing template (mid-write, or filtered as inactive) must not sink
      // the row — it survives with the tier default deciding its fate.
      remindEnabled: tpl ? (tpl.remind_enabled ?? null) : null,
      supplies: tpl?.supplies ?? [],
    }
  })

  const items = joined.filter((r) => notifiesInMode(mode, r.remindEnabled, r.priorityTier))
  return { data: { items, hiddenCount: joined.length - items.length }, error: null }
}
