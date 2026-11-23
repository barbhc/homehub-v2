import { useMemo } from "react"
import { Link } from "react-router-dom"
import {
  ChevronRightIcon, ShieldCheckIcon, ShieldAlertIcon,
  WindIcon, RefrigeratorIcon, FlameIcon, WashingMachineIcon, UtensilsIcon, PackageIcon, type LucideIcon,
} from "lucide-react"
import type { ItemUnit } from "@/integrations/types"
import { warrantyExpiry } from "@/lib/warrantyWindow"
import { diffDays, localToday } from "../../shared/dates/calendar"

// Per-item glyph (mirrors RefinedItemDetail) — warranties show the item's own
// icon, not a uniform shield.
const GLYPH_KW: [RegExp, LucideIcon][] = [
  [/fridge|refriger/i, RefrigeratorIcon],
  [/hvac|furnace|a\/c|air|heat pump/i, WindIcon],
  [/water heater|boiler|flame|gas/i, FlameIcon],
  [/wash|dryer|laundry/i, WashingMachineIcon],
  [/dishwash|oven|range|cook|stove/i, UtensilsIcon],
]
function glyphFor(name: string, category: string | null): LucideIcon {
  const hay = `${name} ${category ?? ""}`
  for (const [re, icon] of GLYPH_KW) if (re.test(hay)) return icon
  return PackageIcon
}
// ── Tokens (redesign palette) ───────────────────────────────────────────────
const INK = "var(--hh-ink)"
const SUB = "var(--hh-sub)"
const TEAL = "var(--hh-teal)"
const GOLD = "var(--hh-gold)"
const GOLD_SOFT = "var(--hh-gold-soft)"
const GOLD_BORDER = "var(--hh-gold-line)"
const NEUTRAL = "var(--hh-neutral)"

// Calm status tones — amber/gold for "worth a look", never alarmist red.
// Lapsed uses muted slate, never red.
type WStatus = "soon" | "active" | "expired"

const TONE: Record<WStatus, { fg: string; soft: string; border: string; label: string }> = {
  soon: { fg: GOLD, soft: GOLD_SOFT, border: GOLD_BORDER, label: "Expiring soon" },
  active: { fg: TEAL, soft: "var(--hh-teal-wash)", border: "var(--hh-teal-line)", label: "Active" },
  expired: { fg: NEUTRAL, soft: "var(--hh-neutral-soft)", border: "var(--hh-neutral-line)", label: "Lapsed" },
}

// Anything expiring within this window is surfaced as "worth a look".
const SOON_DAYS = 90

interface WarrantyRow {
  id: string
  name: string
  brand: string | null
  room: string | null
  coverage: string | null
  expiry: string
  daysRemaining: number
  status: WStatus
  icon: LucideIcon
}

/** Calendar days from the device's today to `dateStr` (negative once past). */
function daysUntil(dateStr: string): number {
  return diffDays(localToday(), dateStr)
}

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number)
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

/**
 * Builds warranty rows from real item_unit data. An item appears here when it
 * has either an explicit warranty_expiry_date or a warranty_coverage note.
 * Status is derived from the expiry date; items with coverage text but no date
 * are treated as Active (open-ended coverage).
 */
function toWarrantyRows(items: ItemUnit[], roomMap: Map<string, string>): WarrantyRow[] {
  return items
    .filter((it) => it.warranty_expiry_date || it.warranty_coverage || it.warranty_duration_months)
    .map((it) => {
      // Prefer an explicit end date; otherwise derive one from purchase + duration
      // so we can show when coverage ends instead of a vague "Ongoing".
      const expiry =
        it.warranty_expiry_date ??
        (it.purchase_date && it.warranty_duration_months
          ? warrantyExpiry(it.purchase_date, it.warranty_duration_months)
          : null)
      const daysRemaining = expiry ? daysUntil(expiry) : Number.POSITIVE_INFINITY
      let status: WStatus = "active"
      if (expiry) {
        if (daysRemaining < 0) status = "expired"
        else if (daysRemaining <= SOON_DAYS) status = "soon"
      }
      return {
        id: it.item_unit_id,
        name: it.display_name,
        brand: it.brand ?? null,
        room: it.room_id ? roomMap.get(it.room_id) ?? null : null,
        coverage: it.warranty_coverage ?? null,
        expiry: expiry ?? "",
        daysRemaining,
        status,
        icon: glyphFor(it.display_name, it.category),
      }
    })
    .sort((a, b) => {
      // Soonest expiry first; coverage-only (no date) rows sort last.
      if (a.expiry && b.expiry) return a.expiry.localeCompare(b.expiry)
      if (a.expiry) return -1
      if (b.expiry) return 1
      return a.name.localeCompare(b.name)
    })
}

function StatCard({ n, label, color }: { n: number; label: string; color: string }) {
  return (
    <div className="flex-1 rounded-2xl bg-[var(--hh-surface)] p-4 text-center shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
      <div className="text-[1.625rem] font-extrabold tracking-[-0.5px]" style={{ color }}>{n}</div>
      <div className="mt-0.5 text-[0.8125rem]" style={{ color: SUB }}>{label}</div>
    </div>
  )
}

function WarrantyListRow({ row, last }: { row: WarrantyRow; last: boolean }) {
  const tone = TONE[row.status]
  const Icon = row.icon
  // Status hint + the actual coverage end date — that's the point of the page.
  const status =
    row.status === "expired"
      ? row.expiry ? `Lapsed · ${formatDate(row.expiry)}` : "Lapsed"
      : row.expiry
        ? `Covered · ${formatDate(row.expiry)}`
        : "Covered"
  const subtitle = [row.brand, row.room].filter(Boolean).join(" · ")
  // The name gets its own line and wraps (owner, 2026-11-21: a status beside it
  // truncated "Bosch 800 Series Dishwasher" to "Bosch 800…"); the status sits
  // under it.
  return (
    <Link
      to={`/inventory/${row.id}`}
      className="flex min-h-11 w-full items-center gap-3 bg-[var(--hh-surface)] px-4 py-3.5"
      style={{ borderTop: last ? "none" : "0.5px solid var(--hh-line)" }}
    >
      <span
        className="flex size-10 shrink-0 items-center justify-center rounded-[11px]"
        style={{ background: tone.soft, color: tone.fg }}
      >
        <Icon className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[0.9375rem] font-bold tracking-[-0.2px] [overflow-wrap:anywhere]" style={{ color: INK }}>{row.name}</div>
        <div className="mt-px text-[0.8125rem] font-bold" style={{ color: tone.fg }}>{status}</div>
        {subtitle && <div className="mt-px truncate text-[0.78125rem]" style={{ color: SUB }}>{subtitle}</div>}
      </div>
      <ChevronRightIcon className="size-4 shrink-0" style={{ color: "var(--hh-icon-faint)" }} />
    </Link>
  )
}

function Group({ title, rows }: { title: string; rows: WarrantyRow[] }) {
  if (rows.length === 0) return null
  return (
    <div>
      <div className="mb-2.5 pl-0.5 text-xs font-bold uppercase tracking-[0.6px]" style={{ color: SUB }}>
        {title} · {rows.length}
      </div>
      <div className="overflow-hidden rounded-2xl bg-[var(--hh-surface)] shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
        {rows.map((row, i) => (
          <WarrantyListRow key={row.id} row={row} last={i === 0} />
        ))}
      </div>
    </div>
  )
}

/**
 * Items → Warranties (`/inventory?view=warranties`) — what was the Warranties
 * page (`/warranties`, which now redirects here; design/tasks-items-views.md).
 *
 * It no longer reads anything or titles itself: the Items page has already
 * read the home's items and rooms (useHomeItems — cached, timed out, and with
 * its own loading and failure states), and its header carries the title and
 * the Items | Warranties control. Rendered once, below both trees' headers.
 */
export function WarrantiesView({ items, rooms }: { items: ItemUnit[]; rooms: { room_id: string; name: string }[] }) {
  const roomMap = useMemo(() => new Map(rooms.map((r) => [r.room_id, r.name])), [rooms])
  const rows = useMemo(() => toWarrantyRows(items, roomMap), [items, roomMap])
  const soon = rows.filter((r) => r.status === "soon")
  const active = rows.filter((r) => r.status === "active")
  const lapsed = rows.filter((r) => r.status === "expired")

  return (
  <div>
    {rows.length === 0 && (
      <div className="rounded-2xl bg-[var(--hh-surface)] px-6 py-10 text-center shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
        <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-[15px]" style={{ background: GOLD_SOFT }}>
          <ShieldCheckIcon className="size-7" style={{ color: GOLD }} />
        </div>
        <div className="text-[0.9375rem] font-bold" style={{ color: INK }}>No warranties on file yet</div>
        <p className="mx-auto mt-1.5 max-w-[280px] text-[0.875rem] leading-snug" style={{ color: SUB }}>
          Add a warranty date or coverage note to an item and it'll show up here so you know what's still protected.
        </p>
        <Link
          to="/inventory"
          className="mt-4 inline-flex rounded-xl px-4 py-2.5 text-[0.875rem] font-bold text-white"
          style={{ background: "var(--hh-teal-fill)" }}
        >
          Go to items
        </Link>
      </div>
    )}

    {rows.length > 0 && (
      <div className="flex flex-col gap-6">
        {/* Summary */}
        <div className="flex gap-3">
          <StatCard n={active.length} label="active" color={TEAL} />
          <StatCard n={soon.length} label="expiring" color={GOLD} />
          <StatCard n={lapsed.length} label="lapsed" color={NEUTRAL} />
        </div>

        {/* Expiring soon — gentle gold highlight */}
        {soon.length > 0 && (
          <div>
            <div className="mb-2.5 pl-0.5 text-xs font-bold uppercase tracking-[0.6px]" style={{ color: GOLD }}>
              Worth a look
            </div>
            <div className="flex flex-col gap-3">
              {soon.map((row) => (
                <Link
                  key={row.id}
                  to={`/inventory/${row.id}`}
                  className="flex w-full items-center gap-3.5 rounded-2xl border p-4"
                  style={{ background: GOLD_SOFT, borderColor: GOLD_BORDER }}
                >
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-[13px] bg-[var(--hh-surface)]" style={{ color: GOLD }}>
                    <ShieldAlertIcon className="size-[22px]" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="inline-flex items-center gap-1.5 text-[0.6875rem] font-bold uppercase tracking-[0.4px]" style={{ color: GOLD }}>
                      Expires in {row.daysRemaining} day{row.daysRemaining === 1 ? "" : "s"}
                    </div>
                    <div className="my-0.5 text-[1.1875rem] font-extrabold tracking-[-0.3px] [overflow-wrap:anywhere]" style={{ color: INK }}>{row.name}</div>
                    <div className="truncate text-[0.8125rem]" style={{ color: "var(--hh-gold-sub)" }}>
                      Coverage ends {formatDate(row.expiry)}{[row.brand, row.room].filter(Boolean).length ? ` · ${[row.brand, row.room].filter(Boolean).join(" · ")}` : ""}
                    </div>
                  </div>
                  <ChevronRightIcon className="size-5 shrink-0" style={{ color: GOLD }} />
                </Link>
              ))}
            </div>
          </div>
        )}

        <Group title="Active" rows={active} />
        <Group title="Lapsed" rows={lapsed} />

        {lapsed.length > 0 && (
          <p className="mx-2 text-center text-[0.8125rem] leading-relaxed" style={{ color: SUB }}>
            Renewed or bought a protection plan? Open the item to update its coverage.
          </p>
        )}
      </div>
    )}
  </div>
  )
}
