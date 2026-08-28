/**
 * WarrantyPanel — status-first warranty surface (desktop rail + mobile).
 *
 * Integrity rule (design handoff §E): only duration / coverage / expiry are
 * structured on item_unit. Coverage length + Provider show as facts; everything
 * else (parts-vs-labor, drum-only, …) stays PROSE inside `warranty_coverage`.
 * Slice 2 adds the three things the schema now backs with real columns:
 *   • Register CTA            warranty_registration_required && !registered && active
 *   • "What's not covered"    warranty_exclusions[] (self-hides when empty)
 *   • Contact                 warranty_contact (phone/email/url)
 *
 * Pass `m` for mobile spacing. `onEdit` powers the "Add warranty" / "Add
 * extended coverage" affordances; omit it (mobile) and those self-hide.
 */
import { useState } from "react"
import { ShieldCheckIcon, ShieldOffIcon, ChevronDownIcon, ChevronUpIcon, BadgeCheckIcon, PhoneIcon, PlusIcon } from "lucide-react"
import type { ItemUnit } from "@/integrations/types"
import { updateItemUnit } from "@/modules/items/services/itemService"

const INK = "var(--hh-ink)", SUB = "var(--hh-sub)", FAINT = "var(--hh-faint)", TEAL = "var(--hh-teal)"
const TEAL_WASH = "var(--hh-teal-wash)", SLATE_SOFT = "var(--hh-slate-soft)", LINE = "var(--hh-line)"

function fmtDate(s: string | null): string | null {
  if (!s) return null
  return new Date(s.length === 10 ? s + "T12:00:00" : s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

/** Render free-text contact as a tel:/mailto:/http link when it looks like one. */
function ContactLink({ contact }: { contact: string }) {
  const trimmed = contact.trim()
  let href: string | null = null
  if (/^https?:\/\//i.test(trimmed)) href = trimmed
  else if (/^[\w.+-]+@[\w-]+\.[\w.-]+$/.test(trimmed)) href = `mailto:${trimmed}`
  else if (/[\d][\d\s().-]{6,}/.test(trimmed)) href = `tel:${trimmed.replace(/[^\d+]/g, "")}`
  if (href) {
    return <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noreferrer" className="font-bold" style={{ color: "var(--hh-teal-deep)", textDecoration: "none" }}>{trimmed}</a>
  }
  return <span className="font-semibold" style={{ color: SUB }}>{trimmed}</span>
}

function Disclosure({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen((v) => !v)} className="mt-3 flex w-full items-center justify-between pt-3" style={{ borderTop: `1px solid ${LINE}` }}>
        <span className="text-[12.5px] font-bold" style={{ color: TEAL }}>{label}</span>
        {open ? <ChevronUpIcon className="size-4" style={{ color: TEAL }} /> : <ChevronDownIcon className="size-4" style={{ color: TEAL }} />}
      </button>
      {open && <div className="mt-2.5">{children}</div>}
    </>
  )
}

export interface WarrantyPanelProps {
  item: ItemUnit
  homeId: string
  /** Powers "Add warranty" / "Add extended coverage". Omit (mobile) to hide them. */
  onEdit?: () => void
  /** Bubble the updated item up after registering. */
  onItemUpdate?: (item: ItemUnit) => void
  /** Most plans can't be extended; gate the extended-coverage CTA. */
  renewable?: boolean
  /** Mobile spacing. */
  m?: boolean
}

export function WarrantyPanel({ item, homeId, onEdit, onItemUpdate, renewable = false, m }: WarrantyPanelProps) {
  const [registering, setRegistering] = useState(false)
  const active = !!item.warranty_expiry_date && new Date(item.warranty_expiry_date) >= new Date()

  const tracked = !!item.warranty_expiry_date || item.warranty_duration_months != null
  if (!tracked) {
    if (!onEdit) return null // mobile: nothing to show, self-hide
    return (
      <div className="rounded-[16px] bg-[var(--hh-surface)] shadow-[0_1px_2px_rgba(15,23,42,0.05)]" style={{ padding: m ? 16 : 18 }}>
        {/* Titled for both, because it is now the only prompt for either. The
            "Track purchase" nudge that used to sit above it opened this exact
            sheet, so the page asked the same question twice in two different
            shapes — and the owner's call was to keep the one that matches the
            rest of the page. */}
        <span className="text-[13.5px] font-bold" style={{ color: INK }}>Warranty and purchase information</span>
        <div className="mt-1.5 text-[12.5px]" style={{ color: SUB }}>
          Nothing tracked yet — worth having for warranty and insurance claims.
        </div>
        <button onClick={onEdit} className="mt-2 inline-flex items-center gap-1.5 text-[12.5px] font-bold" style={{ color: TEAL }}>
          <PlusIcon className="size-[14px]" /> Add details
        </button>
      </div>
    )
  }

  const expiry = item.warranty_expiry_date
  const statusText = expiry
    ? `${active ? "Covered until" : "Expired"} ${fmtDate(expiry)}`
    : `${item.warranty_duration_months} month coverage`

  // Remaining-coverage fill: needs a start (install/purchase) + expiry; else nominal.
  let fillPct = active ? 50 : 100
  const start = item.install_date ?? item.purchase_date
  if (active && expiry && start) {
    const s = new Date(start.length === 10 ? start + "T12:00:00" : start).getTime()
    const e = new Date(expiry.length === 10 ? expiry + "T12:00:00" : expiry).getTime()
    const now = new Date().getTime()
    if (e > s) fillPct = Math.max(5, Math.min(100, Math.round(((e - now) / (e - s)) * 100)))
  }

  const facts: [string, string][] = []
  if (item.warranty_duration_months != null) {
    const mo = item.warranty_duration_months
    facts.push(["Coverage length", mo >= 12 && mo % 12 === 0 ? `${mo / 12} year${mo === 12 ? "" : "s"}` : `${mo} months`])
  }
  if (item.brand) facts.push(["Provider", item.brand])

  const exclusions = item.warranty_exclusions ?? []
  const registered = item.warranty_registered_at != null
  const showRegister = item.warranty_registration_required === true && !registered && active

  const handleRegister = async () => {
    if (item.warranty_registration_url) window.open(item.warranty_registration_url, "_blank", "noreferrer")
    setRegistering(true)
    const res = await updateItemUnit(homeId, item.item_unit_id, { warranty_registered_at: new Date().toISOString() })
    setRegistering(false)
    if (res.data && onItemUpdate) onItemUpdate(res.data)
  }

  return (
    <div className="rounded-[16px] bg-[var(--hh-surface)] shadow-[0_1px_2px_rgba(15,23,42,0.05)]" style={{ padding: m ? 16 : 18 }}>
      <div className="mb-2.5 flex items-center justify-between">
        {/* Same name in both states. A section that renames itself depending on
            whether it has data is two sections wearing one box. */}
        <span className="text-[13.5px] font-bold" style={{ color: INK }}>Warranty and purchase information</span>
        <span className="rounded-md px-2 py-0.5 text-[11.5px] font-bold" style={{ color: active ? TEAL : FAINT, background: active ? TEAL_WASH : SLATE_SOFT }}>
          {active ? "Active" : "Lapsed"}
        </span>
      </div>

      <div className="mb-2 flex items-center gap-2">
        {active ? <ShieldCheckIcon className="size-[15px]" style={{ color: TEAL }} /> : <ShieldOffIcon className="size-[15px]" style={{ color: FAINT }} />}
        <span className="text-[13px]" style={{ color: SUB }}>{statusText}</span>
        {registered && (
          <span className="ml-auto inline-flex items-center gap-1 text-[11.5px] font-bold" style={{ color: TEAL }}>
            <BadgeCheckIcon className="size-[13px]" /> Registered
          </span>
        )}
      </div>
      <div className="mb-4 h-1.5 overflow-hidden rounded-full" style={{ background: SLATE_SOFT }}>
        <div className="h-full" style={{ width: `${fillPct}%`, background: active ? TEAL : "#C2CBD4" }} />
      </div>

      {facts.length > 0 && (
        <div className="mb-1 grid grid-cols-2 gap-x-3.5 gap-y-3">
          {facts.map(([k, v]) => (
            <div key={k}>
              <div className="text-[10px] font-bold uppercase tracking-[0.4px]" style={{ color: FAINT }}>{k}</div>
              <div className="mt-0.5 text-[13.5px] font-semibold" style={{ color: INK }}>{v}</div>
            </div>
          ))}
        </div>
      )}

      {/* Coverage — prose, because parts/labor specifics aren't structured. */}
      {item.warranty_coverage && (
        <p className="mt-3 text-[12.5px] leading-relaxed" style={{ color: SUB }}>{item.warranty_coverage}</p>
      )}

      {/* registration_required → Register CTA */}
      {showRegister && (
        <button onClick={handleRegister} disabled={registering} className="mt-3.5 flex w-full items-center justify-center gap-1.5 rounded-[11px] py-2.5 text-[13.5px] font-bold text-white disabled:opacity-60" style={{ background: TEAL }}>
          <BadgeCheckIcon className="size-[15px]" /> Register to activate coverage
        </button>
      )}

      {/* What's not covered — self-hides when no exclusions cited */}
      {exclusions.length > 0 && (
        <Disclosure label="What's not covered">
          <ul className="flex flex-col gap-1.5 pl-0.5">
            {exclusions.map((ex, i) => (
              <li key={i} className="flex items-start gap-2 text-[12px] leading-snug" style={{ color: SUB }}>
                <span className="mt-[6px] size-1 shrink-0 rounded-full" style={{ background: FAINT }} />
                <span>{ex}</span>
              </li>
            ))}
          </ul>
        </Disclosure>
      )}

      {/* warranty.contact */}
      {item.warranty_contact && (
        <div className="mt-3 flex items-center gap-2 pt-3" style={{ borderTop: `1px solid ${LINE}` }}>
          <PhoneIcon className="size-[13px] shrink-0" style={{ color: FAINT }} />
          <span className="text-[12px]" style={{ color: SUB }}>Questions? <ContactLink contact={item.warranty_contact} /></span>
        </div>
      )}

      {!active && renewable && onEdit && (
        <button onClick={onEdit} className="mt-3.5 flex w-full items-center justify-center gap-1.5 rounded-[11px] border py-2.5 text-[13.5px] font-bold" style={{ borderColor: "var(--hh-line2)", background: "var(--hh-surface)", color: INK }}>
          <PlusIcon className="size-[15px]" style={{ color: TEAL }} /> Add extended coverage
        </button>
      )}
    </div>
  )
}
