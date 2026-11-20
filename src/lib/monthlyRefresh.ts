/**
 * When Home's "This month at your home" card is due (design/day-one-home.md,
 * release D). Pure, so the calendar rules are tested on their own.
 */
export const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

/**
 * Due when this month has not been answered for the home (Add or Not now) and
 * the home was not created this month — onboarding just showed this month's
 * list. A home with no recorded creation date counts as an older one.
 */
export function monthlyRefreshDue(args: { today: string; createdAt: string | null; answeredMonth: string | null }): boolean {
  const month = args.today.slice(0, 7)
  if (args.answeredMonth === month) return false
  const created = args.createdAt ? args.createdAt.slice(0, 7) : null
  return created !== month
}
