import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import {
  ChevronRightIcon, ShieldCheckIcon, ShieldAlertIcon,
  WindIcon, RefrigeratorIcon, FlameIcon, WashingMachineIcon, UtensilsIcon, PackageIcon, type LucideIcon,
} from "lucide-react"
import { useCurrentHome, getRooms } from "@/modules/home"
import { getItemUnits } from "@/modules/items"
import type { ItemUnit } from "@/integrations/types"

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
/** YYYY-MM-DD `months` after a date — used to derive an end date from duration. */
function addMonths(dateStr: string, months: number): string {
  const [y, m, d] = dateStr.split("-").map(Number)
  return new Date(y, m - 1 + months, d).toISOString().slice(0, 10)
}

// ── Tokens (redesign palette) ───────────────────────────────────────────────
const INK = "var(--hh-ink)"
const SUB = "var(--hh-sub)"
const TEAL = "var(--hh-teal)"
const GOLD = "var(--hh-gold)"
const GOLD_SOFT = "var(--hh-gold-soft)"
const GOLD_BORDER = "#EFE0C2"

// Calm status tones — amber/gold for "worth a look", never alarmist red.
// Lapsed uses muted slate, never red.
type WStatus = "soon" | "active" | "expired"

const TONE: Record<WStatus, { fg: string; soft: string; border: string; label: string }> = {
  soon: { fg: GOLD, soft: GOLD_SOFT, border: GOLD_BORDER, label: "Expiring soon" },
  active: { fg: TEAL, soft: "var(--hh-teal-wash)", border: "#D4E7E0", label: "Active" },
  expired: { fg: "#7A8690", soft: "#F1F4F6", border: "#E4E9ED", label: "Lapsed" },
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

function daysUntil(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number)
  return Math.ceil((new Date(y, m - 1, d).getTime() - Date.now()) / 86_400_000)
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
          ? addMonths(it.purchase_date, it.warranty_duration_months)
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
      <div className="text-[26px] font-extrabold tracking-[-0.5px]" style={{ color }}>{n}</div>
      <div className="mt-0.5 text-[13px]" style={{ color: SUB }}>{label}</div>
    </div>
  )
}

function WarrantyListRow({ row, last }: { row: WarrantyRow; last: boolean }) {
  const tone = TONE[row.status]
  const Icon = row.icon
  // Status hint + the actual coverage end date — that's the point of the page.
  const right =
    row.status === "expired"
      ? row.expiry ? `Lapsed · ${formatDate(row.expiry)}` : "Lapsed"
      : row.expiry
        ? `Covered · ${formatDate(row.expiry)}`
        : "Covered"
  const subtitle = [row.brand, row.room].filter(Boolean).join(" · ") || "Warranty on file"
  return (
    <Link
      to={`/inventory/${row.id}`}
      className="flex w-full items-center gap-3 bg-[var(--hh-surface)] px-4 py-3.5"
      style={{ borderTop: last ? "none" : "0.5px solid var(--hh-line)" }}
    >
      <span
        className="flex size-10 shrink-0 items-center justify-center rounded-[11px]"
        style={{ background: tone.soft, color: tone.fg }}
      >
        <Icon className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-bold tracking-[-0.2px]" style={{ color: INK }}>{row.name}</div>
        <div className="mt-px truncate text-[12.5px]" style={{ color: SUB }}>{subtitle}</div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <span className="whitespace-nowrap text-[13px] font-bold" style={{ color: tone.fg }}>{right}</span>
        <ChevronRightIcon className="size-4" style={{ color: "#C2CBD4" }} />
      </div>
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

export default function WarrantiesPage() {
  const { home } = useCurrentHome()
  const [items, setItems] = useState<ItemUnit[] | null>(null)
  const [rooms, setRooms] = useState<{ room_id: string; name: string }[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!home) return
    let cancelled = false
    setItems(null)
    setError(null)
    getItemUnits(home.home_id).then((res) => {
      if (cancelled) return
      if (res.error) setError(res.error.message)
      else setItems(res.data)
    })
    getRooms(home.home_id).then((r) => { if (!cancelled) setRooms(r.data ?? []) })
    return () => {
      cancelled = true
    }
  }, [home?.home_id])

  const roomMap = useMemo(() => new Map(rooms.map((r) => [r.room_id, r.name])), [rooms])
  const rows = useMemo(() => (items ? toWarrantyRows(items, roomMap) : []), [items, roomMap])
  const soon = rows.filter((r) => r.status === "soon")
  const active = rows.filter((r) => r.status === "active")
  const lapsed = rows.filter((r) => r.status === "expired")

  if (!home) return null

  const loading = items === null && !error

  return (
    <div className="min-h-full" style={{ background: "var(--hh-bg)" }}>
      <div className="mx-auto max-w-3xl px-5 pb-12 pt-6 md:px-6 md:pt-10">
        {/* Header */}
        <header>
          <h1 className="text-[33px] font-extrabold tracking-[-0.7px]" style={{ color: INK }}>Warranties</h1>
          <p className="mt-1 text-[14px]" style={{ color: SUB }}>Coverage across your home, at a glance.</p>
        </header>

        {loading && (
          <div className="mt-6 space-y-3">
            <div className="flex gap-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-[78px] flex-1 animate-pulse rounded-2xl bg-[var(--hh-surface)]/70" />
              ))}
            </div>
            <div className="h-40 animate-pulse rounded-2xl bg-[var(--hh-surface)]/70" />
          </div>
        )}

        {error && (
          <div className="mt-6 rounded-2xl border p-5" style={{ background: "var(--hh-surface)", borderColor: GOLD_BORDER }}>
            <p className="text-[14px]" style={{ color: INK }}>We couldn't load your warranties just now.</p>
            <p className="mt-1 text-[13px]" style={{ color: SUB }}>{error}</p>
          </div>
        )}

        {!loading && !error && rows.length === 0 && (
          <div className="mt-6 rounded-2xl bg-[var(--hh-surface)] px-6 py-10 text-center shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
            <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-[15px]" style={{ background: GOLD_SOFT }}>
              <ShieldCheckIcon className="size-7" style={{ color: GOLD }} />
            </div>
            <div className="text-[15px] font-bold" style={{ color: INK }}>No warranties on file yet</div>
            <p className="mx-auto mt-1.5 max-w-[280px] text-[14px] leading-snug" style={{ color: SUB }}>
              Add a warranty date or coverage note to an item and it'll show up here so you know what's still protected.
            </p>
            <Link
              to="/inventory"
              className="mt-4 inline-flex rounded-xl px-4 py-2.5 text-[14px] font-bold text-white"
              style={{ background: TEAL }}
            >
              Go to items
            </Link>
          </div>
        )}

        {!loading && !error && rows.length > 0 && (
          <div className="mt-6 flex flex-col gap-6">
            {/* Summary */}
            <div className="flex gap-3">
              <StatCard n={active.length} label="active" color={TEAL} />
              <StatCard n={soon.length} label="expiring" color={GOLD} />
              <StatCard n={lapsed.length} label="lapsed" color="#7A8690" />
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
                        <div className="inline-flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.4px]" style={{ color: GOLD }}>
                          Expires in {row.daysRemaining} day{row.daysRemaining === 1 ? "" : "s"}
                        </div>
                        <div className="my-0.5 truncate text-[19px] font-extrabold tracking-[-0.3px]" style={{ color: INK }}>{row.name}</div>
                        <div className="truncate text-[13px]" style={{ color: "#6B5E3E" }}>
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
              <p className="mx-2 text-center text-[13px] leading-relaxed" style={{ color: SUB }}>
                Renewed or bought a protection plan? Open the item to update its coverage.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
