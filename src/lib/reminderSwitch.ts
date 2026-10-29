import { taskNotifies, type PushMode } from "@/lib/notificationPreferences"

/**
 * What a task page's "Remind me when it's due" switch shows: whether this task
 * will remind you when it comes due under YOUR notification style, and the one
 * line under it.
 *
 * Decided by `taskNotifies` — the same function the morning push uses — so the
 * switch can't say On while the phone stays silent. It used to show the tier
 * default ("On by default for Essential") in every style, which in "Just my
 * list" was a promise nothing kept, and in "Everything on a schedule" hid a
 * reminder that was coming.
 *
 * Lapsed safety work is left out on purpose: the digest's weekly mention is not
 * a reminder "when it's due", and the switch only answers that.
 */
export function reminderSwitch(
  mode: PushMode,
  t: { remindEnabled: boolean | null | undefined; priorityTier: string | null | undefined; isDeadline: boolean },
): { on: boolean; line: string } {
  const on = taskNotifies(mode, t)
  if (t.remindEnabled === true) return { on, line: "You turned this on" }
  if (t.remindEnabled === false) return { on, line: "You turned this off" }
  if (on) {
    if (t.isDeadline) return { on, line: "On by default for deadlines — you can turn it off" }
    if (mode === "all") return { on, line: "On — Everything on a schedule includes it" }
    return { on, line: "On by default for Essential — you can turn it off" }
  }
  if (mode === "curated") return { on, line: "Off — Just my list reminds only what you turn on" }
  return { on, line: "Off by default — turn it on if you want one" }
}
