import { useState } from "react"
import {
  Loader2Icon,
  PencilIcon,
  PhoneIcon,
  PlusIcon,
  Trash2Icon,
  WrenchIcon,
} from "lucide-react"
import { SectionCard } from "@/components/layout"
import { CardContent } from "@/components/ui/card"
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
import { cn } from "@/lib/utils"
import {
  EMPTY_PROVIDER_FORM,
  PROVIDER_CATEGORIES,
  categoryLabel,
  useServiceProviders,
  type ProviderFormState,
} from "@/hooks/useServiceProviders"

// ── Category config ───────────────────────────────────────────────────────────

const CATEGORY_COLORS: Record<string, string> = {
  hvac: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-400 dark:border-sky-800",
  plumber: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800",
  electrician: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800",
  general_contractor: "bg-stone-100 text-stone-700 border-stone-200 dark:bg-stone-900/60 dark:text-stone-400 dark:border-stone-700",
  landscaper: "bg-green-50 text-green-700 border-green-200 dark:bg-green-950/40 dark:text-green-400 dark:border-green-800",
  pest_control: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-400 dark:border-orange-800",
  roofer: "bg-zinc-100 text-zinc-700 border-zinc-300 dark:bg-zinc-900/60 dark:text-zinc-400 dark:border-zinc-700",
  painter: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-400 dark:border-violet-800",
  appliance_repair: "bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/40 dark:text-teal-400 dark:border-teal-800",
  handyman: "bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950/40 dark:text-yellow-400 dark:border-yellow-800",
  cleaner: "bg-pink-50 text-pink-700 border-pink-200 dark:bg-pink-950/40 dark:text-pink-400 dark:border-pink-800",
  other: "bg-muted text-muted-foreground border-border",
}

function categoryColor(value: string): string {
  return CATEGORY_COLORS[value] ?? CATEGORY_COLORS.other
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  homeId: string
}

export function ServiceProvidersSection({ homeId }: Props) {
  const { providers, loading, deletingId, save, remove } = useServiceProviders(homeId)

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<ProviderFormState>(EMPTY_PROVIDER_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // ── Dialog helpers ─────────────────────────────────────────────────────────

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

  // ── Save ───────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    setSaving(true)
    setFormError(null)
    const { error } = await save(form, editingId)
    setSaving(false)
    if (error) {
      setFormError(error)
      return
    }
    closeDialog()
  }

  const handleDelete = (providerId: string) => { void remove(providerId) }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      <SectionCard className="mt-6">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <WrenchIcon className="size-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Service Providers</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Keep your contractors and service pros in one place.
          </p>

          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <>
              {providers.length === 0 ? (
                <p className="text-sm text-muted-foreground mb-4">
                  No service providers added yet.
                </p>
              ) : (
                <ul className="space-y-0 mb-4">
                  {providers.map((p) => (
                    <li
                      key={p.provider_id}
                      className="flex items-start gap-3 py-3 border-b border-border last:border-0 group"
                    >
                      {/* Category chip */}
                      <span
                        className={cn(
                          "mt-0.5 shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded border whitespace-nowrap",
                          categoryColor(p.category)
                        )}
                      >
                        {categoryLabel(p.category)}
                      </span>

                      {/* Name + contact details */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{p.name}</p>
                        <div className="-my-1 mt-0.5 flex flex-wrap gap-x-3 gap-y-1">
                          {p.phone && (
                            <a
                              href={`tel:${p.phone.replace(/\s/g, "")}`}
                              className="flex min-h-6 items-center gap-1 py-1 text-xs text-primary hover:underline"
                            >
                              <PhoneIcon className="size-3 shrink-0" />
                              {p.phone}
                            </a>
                          )}
                          {p.email && (
                            <a
                              href={`mailto:${p.email}`}
                              className="inline-flex min-h-6 max-w-[200px] items-center truncate py-1 text-xs text-primary hover:underline"
                            >
                              {p.email}
                            </a>
                          )}
                          {p.website && (
                            <a
                              href={p.website.startsWith("http") ? p.website : `https://${p.website}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex min-h-6 max-w-[200px] items-center truncate py-1 text-xs text-primary hover:underline"
                            >
                              {p.website.replace(/^https?:\/\//, "")}
                            </a>
                          )}
                        </div>
                        {p.notes && (
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">{p.notes}</p>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 shrink-0 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-muted-foreground hover:text-foreground"
                          onClick={() => openEdit(p)}
                          aria-label={`Edit ${p.name}`}
                        >
                          <PencilIcon className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-muted-foreground hover:text-destructive"
                          disabled={deletingId === p.provider_id}
                          onClick={() => handleDelete(p.provider_id)}
                          aria-label={`Delete ${p.name}`}
                        >
                          {deletingId === p.provider_id
                            ? <Loader2Icon className="size-3.5 animate-spin" />
                            : <Trash2Icon className="size-3.5" />}
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <Button variant="outline" size="sm" onClick={openAdd}>
                <PlusIcon className="size-4 mr-1.5" />
                Add Provider
              </Button>
            </>
          )}
        </CardContent>
      </SectionCard>

      {/* Add / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit provider" : "Add service provider"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Name */}
            <div>
              <Label htmlFor="sp-name">Name</Label>
              <Input
                id="sp-name"
                placeholder="e.g. Mike's Plumbing"
                value={form.name}
                onChange={set("name")}
                autoFocus
              />
            </div>

            {/* Category */}
            <div>
              <Label htmlFor="sp-category">Category</Label>
              <Select
                value={form.category}
                onValueChange={(v) => setForm((prev) => ({ ...prev, category: v }))}
              >
                <SelectTrigger id="sp-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROVIDER_CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Phone */}
            <div>
              <Label htmlFor="sp-phone">
                Phone <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Input
                id="sp-phone"
                type="tel"
                placeholder="(555) 867-5309"
                value={form.phone}
                onChange={set("phone")}
              />
            </div>

            {/* Email + Website in a row on wider screens */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="sp-email">
                  Email <span className="text-muted-foreground font-normal">(optional)</span>
                </Label>
                <Input
                  id="sp-email"
                  type="email"
                  placeholder="info@provider.com"
                  value={form.email}
                  onChange={set("email")}
                />
              </div>
              <div>
                <Label htmlFor="sp-website">
                  Website <span className="text-muted-foreground font-normal">(optional)</span>
                </Label>
                <Input
                  id="sp-website"
                  type="url"
                  placeholder="provider.com"
                  value={form.website}
                  onChange={set("website")}
                />
              </div>
            </div>

            {/* Notes */}
            <div>
              <Label htmlFor="sp-notes">
                Notes <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Input
                id="sp-notes"
                placeholder="e.g. Leave voicemail, only works weekdays"
                value={form.notes}
                onChange={set("notes")}
              />
            </div>

            {formError && <p className="text-sm text-destructive">{formError}</p>}
          </div>

          <DialogFooter showCloseButton>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2Icon className="size-4 mr-2 animate-spin" />}
              {editingId ? "Save changes" : "Add provider"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
