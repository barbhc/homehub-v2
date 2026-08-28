/**
 * Should we ask for notification permission, and is it worth asking yet?
 *
 * Round 18. The permission ask lived on Home as a soft nudge card
 * (PushOptInNudge), which is a fine acquisition surface and a poor teaching
 * one: it appears when someone happens to look at Home, describing a benefit in
 * the abstract. iOS shows its permission dialog EXACTLY ONCE per install — a
 * "no" there is permanent until the user finds it in Settings — so an abstract
 * ask spends the only chance the app gets.
 *
 * The moment it is not abstract is the moment someone saves tasks that want to
 * reach them. Then it can be asked with the specific tasks named, which is the
 * difference between a considered yes and a reflexive dismissal.
 *
 * This module is only the DECISION. It deliberately does no asking and no
 * subscribing: those already exist, on both the web and native paths, and
 * duplicating them is how two code paths drift apart.
 */
import type { PreviewTask } from "@/modules/knowledge/types/previewTypes"
import { willNotify } from "../../shared/tasks/reviewBuckets"

/** Tasks in this save that are set to notify. The ones worth naming in the ask. */
export function tasksWantingNotification(tasks: PreviewTask[]): PreviewTask[] {
  return tasks.filter((t) =>
    willNotify({
      care_type: t.care_type,
      priority_tier: t.priority_tier,
      schedule_type: t.schedule_type,
      // Left unset on purpose. `keep_as_task` is the user's override, and a
      // PreviewTask does not carry one — the review maps its own row kind at the
      // save boundary. Absent means the strict rule applies, which is the same
      // default `reviewBucketFor` uses.
      risk_level: t.risk_level,
      remind_enabled: (t as { remind_enabled?: boolean | null }).remind_enabled ?? null,
    }),
  )
}

/**
 * Ask only when all three are true:
 *
 *  - something in this save actually wants to notify. Her Sharp saves eleven
 *    tasks and none of them do; a permission prompt there is a prompt about
 *    nothing.
 *  - the platform can deliver one at all.
 *  - we have not already been answered. `"denied"` is deliberately NOT a reason
 *    to ask again — the OS will not re-prompt, so a sheet promising to turn
 *    notifications on would be a button that cannot work.
 */
export function shouldAskForNotifications(args: {
  wanting: number
  supported: boolean
  permission: NotificationPermission | "unsupported"
  alreadySubscribed: boolean
}): boolean {
  const { wanting, supported, permission, alreadySubscribed } = args
  if (wanting < 1) return false
  if (!supported) return false
  if (alreadySubscribed) return false
  return permission === "default"
}

/**
 * What the screen must say when permission was refused: the tasks still saved
 * and still come back in Tasks — only the buzz is missing. Drawing a bell we
 * cannot ring would be the same class of lie as the copy this round removed.
 */
export function notificationsBlocked(args: {
  permission: NotificationPermission | "unsupported"
  alreadySubscribed: boolean
}): boolean {
  return !args.alreadySubscribed && (args.permission === "denied" || args.permission === "unsupported")
}
