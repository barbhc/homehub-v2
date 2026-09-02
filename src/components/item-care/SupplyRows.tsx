import { useState } from "react"
import { ExternalLinkIcon, PackageIcon, Loader2Icon } from "lucide-react"
import { addShoppingItem, addTaskSupply, removeShoppingItem, updateTaskSupply } from "@/modules/care"
import type { TemplateSupply } from "@/integrations/types"

const INK = "var(--hh-ink)", SUB = "var(--hh-sub)", FAINT = "var(--hh-faint)", TEAL = "var(--hh-teal)", CLAY = "var(--hh-clay)"

/**
 * The part lives INSIDE the task that uses it — Item Option B.
 *
 * One block under a task row: each supply as "name · size · domain", a plain
 * teal Buy link when a URL is saved (any retailer — never Amazon-assumed), an
 * inline link/size editor, the "Remind me to buy the next one" switch, and
 * "I have one" for the coming cycle. Nothing here counts inventory: "I have
 * one" writes a shopping row keyed to the NEXT instance, so it expires when
 * that cycle mints a new id.
 *
 * Every write is optimistic with a visible error and a rollback — a toggle
 * that silently failed to save is worse than one that never rendered.
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

  const commit = (next: TemplateSupply[]) => { setRows(next); onChange?.(next) }

  const patchRow = async (i: number, patch: Partial<Pick<TemplateSupply, "url" | "size" | "buy_ahead">>) => {
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

  const add = async (input: { name: string; url: string; size: string }) => {
    setError(null)
    const res = await addTaskSupply(homeId, taskTemplateId, { name: input.name, url: input.url || null, size: input.size || null, buy_ahead: true })
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
    <div className="flex flex-col gap-2">
      {rows.map((s, i) => (
        <SupplyRow
          key={`${s.name}:${i}`}
          supply={s}
          have={haveState[i]}
          canHave={!!nextInstanceId}
          onPatch={(p) => patchRow(i, p)}
          onHave={() => haveOne(i)}
          onUndoHave={() => undoHave(i)}
        />
      ))}
      {adding ? (
        <AddPartForm onCancel={() => setAdding(false)} onSave={add} />
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="self-start text-[12.5px] font-bold" style={{ color: TEAL }}>
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

function SupplyRow({
  supply, have, canHave, onPatch, onHave, onUndoHave,
}: {
  supply: TemplateSupply
  have: { id: string } | "saving" | undefined
  canHave: boolean
  onPatch: (p: Partial<Pick<TemplateSupply, "url" | "size" | "buy_ahead">>) => Promise<boolean>
  onHave: () => void
  onUndoHave: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [url, setUrl] = useState(supply.url ?? "")
  const [size, setSize] = useState(supply.size ?? "")
  const [saving, setSaving] = useState(false)
  const domain = domainOf(supply.url)
  const meta = [supply.size, domain, supply.part_number].filter(Boolean).join(" · ")

  const save = async () => {
    setSaving(true)
    const ok = await onPatch({ url: url.trim() || null, size: size.trim() || null })
    setSaving(false)
    if (ok) setEditing(false)
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2.5">
        <PackageIcon className="size-3.5 shrink-0" style={{ color: TEAL }} />
        <span className="min-w-0 flex-1 text-[12.5px]" style={{ color: SUB }}>
          <span className="font-semibold" style={{ color: INK }}>{supply.name}</span>
          {meta && <span> · {meta}</span>}
        </span>
        {supply.url && !editing && (
          <a href={supply.url} target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center gap-1 text-[13px] font-semibold" style={{ color: TEAL }}>
            Buy <ExternalLinkIcon className="size-3" />
          </a>
        )}
        <button type="button" onClick={() => setEditing((v) => !v)} className="shrink-0 text-[12px] font-semibold" style={{ color: FAINT }} aria-label={`${supply.url ? "Edit" : "Add"} link for ${supply.name}`}>
          {editing ? "Cancel" : supply.url ? "Edit" : "Add link"}
        </button>
      </div>

      {editing && (
        <div className="ml-6 flex flex-col gap-1.5">
          <input
            type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Link to the part at any store"
            aria-label={`Link for ${supply.name}`}
            className="rounded-lg border px-2.5 py-1.5 text-[13px] outline-none" style={{ borderColor: "var(--hh-line2)", background: "var(--hh-surface)", color: INK }}
          />
          <div className="flex items-center gap-2">
            <input
              type="text" value={size} onChange={(e) => setSize(e.target.value)} placeholder="Size (e.g. 16x25x1)"
              aria-label={`Size for ${supply.name}`}
              className="min-w-0 flex-1 rounded-lg border px-2.5 py-1.5 text-[13px] outline-none" style={{ borderColor: "var(--hh-line2)", background: "var(--hh-surface)", color: INK }}
            />
            <button type="button" onClick={() => void save()} disabled={saving} className="rounded-full px-3.5 py-1.5 text-[12.5px] font-bold text-white disabled:opacity-50" style={{ background: TEAL }}>
              {saving ? <Loader2Icon className="size-3.5 animate-spin" /> : "Save"}
            </button>
          </div>
        </div>
      )}

      <label className="ml-6 flex cursor-pointer items-center gap-2">
        <input
          type="checkbox" checked={supply.buy_ahead} onChange={(e) => void onPatch({ buy_ahead: e.target.checked })}
          aria-label={`Remind me to buy the next ${supply.name}`}
          className="size-4 shrink-0 accent-[var(--hh-teal,#1B6B5A)]"
        />
        <span className="text-[12.5px] font-semibold" style={{ color: INK }}>Remind me to buy the next one</span>
        <span className="text-[11.5px]" style={{ color: FAINT }}>· a week early</span>
      </label>

      {supply.buy_ahead && canHave && (
        <div className="ml-6 text-[12px]" style={{ color: SUB }}>
          {have === "saving" ? (
            <span>Saving…</span>
          ) : have ? (
            <span>Skipping this cycle — you have one. <button type="button" onClick={onUndoHave} className="font-semibold underline underline-offset-2" style={{ color: TEAL }}>Undo</button></span>
          ) : (
            <span>Got one already? <button type="button" onClick={onHave} className="font-semibold" style={{ color: TEAL }} aria-label={`I have one — ${supply.name}`}>I have one</button></span>
          )}
        </div>
      )}
    </div>
  )
}

function AddPartForm({ onCancel, onSave }: { onCancel: () => void; onSave: (v: { name: string; url: string; size: string }) => Promise<boolean> }) {
  const [name, setName] = useState("")
  const [url, setUrl] = useState("")
  const [size, setSize] = useState("")
  const [saving, setSaving] = useState(false)
  return (
    <div className="flex flex-col gap-1.5 rounded-xl border p-2.5" style={{ borderColor: "var(--hh-line2)", background: "var(--hh-surface)" }}>
      <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Part name (e.g. Furnace filter)" aria-label="Part name"
        className="rounded-lg border px-2.5 py-1.5 text-[13px] outline-none" style={{ borderColor: "var(--hh-line2)", color: INK }} />
      <input type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Link at any store (optional)" aria-label="Part link"
        className="rounded-lg border px-2.5 py-1.5 text-[13px] outline-none" style={{ borderColor: "var(--hh-line2)", color: INK }} />
      <div className="flex items-center gap-2">
        <input type="text" value={size} onChange={(e) => setSize(e.target.value)} placeholder="Size (optional)" aria-label="Part size"
          className="min-w-0 flex-1 rounded-lg border px-2.5 py-1.5 text-[13px] outline-none" style={{ borderColor: "var(--hh-line2)", color: INK }} />
        <button type="button" onClick={onCancel} className="text-[12.5px] font-semibold" style={{ color: SUB }}>Cancel</button>
        <button
          type="button" disabled={!name.trim() || saving}
          onClick={async () => { setSaving(true); await onSave({ name, url, size }); setSaving(false) }}
          className="rounded-full px-3.5 py-1.5 text-[12.5px] font-bold text-white disabled:opacity-50" style={{ background: TEAL }}
        >
          {saving ? <Loader2Icon className="size-3.5 animate-spin" /> : "Save part"}
        </button>
      </div>
    </div>
  )
}
