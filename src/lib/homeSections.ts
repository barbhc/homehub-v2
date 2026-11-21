/**
 * Home's sections below Next up (design/home-next.md, owner-approved 2026-11-21):
 * Heads up, Coming up, In a pinch, Pinned by you. Pure, so the rules are tested
 * without a screen.
 */
import type { CareNote, ServiceProvider } from "@/integrations/types"
import type { ExpiringWarrantyItem, HomeNotices, MaintenanceTaskFull } from "@/lib/dashboard"
import { splitNote } from "@/lib/notes"
import { timelyWarranty, fmtShortDate, WEEK_DAYS, type ComingUp } from "@/lib/homeWeek"
import { addDays } from "../../shared/dates/calendar"

// ── In a pinch ────────────────────────────────────────────────────────────────
// Only what someone needs in the first five minutes of a problem, when they're
// stressed and can't search: the three shutoffs, then the pros to call.

export type PinchKey = "water" | "gas" | "power"

export const PINCH_SPOTS: { key: PinchKey; label: string; idea: string; empty: string; match: RegExp }[] = [
  { key: "water", label: "Water shutoff", idea: "Water shutoff", empty: "Where the main valve is", match: /^(main )?water( main)? shut-?off$/i },
  { key: "gas", label: "Gas shutoff", idea: "Gas shutoff", empty: "Usually next to the gas meter", match: /^(main )?gas shut-?off$/i },
  { key: "power", label: "Breaker panel", idea: "Breaker panel", empty: "Where tripped circuits reset", match: /^(breaker|electrical) panel$|^breakers$/i },
]

export type PinchRow = { key: PinchKey; label: string; idea: string; empty: string; value: string | null }

/**
 * Each shutoff, filled from the house note whose heading names it. House-scope
 * notes only: a room's "Breaker" note is that room's breaker, not the panel.
 * Two notes with the same heading: the most recently updated wins.
 */
export function pinchSpots(notes: CareNote[]): PinchRow[] {
  const house = notes
    .filter((n) => n.scope === "home" && !n.deleted_at)
    .sort((a, b) => (b.updated_at || b.created_at).localeCompare(a.updated_at || a.created_at))
  return PINCH_SPOTS.map((s) => {
    const note = house.find((n) => {
      const h = splitNote(n.content, n.title).heading
      return !!h && s.match.test(h.trim())
    })
    let value: string | null = null
    if (note) {
      const body = splitNote(note.content, note.title).body.split("\n")[0]?.trim() ?? ""
      value = body ? (body.length > 80 ? `${body.slice(0, 79)}…` : body) : "Noted"
    }
    return { key: s.key, label: s.label, idea: s.idea, empty: s.empty, value }
  })
}

const PRO_KINDS: { label: string; match: RegExp }[] = [
  { label: "plumber", match: /plumb/i },
  { label: "electrician", match: /electric/i },
  { label: "heating", match: /hvac|heat/i },
]

/** The saved pros for water, power and heat, named; and which of the three are missing. */
export function prosSummary(providers: ServiceProvider[]): { names: string[]; missing: string[] } {
  const live = providers.filter((p) => !p.deleted_at)
  const names: string[] = []
  const missing: string[] = []
  for (const k of PRO_KINDS) {
    const p = live.find((x) => k.match.test(x.category))
    if (p) { if (!names.includes(p.name)) names.push(p.name) } else missing.push(k.label)
  }
  return { names, missing }
}

// ── Heads up ──────────────────────────────────────────────────────────────────
// A decision waiting, or a date coming. Something already past with nothing to
// do (a warranty that ended in April) is not news and is not shown.

export type HeadsUpRow =
  | { kind: "recall"; key: string; title: string; sub: string; itemId: string }
  | { kind: "review"; key: string; title: string; sub: string; itemId: string; manualId: string }
  | { kind: "warranty"; key: string; title: string; sub: string; itemId: string }

export function headsUpRows(input: {
  recalls: HomeNotices["recalls"]
  ready: { manualId: string; itemUnitId: string; title: string }[]
  warranties: ExpiringWarrantyItem[]
}): HeadsUpRow[] {
  const rows: HeadsUpRow[] = []
  for (const r of input.recalls) {
    rows.push({ kind: "recall", key: `recall:${r.item_unit_id}`, title: `Safety notice for ${r.display_name}`, sub: r.recall_notes?.trim() || "Check whether your model is affected", itemId: r.item_unit_id })
  }
  for (const e of input.ready) {
    rows.push({ kind: "review", key: `review:${e.manualId}`, title: "Manual ready to review", sub: e.title, itemId: e.itemUnitId, manualId: e.manualId })
  }
  const w = timelyWarranty(input.warranties)
  if (w) {
    const days = w.days_remaining
    rows.push({
      kind: "warranty", key: `warranty:${w.item_unit_id}`,
      title: `${w.display_name} warranty ends ${fmtShortDate(w.warranty_expiry_date)}`,
      sub: days === 0 ? "Today" : days === 1 ? "Tomorrow" : `In ${days} days`,
      itemId: w.item_unit_id,
    })
  }
  return rows
}

// ── Coming up ─────────────────────────────────────────────────────────────────

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]

export type ComingRow = { id: string; title: string; item: string; month: string; day: string | null; href: string }

/**
 * Up to three tasks after this week, soonest first. The tile shows the month;
 * the day only for a real deadline. A window has no day, and printing one
 * would invent a promise the task never made (design/due-windows.md).
 */
export function comingUpRows(
  upcoming: MaintenanceTaskFull[], today: string, limit = 3, forecast: ComingUp | null = null,
  /** This week's tasks (Next up and "N more"): never repeated under Coming up. */
  thisWeek: { id: string; title: string; itemName: string | null }[] = [],
): ComingRow[] {
  const weekEnd = addDays(today, WEEK_DAYS)
  const sameTask = (t: MaintenanceTaskFull) => thisWeek.some((w) => w.id === t.id || (w.title === t.title && (w.itemName ?? null) === (t.itemName ?? null)))
  const rows: ComingRow[] = upcoming
    .filter((t) => !!t.next_due_date && t.next_due_date > weekEnd && !sameTask(t))
    .sort((a, b) => (a.next_due_date! < b.next_due_date! ? -1 : a.next_due_date! > b.next_due_date! ? 1 : 0))
    .slice(0, limit)
    .map((t) => ({
      id: t.id,
      title: t.title,
      item: t.itemName ?? "Whole home",
      month: MONTHS[Number(t.next_due_date!.slice(5, 7)) - 1] ?? "",
      day: t.dueKind === "deadline" ? String(Number(t.next_due_date!.slice(8, 10))) : null,
      href: `/tasks/${t.id}`,
    }))
  if (rows.length > 0 || !forecast) return rows
  // A new home has nothing on the calendar after this week yet, only each
  // task's next round (stats.comingUp, the old one-line "Coming up in May").
  // Show that forecast so the first day still looks ahead. Month only.
  return forecast.titles.slice(0, limit).map((title) => ({
    id: `forecast:${title}`,
    title,
    item: forecast.again ? "Its next round" : "Whole home",
    month: MONTHS[Number(forecast.date.slice(5, 7)) - 1] ?? "",
    day: null,
    href: "/maintenance",
  }))
}

// ── Pinned by you ─────────────────────────────────────────────────────────────

/** Notes the household pinned to Home, most recently pinned first. */
export function pinnedNotes(notes: CareNote[]): CareNote[] {
  return notes
    .filter((n) => !!n.pinned_at && !n.deleted_at)
    .sort((a, b) => (b.pinned_at ?? "").localeCompare(a.pinned_at ?? ""))
}
