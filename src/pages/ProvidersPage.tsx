import { useEffect, useMemo, useState } from "react"
import {
  GlobeIcon,
  Loader2Icon,
  MailIcon,
  PencilIcon,
  PhoneIcon,
  PlusIcon,
  Trash2Icon,
  WrenchIcon,
} from "lucide-react"
import { useCurrentHome } from "@/modules/home"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { ServiceProvider } from "@/integrations/types"
import {
  EMPTY_PROVIDER_FORM,
  PROVIDER_CATEGORIES,
  categoryLabel,
  providerInitials,
  useServiceProviders,
  type ProviderFormState,
} from "@/hooks/useServiceProviders"

// ── Tokens (redesign palette) ───────────────────────────────────────────────
const INK = "var(--hh-ink)"
const SUB = "var(--hh-sub)"
const FAINT = "var(--hh-faint)"
const TEAL = "var(--hh-teal)"

function normalizeUrl(url: string): string {
  return url.startsWith("http") ? url : `https://${url}`
}

function prettyUrl(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "")
}

// ── Detail action button (Call / Email / Website) ───────────────────────────
function ActionLink({
  href,
  icon: Icon,
  label,
  external,
  tone = "soft",
}: {
  href: string
  icon: typeof PhoneIcon
  label: string
  external?: boolean
  tone?: "soft" | "subtle"
}) {
  const soft = tone === "soft"
  return (
    <a
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      className="inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-[13.5px] font-semibold transition-colors"
      style={
        soft
          ? { background: "var(--hh-teal-wash)", color: TEAL }
          : { background: "var(--hh-surface2)", color: INK }
      }
    >
      <Icon className="size-[15px]" />
      {label}
    </a>
  )
}

// ── Labeled detail field ─────────────────────────────────────────────────────
function Field({ label, value, mono, link }: { label: string; value: string; mono?: boolean; link?: string }) {
  return (
    <div>
      <div className="text-[11px] font-bold uppercase tracking-[0.5px]" style={{ color: SUB }}>{label}</div>
      {link ? (
        <a
          href={link}
          target={link.startsWith("http") ? "_blank" : undefined}
          rel={link.startsWith("http") ? "noopener noreferrer" : undefined}
          className="mt-1 block break-words text-[14px] font-medium hover:underline"
          style={{ color: TEAL }}
        >
          {value}
        </a>
      ) : (
        <div
          className={`mt-1 break-words text-[14px] ${mono ? "font-mono tabular-nums" : "font-medium"}`}
          style={{ color: INK }}
        >
          {value}
        </div>
      )}
    </div>
  )
}

// ── Detail pane ──────────────────────────────────────────────────────────────
function ProviderDetail({
  provider,
  onEdit,
  onDelete,
  deleting,
}: {
  provider: ServiceProvider
  onEdit: () => void
  onDelete: () => void
  deleting: boolean
}) {
  const p = provider
  return (
    <div className="rounded-2xl bg-[var(--hh-surface)] p-6 shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div
            className="flex size-14 shrink-0 items-center justify-center rounded-2xl text-[20px] font-extrabold"
            style={{ background: "var(--hh-teal-wash)", color: TEAL }}
          >
            {providerInitials(p.name)}
          </div>
          <div className="min-w-0">
            <h2 className="text-[21px] font-extrabold tracking-[-0.4px]" style={{ color: INK }}>{p.name}</h2>
            <div className="mt-0.5 text-[13px]" style={{ color: SUB }}>{categoryLabel(p.category)}</div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button variant="ghost" size="sm" onClick={onEdit} className="gap-1.5" style={{ color: SUB }}>
            <PencilIcon className="size-3.5" /> Edit
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onDelete}
            disabled={deleting}
            aria-label={`Delete ${p.name}`}
            className="text-muted-foreground hover:text-foreground"
          >
            {deleting ? <Loader2Icon className="size-3.5 animate-spin" /> : <Trash2Icon className="size-3.5" />}
          </Button>
        </div>
      </div>

      {(p.phone || p.email || p.website) && (
        <div className="mt-5 flex flex-wrap gap-2.5">
          {p.phone && (
            <ActionLink href={`tel:${p.phone.replace(/\s/g, "")}`} icon={PhoneIcon} label="Call" tone="soft" />
          )}
          {p.email && (
            <ActionLink href={`mailto:${p.email}`} icon={MailIcon} label="Email" tone="subtle" />
          )}
          {p.website && (
            <ActionLink href={normalizeUrl(p.website)} icon={GlobeIcon} label="Website" tone="subtle" external />
          )}
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label="Phone" value={p.phone || "—"} mono link={p.phone ? `tel:${p.phone.replace(/\s/g, "")}` : undefined} />
        <Field label="Email" value={p.email || "—"} link={p.email ? `mailto:${p.email}` : undefined} />
        <Field
          label="Website"
          value={p.website ? prettyUrl(p.website) : "—"}
          link={p.website ? normalizeUrl(p.website) : undefined}
        />
      </div>

      {p.notes && (
        <div className="mt-6">
          <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.5px]" style={{ color: SUB }}>Notes</div>
          <div
            className="rounded-xl px-3.5 py-3 text-[13.5px] leading-relaxed"
            style={{ background: "var(--hh-surface2)", color: INK }}
          >
            {p.notes}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function ProvidersPage() {
  const { home } = useCurrentHome()
  const homeId = home?.home_id ?? ""
  const { providers, loading, deletingId, save, remove } = useServiceProviders(homeId)

  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<ProviderFormState>(EMPTY_PROVIDER_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Default selection to the first provider; keep it valid as the list changes.
  useEffect(() => {
    if (providers.length === 0) {
      if (selectedId !== null) setSelectedId(null)
      return
    }
    if (!selectedId || !providers.some((p) => p.provider_id === selectedId)) {
      setSelectedId(providers[0].provider_id)
    }
  }, [providers, selectedId])

  const selected = useMemo(
    () => providers.find((p) => p.provider_id === selectedId) ?? null,
    [providers, selectedId]
  )

  // Group providers by category (preserve the category config order).
  const groups = useMemo(() => {
    const byCat = new Map<string, ServiceProvider[]>()
    for (const p of providers) {
      const list = byCat.get(p.category) ?? byCat.set(p.category, []).get(p.category)!
      list.push(p)
    }
    return [...byCat.entries()].sort(
      (a, b) => categoryLabel(a[0]).localeCompare(categoryLabel(b[0]))
    )
  }, [providers])

  // ── Dialog helpers ──────────────────────────────────────────────────────────
  const openAdd = () => {
    setEditingId(null)
    setForm(EMPTY_PROVIDER_FORM)
    setFormError(null)
    setDialogOpen(true)
  }

  const openEdit = (p: ServiceProvider) => {
    setEditingId(p.provider_id)
    setForm({
      name: p.name,
      category: p.category,
      phone: p.phone ?? "",
      email: p.email ?? "",
      website: p.website ?? "",
      notes: p.notes ?? "",
    })
    setFormError(null)
    setDialogOpen(true)
  }

  const closeDialog = () => {
    setDialogOpen(false)
    setEditingId(null)
    setFormError(null)
  }

  const set = (field: keyof ProviderFormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }))

  const handleSave = async () => {
    // Encourage at least one way to reach the provider.
    if (!form.phone.trim() && !form.email.trim()) {
      setFormError("Add a phone number or email so you can reach them.")
      return
    }
    setSaving(true)
    setFormError(null)
    const { provider, error } = await save(form, editingId)
    setSaving(false)
    if (error) {
      setFormError(error)
      return
    }
    if (provider) setSelectedId(provider.provider_id)
    closeDialog()
  }

  if (!home) return null

  return (
    <div className="min-h-full" style={{ background: "var(--hh-bg)" }}>
      <div className="mx-auto max-w-5xl px-5 pb-12 pt-6 md:px-6 md:pt-10">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-[27px] font-extrabold tracking-[-0.6px] md:text-[33px] md:tracking-[-0.7px]" style={{ color: INK }}>
              Providers
            </h1>
            <p className="mt-1.5 text-[13.5px]" style={{ color: SUB }}>Your trusted pros, grouped by trade.</p>
          </div>
          {providers.length > 0 && (
            <Button onClick={openAdd} className="gap-1.5">
              <PlusIcon className="size-4" /> Add provider
            </Button>
          )}
        </header>

        {loading ? (
          <p className="text-[13.5px]" style={{ color: SUB }}>Loading…</p>
        ) : providers.length === 0 ? (
          // ── Empty state (the user genuinely has zero providers) ──
          <div className="flex flex-col items-center justify-center rounded-2xl bg-[var(--hh-surface)] px-6 py-16 text-center shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
            <div
              className="mb-4 flex size-14 items-center justify-center rounded-2xl"
              style={{ background: "var(--hh-teal-wash)", color: TEAL }}
            >
              <WrenchIcon className="size-6" />
            </div>
            <h2 className="text-[17px] font-bold" style={{ color: INK }}>No service providers yet</h2>
            <p className="mt-1.5 max-w-xs text-[13.5px]" style={{ color: SUB }}>
              Keep your contractors and service pros in one place — one tap to call or email.
            </p>
            <Button onClick={openAdd} className="mt-5 gap-1.5">
              <PlusIcon className="size-4" /> Add provider
            </Button>
          </div>
        ) : (
          // ── Two-column directory ──
          <div className="grid items-start gap-[22px] lg:grid-cols-[300px_minmax(0,1fr)]">
            {/* Left rail — grouped by category */}
            <div className="flex flex-col gap-[18px]">
              {groups.map(([cat, list]) => (
                <div key={cat}>
                  <div className="mb-2 px-1 text-[11px] font-bold uppercase tracking-[0.6px]" style={{ color: SUB }}>
                    {categoryLabel(cat)}
                  </div>
                  <div className="overflow-hidden rounded-2xl bg-[var(--hh-surface)] shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
                    {list.map((p, i) => {
                      const active = p.provider_id === selectedId
                      return (
                        <button
                          key={p.provider_id}
                          onClick={() => setSelectedId(p.provider_id)}
                          className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors"
                          style={{
                            borderTop: i ? "1px solid var(--hh-line)" : "none",
                            background: active ? "var(--hh-teal-wash)" : "transparent",
                          }}
                          aria-current={active}
                        >
                          <span
                            className="flex size-9 shrink-0 items-center justify-center rounded-[10px] text-[13px] font-bold"
                            style={{ background: "var(--hh-teal-wash)", color: TEAL }}
                          >
                            {providerInitials(p.name)}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13.5px] font-semibold" style={{ color: INK }}>{p.name}</span>
                            <span className="block truncate text-[12px]" style={{ color: FAINT }}>
                              {p.phone || categoryLabel(p.category)}
                            </span>
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Right detail pane */}
            {selected && (
              <ProviderDetail
                provider={selected}
                onEdit={() => openEdit(selected)}
                onDelete={() => remove(selected.provider_id)}
                deleting={deletingId === selected.provider_id}
              />
            )}
          </div>
        )}
      </div>

      {/* Add / Edit dialog (same fields as the Settings section) */}
      <Dialog open={dialogOpen} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit provider" : "Add service provider"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="pv-name">Name</Label>
              <Input id="pv-name" placeholder="e.g. Mike's Plumbing" value={form.name} onChange={set("name")} autoFocus />
            </div>

            <div>
              <Label htmlFor="pv-category">Category</Label>
              <Select value={form.category} onValueChange={(v) => setForm((prev) => ({ ...prev, category: v }))}>
                <SelectTrigger id="pv-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROVIDER_CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="pv-phone">
                Phone <span className="font-normal text-muted-foreground">(phone or email)</span>
              </Label>
              <Input id="pv-phone" type="tel" placeholder="(555) 867-5309" value={form.phone} onChange={set("phone")} />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="pv-email">
                  Email <span className="font-normal text-muted-foreground">(optional)</span>
                </Label>
                <Input id="pv-email" type="email" placeholder="info@provider.com" value={form.email} onChange={set("email")} />
              </div>
              <div>
                <Label htmlFor="pv-website">
                  Website <span className="font-normal text-muted-foreground">(optional)</span>
                </Label>
                <Input id="pv-website" type="url" placeholder="provider.com" value={form.website} onChange={set("website")} />
              </div>
            </div>

            <div>
              <Label htmlFor="pv-notes">
                Notes <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input id="pv-notes" placeholder="e.g. Leave voicemail, only works weekdays" value={form.notes} onChange={set("notes")} />
            </div>

            {formError && <p className="text-sm text-destructive">{formError}</p>}
          </div>

          <DialogFooter showCloseButton>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2Icon className="mr-2 size-4 animate-spin" />}
              {editingId ? "Save changes" : "Add provider"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
