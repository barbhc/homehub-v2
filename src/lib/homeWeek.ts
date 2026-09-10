/**
 * Home · "This week" — the one list Home shows (design/home-focus.md).
 *
 * Owner, 2026-09-08: Home answers one question — what needs me this week? —
 * with one list, the first task open. The stat band, the swipe face, the
 * Coming-up drawer and the 7-day strip all drew from the same feeds and
 * showed the same tasks four times; this module is the single derivation
 * they are replaced with, pure and tested.
 */
import type { DashboardTask, ExpiringWarrantyItem, MaintenanceTaskFull } from "@/lib/dashboard"
import { urgentTasks } from "@/lib/homeHero"
import { classifyActorFromText } from "@/lib/taskActor"
import type { TemplateSupply } from "@/integrations/types"

export interface HomeWeekRow {
  /** Task INSTANCE id — what Mark done, Snooze and /tasks/:id take. */
  id: string
  title: string
  itemName: string | null
  itemId: string | null
  dueDate: string | null
  /** "Been a while" · "Good to do now" · "In Sep" · "By Sep 30" */
  duePhrase: string
  /** Only a real deadline, actually past. Clay. */
  trulyOverdue: boolean
  /** Lapsed safety work carries a firm, dateless note; null otherwise. */
  safetyNote: string | null
  /** Essential (priority "critical") earns the one pill the row shows. */
  essential: boolean
}

export const WEEK_DAYS = 7
export const WEEK_LIMIT = 5
export const WARRANTY_TIMELY_DAYS = 60

export function isoDaysFrom(today: string, days: number): string {
  const d = new Date(`${today}T12:00:00`)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

const fromUrgent = (t: DashboardTask): HomeWeekRow => ({
  id: t.id, title: t.name, itemName: t.itemName, itemId: t.itemId, dueDate: t.dueDate,
  duePhrase: t.duePhrase, trulyOverdue: t.trulyOverdue, safetyNote: t.safetyNote, essential: t.priority === "critical",
})
const fromUpcoming = (t: MaintenanceTaskFull): HomeWeekRow => ({
  id: t.id, title: t.title, itemName: t.itemName, itemId: t.item_id, dueDate: t.next_due_date,
  duePhrase: t.duePhrase ?? "", trulyOverdue: false, safetyNote: t.safetyNote ?? null, essential: t.priority === "critical",
})

/**
 * The week's rows, lead first: the urgent feed in its hero order (overdue and
 * due today), then the forward schedule inside the next 7 days by date.
 * Every instance appears once; capped so Home stays one screen.
 */
export function weekRows(tasks: DashboardTask[], upcoming: MaintenanceTaskFull[], today: string, limit = WEEK_LIMIT): HomeWeekRow[] {
  const end = isoDaysFrom(today, WEEK_DAYS)
  const rows: HomeWeekRow[] = urgentTasks(tasks).map(fromUrgent)
  const seen = new Set(rows.map((r) => r.id))
  const ahead = upcoming
    .filter((t) => t.next_due_date && t.next_due_date <= end && !seen.has(t.id))
    .sort((a, b) => (a.next_due_date! < b.next_due_date! ? -1 : a.next_due_date! > b.next_due_date! ? 1 : 0))
  for (const t of ahead) {
    if (seen.has(t.id)) continue
    seen.add(t.id)
    rows.push(fromUpcoming(t))
  }
  return rows.slice(0, limit)
}

/** The quiet week: the next few ahead of the window, so Home still points somewhere. */
export function nextUpRows(upcoming: MaintenanceTaskFull[], today: string, limit = 2): HomeWeekRow[] {
  const end = isoDaysFrom(today, WEEK_DAYS)
  return upcoming
    .filter((t) => t.next_due_date && t.next_due_date > end)
    .sort((a, b) => (a.next_due_date! < b.next_due_date! ? -1 : 1))
    .slice(0, limit)
    .map(fromUpcoming)
}

/**
 * ONE line of prep, or none (owner, 2026-09-08: a reminder, not a store —
 * no counts, no Buy or Book). Supplies win over the technician line: a task
 * that needs a part and a pro is rare, and the part is the thing to have
 * before the visit.
 */
export function prepLine(detail: { title: string; justification?: string | null; notes?: string | null; supplies: TemplateSupply[] } | null): string | null {
  if (!detail) return null
  const names = detail.supplies.map((s) => (s.name ?? "").trim()).filter(Boolean)
  if (names.length === 1) return `You'll need ${withArticle(names[0])}.`
  if (names.length > 1) return `You'll need ${withArticle(names[0])} and ${names.length - 1} more.`
  const actor = classifyActorFromText(`${detail.title} ${detail.justification ?? ""} ${detail.notes ?? ""}`)
  if (actor === "pro" || actor === "hazardous") return "Schedule a visit with a technician."
  return null
}

function withArticle(name: string): string {
  if (/^(a|an|the|some|your)\s/i.test(name)) return name
  // Plurals and quantities read fine bare: "You'll need Affresh tablets."
  if (/s$/i.test(name) || /^\d/.test(name)) return name
  return `${/^[aeiou]/i.test(name) ? "an" : "a"} ${name}`
}

/** The one timely line under the list: a warranty ending inside 60 days, soonest first. */
export function timelyWarranty(warranties: ExpiringWarrantyItem[], days = WARRANTY_TIMELY_DAYS): ExpiringWarrantyItem | null {
  const soon = warranties.filter((w) => w.days_remaining >= 0 && w.days_remaining <= days)
  if (soon.length === 0) return null
  return soon.reduce((a, b) => (b.days_remaining < a.days_remaining ? b : a))
}

/** "Sep 14" — the quiet card's date, words not blocks. */
export function fmtShortDate(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00`)
  if (Number.isNaN(d.getTime())) return dateStr
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}
