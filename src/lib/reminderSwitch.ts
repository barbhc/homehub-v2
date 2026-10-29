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
 * In "Just my list" only an explicit On reminds — a never-chose deadline or
 * lapsed safety check included (owner, 2026-10-28). The switch is shown on
 * deadlines too (one-off tasks), so that is where such a user opts one in.
 *
 * Lapsed safety work is passed in because the digest names it: a never-chose
 * lapsed safety check outside "Just my list" is ON, and the line says where
 * it shows up (the weekly summary — there is no day-of ping for a past date).
 */
export function reminderSwitch(
  mode: PushMode,
  t: {
    remindEnabled: boolean | null | undefined
    priorityTier: string | null | undefined
    isDeadline: boolean
    lapsedSafety?: boolean
  },
): { on: boolean; line: string } {
  const on = taskNotifies(mode, t)
  if (t.remindEnabled === true) return { on, line: "You turned this on" }
  if (t.remindEnabled === false) return { on, line: "You turned this off" }
  if (on) {
    if (t.isDeadline) return { on, line: "On by default for deadlines — you can turn it off" }
    if (t.lapsedSafety) return { on, line: "On — skipped safety checks go in your weekly summary" }
    if (mode === "all") return { on, line: "On — Everything on a schedule includes it" }
    return { on, line: "On by default for Essential — you can turn it off" }
  }
  if (mode === "curated") return { on, line: "Off — Just my list reminds only what you turn on" }
  return { on, line: "Off by default — turn it on if you want one" }
}
