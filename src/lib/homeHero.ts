import type { ItemUnit } from "@/integrations/types"
import type { MaintenanceTaskFull } from "@/lib/dashboard"

/**
 * Pure logic for the composed Home hero (design round 4, 2026-08-05).
 *
 * Kept out of the components so the parts that decide WHAT to say are testable
 * without rendering anything — the same split as reviewBuckets and taskLens.
 */

// ── Quick wins ───────────────────────────────────────────────────────────────
/**
 * A quick win is something optional, true right now, and finishable in minutes.
 * The face that shows these HIDES when none apply — the same rule as the
 * insight banner: if there is nothing true to say, say nothing.
 *
 * Two detectors at launch (photos, warranties). Both derive from the items list
 * alone, so the face costs one cheap query. "Stale review" needs a per-item
 * parse-age join and is deferred rather than faked.
 */
export interface QuickWin {
  key: string
  kicker: string
  title: string
  why: string
  cta: string
  /** Route the CTA navigates to. */
  to: string
}

export function detectWins(items: ItemUnit[]): QuickWin[] {
  const wins: QuickWin[] = []

  const noPhoto = items.filter((i) => !i.photo_storage_ref)
  if (noPhoto.length >= 3) {
    wins.push({
      key: "photos",
      kicker: "2-minute win",
      title: "Put faces on your items",
      why: `${noPhoto.length} of your ${items.length} items show a generic icon. A photo makes each one instantly findable.`,
      cta: "Add photos",
      to: "/inventory",
    })
  }

  // Warranty gaps only matter where a warranty plausibly exists — major
  // appliances. Nagging about a blender's coverage would be noise.
  const majorNoWarranty = items.filter(
    (i) => /major/i.test(i.category ?? "") && !i.warranty_expiry_date,
  )
  if (majorNoWarranty.length > 0) {
    const first = majorNoWarranty[0]
    wins.push({
      key: "warranty",
      kicker: "1-minute win",
      title: `Log the ${first.display_name}'s warranty`,
      why:
        majorNoWarranty.length === 1
          ? "The only major appliance with no coverage date. Thirty seconds now, one less mystery later."
          : `${majorNoWarranty.length} major appliances have no coverage date. Start with one.`,
      cta: "Add warranty",
      to: `/items/${first.item_unit_id}`,
    })
  }

  return wins
}

// ── Coming up ────────────────────────────────────────────────────────────────
export interface ComingUpRow {
  id: string
  title: string
  itemName: string | null
  /** Item this belongs to, so the row can open the page that explains it. */
  itemId: string | null
  /** "Fri, Aug 15" — words, per the round-3 note that killed the date blocks. */
  when: string
  dueDate: string
  overdueDays: number | null
  /** Window phrase from the caller ("Oct-ish"), preferred over `when` when the
   *  task has no real deadline. See design/due-windows.md. */
  duePhrase: string | null
  /** Days of silence before this row; a gap ≥ 14 days renders as a quiet line. */
  gapBefore: number
}

export const GAP_DAYS = 14

const dayMs = 86_400_000
function parseDay(s: string): Date {
  return new Date(s + "T12:00:00")
}
export function fmtWhen(dateStr: string): string {
  return parseDay(dateStr).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
}

/** Structural input so both MaintenanceTaskFull and a mapped DashboardTask fit. */
export interface ComingUpInput {
  id: string
  title: string
  itemName: string | null
  item_id?: string | null
  next_due_date: string | null
  isOverdue: boolean
  /** Derived window phrase, if the caller computed one. */
  duePhrase?: string | null
}

/**
 * Order the schedule, mark overdue rows, and measure the silences between
 * entries. `today` is injected so the maths is testable and timezone-honest.
 */
export function comingUp(tasks: ComingUpInput[], today: string, limit = 6): ComingUpRow[] {
  const dated = tasks
    .filter((t) => t.next_due_date != null)
    .sort((a, b) => (a.next_due_date! < b.next_due_date! ? -1 : 1))
    .slice(0, limit)

  const t0 = parseDay(today).getTime()
  let prev = t0
  return dated.map((t) => {
    const due = parseDay(t.next_due_date!).getTime()
    const overdue = t.isOverdue ? Math.max(1, Math.round((t0 - due) / dayMs)) : null
    const gap = Math.round((due - prev) / dayMs)
    prev = Math.max(prev, due)
    return {
      id: t.id,
      title: t.title,
      itemName: t.itemName,
      itemId: t.item_id ?? null,
      when: fmtWhen(t.next_due_date!),
      dueDate: t.next_due_date!,
      overdueDays: overdue,
      duePhrase: t.duePhrase ?? null,
      gapBefore: overdue ? 0 : Math.max(0, gap),
    }
  })
}

/** The drawer's one-line answer while closed. Never says "0 in August". */
export function drawerMeta(rows: ComingUpRow[], today: string): string {
  if (rows.length === 0) return "Nothing scheduled yet"
  // Rows carrying a window phrase are not "overdue" — only rows the caller
  // marked without one (real deadlines) still count that way.
  const overdue = rows.filter((r) => r.overdueDays != null && !r.duePhrase).length
  const month = parseDay(today).toLocaleDateString("en-US", { month: "long" })
  const monthN = parseDay(today).getMonth()
  const inMonth = rows.filter((r) => r.overdueDays == null && parseDay(r.dueDate).getMonth() === monthN).length
  const parts: string[] = []
  if (overdue > 0) parts.push(`${overdue} overdue`)
  if (inMonth > 0) parts.push(`${inMonth} in ${month}`)
  if (parts.length === 0) {
    const next = rows.find((r) => r.overdueDays == null)
    if (next) return `Next: ${next.when}`
    // Every row is past its target but none is a real deadline — the common
    // case once windows landed. "0 overdue" was literally false here; say what
    // is actually true.
    const waiting = rows.length
    return waiting > 0 ? `${waiting} waiting` : "Nothing scheduled yet"
  }
  if (overdue === 0) {
    const next = rows.find((r) => r.overdueDays == null)
    if (next) parts.push(`next ${next.when}`)
  }
  return parts.join(" · ")
}

// ── Stat band ────────────────────────────────────────────────────────────────
export function dueThisMonth(tasks: Pick<MaintenanceTaskFull, "next_due_date" | "isOverdue">[], today: string): number {
  const m = parseDay(today).getMonth(), y = parseDay(today).getFullYear()
  return tasks.filter((t) => {
    if (!t.next_due_date || t.isOverdue) return false
    const d = parseDay(t.next_due_date)
    return d.getMonth() === m && d.getFullYear() === y && d.getTime() >= parseDay(today).getTime()
  }).length
}
