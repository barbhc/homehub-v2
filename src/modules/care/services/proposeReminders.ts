import { callable } from "@/integrations/firebase"
import type { ScheduleType } from "@/integrations/types"

/**
 * Client contract for the `proposeReminders` callable (Phase 4).
 *
 * The callable performs ZERO writes by construction — it reads the home's
 * existing task templates, asks the model which ones match what the user
 * said they care about, validates every id against the fetched set, and
 * returns a shortlist. "Turn these on" is applied client-side through the
 * existing writers (setTaskReminder / setTaskCadence), so the remindEnabled
 * writer census stays where it was audited.
 */
export type ProposeRemindersRequest = { homeId: string; focusText: string }

export type ProposedReminder = {
  task_template_id: string
  title: string
  item_name: string | null
  /** One calm sentence — why this matched what the user said. */
  reason: string
  current_schedule_type: ScheduleType | null
  current_interval_days: number | null
  suggested_schedule_type: ScheduleType | null
  suggested_interval_days: number | null
  remind_already_on: boolean
  priority_tier: string
}

export type ProposeRemindersResponse = {
  ok: true
  total_templates: number
  proposals: ProposedReminder[]
}

export const proposeReminders = callable<ProposeRemindersRequest, ProposeRemindersResponse>("proposeReminders")
