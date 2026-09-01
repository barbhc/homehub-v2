import useSWR from "swr"
import { getWeekReminders, listShoppingItems, type WeekReminder } from "@/modules/care"
import { usePushMode } from "@/hooks/usePushMode"
import type { ShoppingListItem } from "@/integrations/types"

export type WeekData = { all: WeekReminder[]; hiddenCount: number; shopping: ShoppingListItem[] }

/**
 * The week through the notification lens, for every surface that shows it
 * (Home "This week at home", /week). One key per home+mode, so the two
 * screens share a cache and can never disagree.
 *
 * Both reads must succeed: a week that quietly dropped its shopping rows would
 * show a false "buy first" (or hide a real one). Errors throw into SWR's error
 * path — the caller renders them, visibly.
 */
export function useWeekReminders(homeId: string | null, opts?: { days?: number }) {
  const { mode, prefs } = usePushMode()
  const days = opts?.days ?? 30
  const swr = useSWR<WeekData>(
    homeId ? `week:reminders:${homeId}:${mode}:${days}` : null,
    async () => {
      const [week, shopping] = await Promise.all([
        getWeekReminders(homeId!, mode, { days }),
        listShoppingItems(homeId!, { includeBought: true }),
      ])
      if (week.error || !week.data) throw new Error(week.error?.message ?? "Could not load your week")
      if (shopping.error || !shopping.data) throw new Error(shopping.error?.message ?? "Could not load your shopping list")
      return { all: week.data.items, hiddenCount: week.data.hiddenCount, shopping: shopping.data }
    },
    { revalidateOnFocus: false }
  )
  return { ...swr, mode, prefs }
}

export function isoDaysFromNow(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export function dayChip(dueDate: string, withinWeek: boolean): string {
  const d = new Date(`${dueDate}T00:00:00`)
  if (Number.isNaN(d.getTime())) return ""
  return withinWeek
    ? d.toLocaleDateString("en-US", { weekday: "short" })
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

/**
 * The right-hand chip for a week row. A weekday only makes sense for a date
 * still ahead; a lapsed task gets its calm window phrase ("Been a while"),
 * never a weekday from weeks ago dressed up as this week's.
 */
export function weekChip(t: { dueDate: string; duePhrase: string }): string {
  const today = new Date().toISOString().slice(0, 10)
  if (t.dueDate < today) return t.duePhrase
  return dayChip(t.dueDate, true) || t.duePhrase
}
