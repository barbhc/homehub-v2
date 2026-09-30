import { useState } from "react"
import { BellRingIcon, ExternalLinkIcon, Loader2Icon, MapPinIcon, PackageIcon, PencilIcon, PlusIcon } from "lucide-react"
import { addShoppingItem, addTaskSupply, getSupplyPlaces, removeShoppingItem, updateTaskSupply } from "@/modules/care"
import type { TemplateSupply } from "@/integrations/types"

const INK = "var(--hh-ink)", SUB = "var(--hh-sub)", FAINT = "var(--hh-faint)", TEAL = "var(--hh-teal)", CLAY = "var(--hh-clay)"
const SURFACE = "var(--hh-surface)", SURFACE2 = "var(--hh-surface2)", LINE = "var(--hh-line)", LINE2 = "var(--hh-line2)"
const TEAL_WASH = "var(--hh-teal-wash)", TEAL_DEEP = "var(--hh-teal-deep)"
const TEAL_EDGE = "color-mix(in srgb, var(--hh-teal) 25%, transparent)"
const TEAL_RING = "0 0 0 3px color-mix(in srgb, var(--hh-teal) 14%, transparent)"

type Patch = Partial<Pick<TemplateSupply, "name" | "url" | "size" | "location" | "buy_ahead">>

/**
 * The part card — the part lives INSIDE the task that uses it (Item Option B),
 * redesigned 2026-09-27 from the "Homehub Spares & Notes" canvas.
 *
 * One card per part: the name as a headline, the facts as pills you tap to
 * change (where the spare is kept first, in teal), Buy as a button, a pencil
 * for everything else, and the next-one controls in a quiet footer. The owner
 * found the old block — five lines of grey text over a stack of bare inputs —
 * "crowded and very text heavy".
 *
 * Nothing here counts inventory: "I have one" writes a shopping row keyed to
 * the NEXT instance, so it expires when that cycle mints a new id. Every write
 * is optimistic with a visible error and a rollback — a toggle that silently
 * failed to save is worse than one that never rendered.
 */
export function SupplyRows({
  homeId,
  taskTemplateId,
  supplies,
  nextInstanceId,
  onChange,
}: {
  homeId: string
  taskTemplateId: string
  supplies: TemplateSupply[]
  /** Soonest open instance — "I have one" attaches to it; absent → no button. */
  nextInstanceId: string | null
  /** Called with the new list after any successful write, so the parent can refresh. */
  onChange?: (next: TemplateSupply[]) => void
}) {
  const [rows, setRows] = useState<TemplateSupply[]>(supplies)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [haveState, setHaveState] = useState<Record<number, { id: string } | "saving">>({})
  // The places this home already uses, loaded when a place editor first opens.
  const [places, setPlaces] = useState<string[] | null>(null)

  const loadPlaces = () => {
    if (places !== null) return
    setPlaces([])
    void getSupplyPlaces(homeId).then((res) => {
      if (res.error) {
        // Chips are a convenience: the field works without them, so the page
        // stays calm — but the failure is logged, never swallowed.
        console.warn("[SupplyRows] couldn't load the places this home uses:", res.error.message)
        return
      }
      setPlaces(res.data ?? [])
    })
  }

  const commit = (next: TemplateSupply[]) => { setRows(next); onChange?.(next) }

  const patchRow = async (i: number, patch: Patch) => {
    const before = rows
    const optimistic = rows.map((r, k) => (k === i ? { ...r, ...patch } : r))
    setRows(optimistic)
    setError(null)
    const res = await updateTaskSupply(homeId, taskTemplateId, i, patch)
    if (res.error) {
      setRows(before) // roll back: the screen must not claim a save that did not land
      setError(res.error.message)
      return false
    }
    onChange?.(optimistic)
    return true
  }

  const add = async (input: PartFields) => {
    setError(null)
    const res = await addTaskSupply(homeId, taskTemplateId, {
      name: input.name, url: input.url || null, size: input.size || null, location: input.location || null, buy_ahead: true,
    })
    if (res.error || !res.data) { setError(res.error?.message ?? "Couldn't add the part"); return false }
    commit([...rows, res.data.supply])
    setAdding(false)
    return true
  }

  const haveOne = async (i: number) => {
    if (!nextInstanceId) return
    setHaveState((s) => ({ ...s, [i]: "saving" }))
    setError(null)
    const res = await addShoppingItem(homeId, { name: rows[i].name, supplyItemId: taskTemplateId, sourceTaskInstanceId: nextInstanceId, status: "have" })
    if (res.error || !res.data) {
      setHaveState((s) => { const n = { ...s }; delete n[i]; return n })
      setError(res.error?.message ?? "Couldn't save that")
      return
    }
    setHaveState((s) => ({ ...s, [i]: { id: res.data!.id } }))
  }

  const undoHave = async (i: number) => {
    const st = haveState[i]
    if (!st || st === "saving") return
    const res = await removeShoppingItem(homeId, st.id)
    if (res.error) { setError(res.error.message); return }
    setHaveState((s) => { const n = { ...s }; delete n[i]; return n })
  }

  return (
    <div className="flex flex-col gap-2.5">
      {rows.map((s, i) => (
        <PartCard
          // Keyed by position, not name: a rename must not remount the card, or
          // the editor "closes" on the optimistic update before the write has
          // landed and a quick navigation drops the save (found by the e2e walk).
          key={i}
          supply={s}
          have={haveState[i]}
          canHave={!!nextInstanceId}
          places={places}
          onNeedPlaces={loadPlaces}
          onPatch={(p) => patchRow(i, p)}
          onHave={() => haveOne(i)}
          onUndoHave={() => undoHave(i)}
        />
      ))}
      {adding ? (
        <div className="rounded-2xl p-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.05)]" style={{ background: SURFACE }}>
          <PartForm mode="add" initial={EMPTY_PART} onCancel={() => setAdding(false)} onSubmit={add} />
        </div>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="inline-flex items-center gap-1 self-start text-[12.5px] font-bold" style={{ color: TEAL }}>
          <PlusIcon className="size-3.5" strokeWidth={2.4} aria-hidden />
          {rows.length ? "Add another part" : "Add a part"}
        </button>
      )}
      {error && <div role="alert" className="text-[12.5px]" style={{ color: CLAY }}>{error}</div>}
    </div>
  )
}

function domainOf(url: string | null): string | null {
  if (!url) return null
  try { return new URL(url).hostname.replace(/^www\./, "") } catch { return null }
}

function PartCard({
  supply, have, canHave, places, onNeedPlaces, onPatch, onHave, onUndoHave,
}: {
  supply: TemplateSupply
  have: { id: string } | "saving" | undefined
  canHave: boolean
  places: string[] | null
  onNeedPlaces: () => void
  onPatch: (p: Patch) => Promise<boolean>
  onHave: () => void
  onUndoHave: () => void
}) {
  // "place" = just the where-it's-kept field; "all" = every field, labelled.
  const [mode, setMode] = useState<"view" | "place" | "all">("view")
  const domain = domainOf(supply.url)

  const openPlace = () => { onNeedPlaces(); setMode("place") }

  return (
    <div className="overflow-hidden rounded-2xl shadow-[0_1px_2px_rgba(15,23,42,0.05)]" style={{ background: SURFACE }}>
      <div className="flex items-start gap-3 p-3.5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl" style={{ background: TEAL_WASH }}>
          <PackageIcon className="size-5" style={{ color: TEAL }} aria-hidden />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {mode === "all" ? (
            <PartForm
              mode="edit"
              partName={supply.name}
              initial={{ name: supply.name, size: supply.size ?? "", location: supply.location ?? "", url: supply.url ?? "" }}
              onCancel={() => setMode("view")}
              onSubmit={async (v) => {
                const ok = await onPatch({
                  name: v.name.trim() || supply.name, size: v.size.trim() || null,
                  location: v.location.trim() || null, url: v.url.trim() || null,
                })
                if (ok) setMode("view")
                return ok
              }}
            />
          ) : (
            <>
              {/* The pencil sits in the name's row, not beside the whole card, so the
                  pills below get the full width and stay on one line. */}
              <div className="flex items-start gap-2">
                <span className="min-w-0 flex-1 text-[15px] font-semibold leading-snug tracking-[-0.2px]" style={{ color: INK }}>{supply.name}</span>
                {mode === "view" && (
                  <button
                    type="button"
                    onClick={() => setMode("all")}
                    aria-label={`Edit ${supply.name}`}
                    className="-mr-1.5 -mt-1 flex size-8 shrink-0 items-center justify-center rounded-full"
                  >
                    <PencilIcon className="size-[15px]" style={{ color: FAINT }} aria-hidden />
                  </button>
                )}
              </div>
              {mode === "place" ? (
                <PlaceEditor
                  partName={supply.name}
                  initial={supply.location ?? ""}
                  places={places}
                  onCancel={() => setMode("view")}
                  onSave={async (location) => {
                    const ok = await onPatch({ location })
                    if (ok) setMode("view")
                    return ok
                  }}
                />
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {supply.location ? (
                    <button
                      type="button"
                      onClick={openPlace}
                      aria-label={`Kept in ${supply.location} — change where you keep ${supply.name}`}
                      className="inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-[5px] text-[12.5px] font-semibold"
                      style={{ borderColor: TEAL_EDGE, background: TEAL_WASH, color: TEAL_DEEP }}
                    >
                      <MapPinIcon className="size-3.5 shrink-0" style={{ color: TEAL }} aria-hidden />
                      <span className="truncate">{supply.location}</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={openPlace}
                      className="inline-flex items-center gap-1.5 rounded-full border-[1.5px] border-dashed px-2.5 py-[5px] text-[12.5px] font-semibold"
                      style={{ borderColor: "color-mix(in srgb, var(--hh-teal) 45%, transparent)", color: TEAL }}
                    >
                      <PlusIcon className="size-3.5 shrink-0" strokeWidth={2.4} aria-hidden />
                      Where do you keep it?
                    </button>
                  )}
                  {supply.size && <FactPill text={supply.size} label={`Size ${supply.size} — edit ${supply.name}`} onClick={() => setMode("all")} />}
                  {supply.part_number && <FactPill text={supply.part_number} label={`Part number ${supply.part_number} — edit ${supply.name}`} onClick={() => setMode("all")} />}
                </div>
              )}
              {supply.url && mode === "view" && (
                <a
                  href={supply.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 self-start rounded-full border-[1.5px] px-3 py-1.5 text-[13px] font-bold"
                  style={{ borderColor: "color-mix(in srgb, var(--hh-teal) 35%, transparent)", background: SURFACE, color: TEAL }}
                >
                  <ExternalLinkIcon className="size-3.5" aria-hidden />
                  Buy at {domain ?? "the store"}
                </a>
              )}
            </>
          )}
        </div>
      </div>

      {mode !== "all" && (
        <div className="flex flex-col gap-2 border-t px-3.5 pb-3 pt-2.5" style={{ borderColor: LINE, background: SURFACE2 }}>
          <div className="flex items-center gap-2.5">
            <BellRingIcon className="size-[15px] shrink-0" style={{ color: TEAL }} aria-hidden />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-[13px] font-semibold" style={{ color: INK }}>Remind me to buy the next one</span>
              <span className="text-[11.5px]" style={{ color: FAINT }}>A week before it&apos;s due</span>
            </span>
            <Switch
              checked={supply.buy_ahead}
              label={`Remind me to buy the next ${supply.name}`}
              onChange={(v) => void onPatch({ buy_ahead: v })}
            />
          </div>
          {supply.buy_ahead && canHave && (
            <div className="pl-[25px] text-[12px]" style={{ color: SUB }}>
              {have === "saving" ? (
                <span>Saving…</span>
              ) : have ? (
                <span>Skipping this cycle — you have one. <button type="button" onClick={onUndoHave} className="font-semibold underline underline-offset-2" style={{ color: TEAL }}>Undo</button></span>
              ) : (
                <span className="inline-flex flex-wrap items-center gap-2">
                  Already have the next one?
                  <button
                    type="button"
                    onClick={onHave}
                    aria-label={`I have one — ${supply.name}`}
                    className="rounded-full border px-2.5 py-0.5 text-[12px] font-bold"
                    style={{ borderColor: LINE2, background: SURFACE, color: TEAL }}
                  >
                    I have one
                  </button>
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function FactPill({ text, label, onClick }: { text: string; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="inline-flex max-w-full items-center rounded-full border px-2.5 py-[5px] text-[12.5px] font-semibold"
      style={{ borderColor: LINE, background: SURFACE, color: SUB }}
    >
      <span className="truncate">{text}</span>
    </button>
  )
}

/** A real switch: a button with role="switch", so it reads as on/off. */
function Switch({ checked, label, onChange }: { checked: boolean; label: string; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="relative h-6 w-10 shrink-0 rounded-full transition-colors"
      // Off track dark enough to see: 3.4:1 on the footer (WCAG 1.4.11 wants 3:1);
      // the pale #C9D3CF it replaced was 1.4:1, and the white knob vanished on it.
      style={{ background: checked ? TEAL : "#7D8984" }}
    >
      <span
        className="absolute top-[3px] size-[18px] rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.25)] transition-[left]"
        style={{ left: checked ? 19 : 3 }}
        aria-hidden
      />
    </button>
  )
}

function PlaceEditor({ partName, initial, places, onCancel, onSave }: {
  partName: string
  initial: string
  places: string[] | null
  onCancel: () => void
  onSave: (location: string | null) => Promise<boolean>
}) {
  const [value, setValue] = useState(initial)
  const [saving, setSaving] = useState(false)
  const save = async () => {
    setSaving(true)
    await onSave(value.trim() || null)
    setSaving(false)
  }
  const chips = (places ?? []).filter((p) => p.toLowerCase() !== value.trim().toLowerCase())
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 rounded-full border-[1.5px] py-1 pl-3 pr-1" style={{ borderColor: TEAL, boxShadow: TEAL_RING, background: SURFACE }}>
        <MapPinIcon className="size-3.5 shrink-0" style={{ color: TEAL }} aria-hidden />
        <input
          // The tap that opened this editor IS the intent to type here.
          autoFocus
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void save()
            if (e.key === "Escape") onCancel()
          }}
          placeholder="Where do you keep it?"
          aria-label={`Where you keep ${partName}`}
          className="min-w-0 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-[var(--hh-faint)]"
          style={{ color: INK }}
        />
        <button type="button" onClick={() => void save()} disabled={saving} className="shrink-0 rounded-full px-3 py-1.5 text-[12.5px] font-bold text-white disabled:opacity-60" style={{ background: TEAL }}>
          {saving ? <Loader2Icon className="size-3.5 animate-spin" aria-label="Saving" /> : "Save"}
        </button>
      </div>
      {chips.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold" style={{ color: FAINT }}>Places you&apos;ve used</span>
          <div className="flex flex-wrap gap-1.5">
            {chips.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setValue(p)}
                className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] font-semibold"
                style={{ borderColor: LINE2, background: SURFACE, color: SUB }}
              >
                <MapPinIcon className="size-3 shrink-0" style={{ color: FAINT }} aria-hidden />
                {p}
              </button>
            ))}
          </div>
        </div>
      )}
      <button type="button" onClick={onCancel} className="self-start text-[12.5px] font-semibold" style={{ color: SUB }}>Cancel</button>
    </div>
  )
}

type PartFields = { name: string; size: string; location: string; url: string }
const EMPTY_PART: PartFields = { name: "", size: "", location: "", url: "" }

/**
 * Every field, labelled — the pencil's editor and the add form. Labels are
 * visible because a stack of bare filled inputs gave no hint which was which.
 * In edit mode each input's accessible name carries the part's name, so a
 * page with two parts never has two fields called "Size".
 */
function PartForm({ mode, partName, initial, onCancel, onSubmit }: {
  mode: "add" | "edit"
  partName?: string
  initial: PartFields
  onCancel: () => void
  onSubmit: (v: PartFields) => Promise<boolean>
}) {
  const [v, setV] = useState<PartFields>(initial)
  const [saving, setSaving] = useState(false)
  const set = (k: keyof PartFields) => (e: React.ChangeEvent<HTMLInputElement>) => setV((x) => ({ ...x, [k]: e.target.value }))
  const named = (label: string) => (mode === "edit" && partName ? `${label} for ${partName}` : undefined)
  const submit = async () => {
    setSaving(true)
    await onSubmit(v)
    setSaving(false)
  }
  return (
    <div className="flex flex-col gap-2.5">
      <Field label="Part" ariaLabel={named("Part name")} value={v.name} onChange={set("name")} placeholder="e.g. 16×25×1 MERV 8 filter" />
      <div className="flex gap-2">
        <Field label="Size" ariaLabel={named("Size")} value={v.size} onChange={set("size")} placeholder="e.g. 16×25×1" />
        <Field label="Where you keep it" ariaLabel={named("Where you keep it")} value={v.location} onChange={set("location")} placeholder="e.g. hall closet" />
      </div>
      <Field label="Store link" ariaLabel={named("Store link")} value={v.url} onChange={set("url")} placeholder="Any store" type="url" />
      <div className="flex items-center justify-end gap-3.5 pt-0.5">
        <button type="button" onClick={onCancel} className="text-[13px] font-semibold" style={{ color: SUB }}>Cancel</button>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={saving || (mode === "add" && !v.name.trim())}
          className="rounded-full px-4 py-[7px] text-[13px] font-bold text-white disabled:opacity-50"
          style={{ background: TEAL }}
        >
          {saving ? <Loader2Icon className="size-3.5 animate-spin" aria-label="Saving" /> : mode === "add" ? "Save part" : "Save"}
        </button>
      </div>
    </div>
  )
}

function Field({ label, ariaLabel, value, onChange, placeholder, type = "text" }: {
  label: string
  ariaLabel?: string
  value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  placeholder?: string
  type?: "text" | "url"
}) {
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="text-[11px] font-bold uppercase tracking-[0.4px]" style={{ color: SUB }}>{label}</span>
      <input
        type={type}
        inputMode={type === "url" ? "url" : undefined}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="w-full rounded-[10px] border px-[11px] py-2 text-[13.5px] outline-none placeholder:text-[var(--hh-faint)]"
        style={{ borderColor: LINE2, background: SURFACE, color: INK }}
      />
    </label>
  )
}
