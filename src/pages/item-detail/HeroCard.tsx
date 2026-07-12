import { useRef, useState, useEffect } from "react"
import {
  CameraIcon,
  FileUpIcon,
  Loader2Icon,
  PencilIcon,
  SearchIcon,
  Trash2Icon,
} from "lucide-react"
import { SectionCard } from "@/components/layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import type { ItemUnit, Room } from "@/integrations/types"
import { updateItemUnit } from "@/modules/items"
import {
  uploadItemPhoto,
  uploadReceiptImage,
} from "@/modules/inventory/services/storageService"
import { PhotoSearchSheet } from "@/components/inventory/PhotoSearchSheet"
import { type EditableField, ROOM_NONE, formatDate, getPhotoUrl } from "./utils"

interface EditableRowProps {
  field: EditableField
  label: string
  displayValue: string | null
  placeholder: string
  inputType?: string
  isEditing: boolean
  editValue: string
  editInputRef: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>
  onEditValueChange: (v: string) => void
  onSave: (field: EditableField, value: string | null) => void
  onKeyDown: (e: React.KeyboardEvent, field: EditableField, value: string) => void
  onStartEdit: () => void
}

function EditableRow({
  field,
  label,
  displayValue,
  placeholder,
  inputType = "text",
  isEditing,
  editValue,
  editInputRef,
  onEditValueChange,
  onSave,
  onKeyDown,
  onStartEdit,
}: EditableRowProps) {
  if (isEditing) {
    return (
      <div className="flex items-baseline gap-1.5">
        <span className="text-xs text-muted-foreground w-16 shrink-0">{label}</span>
        <Input
          ref={editInputRef as React.RefObject<HTMLInputElement>}
          type={inputType}
          value={editValue}
          onChange={(e) => onEditValueChange(e.target.value)}
          onBlur={() => onSave(field, editValue.trim())}
          onKeyDown={(e) => onKeyDown(e, field, editValue)}
          placeholder={placeholder}
          className="flex-1"
        />
      </div>
    )
  }
  return (
    <div
      className="flex items-baseline gap-1.5 group cursor-pointer"
      onClick={onStartEdit}
    >
      <span className="text-xs text-muted-foreground w-16 shrink-0">{label}</span>
      <span className={cn("text-sm", !displayValue && "text-muted-foreground/60 italic")}>
        {displayValue || placeholder}
      </span>
      <PencilIcon className="size-3 text-muted-foreground opacity-0 group-hover:opacity-100 ml-auto" />
    </div>
  )
}

interface HeroCardProps {
  item: ItemUnit
  rooms: Room[]
  homeId: string
  userId: string | undefined
  allHomeTags: string[]
  onItemUpdate: (item: ItemUnit) => void
  onTagsChange: (tags: string[]) => void
  onDelete: () => void
  deleting: boolean
  /** When true, renders in sidebar layout: full-width photo, details always open on lg+ */
  sidebarMode?: boolean
}

export function HeroCard({
  item,
  rooms,
  homeId,
  userId,
  allHomeTags,
  onItemUpdate,
  onTagsChange,
  onDelete,
  deleting,
  sidebarMode,
}: HeroCardProps) {
  const [editingField, setEditingField] = useState<EditableField | null>(null)
  const [editValue, setEditValue] = useState("")
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [receiptUploading, setReceiptUploading] = useState(false)
  const [receiptError, setReceiptError] = useState<string | null>(null)
  const [editingTags, setEditingTags] = useState(false)
  const [tagInput, setTagInput] = useState("")
  const [photoSearchOpen, setPhotoSearchOpen] = useState(false)

  const editInputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)
  const tagInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editingField && editInputRef.current) {
      editInputRef.current.focus()
    }
  }, [editingField])

  const photoUrl = getPhotoUrl(item.photo_storage_ref ?? null)
  const roomName = rooms.find((r) => r.room_id === item.room_id)?.name ?? "No room"

  // Build a search query from brand + model, falling back to display name
  const photoSearchQuery = [item.brand, item.model].filter(Boolean).join(" ").trim()
    || item.display_name || ""

  const handlePhotoSearchSaved = (path: string) => {
    onItemUpdate({ ...item, photo_storage_ref: path })
  }

  const saveField = async (field: EditableField, value: string | null) => {
    setFieldError(null)
    const payload: Record<string, unknown> = { [field]: value ?? null }
    if (field === "purchase_date" || field === "install_date") {
      payload[field] = value && value.trim() ? value.trim() : null
    }
    if (field === "price_paid") {
      const n = value ? parseFloat(value.replace(/[^0-9.]/g, "")) : NaN
      payload[field] = isNaN(n) ? null : n
    }
    if (field === "warranty_duration_months") {
      const n = value ? parseInt(value, 10) : NaN
      payload[field] = isNaN(n) ? null : n
    }
    if (field === "manufactured_year") {
      const n = value ? parseInt(value, 10) : NaN
      const thisYear = new Date().getUTCFullYear()
      // Reject out-of-range input at the client too; the DB CHECK (1900..2100)
      // will reject it anyway, but surfacing a friendly error is better UX.
      if (!Number.isFinite(n)) {
        payload[field] = null
      } else if (n < 1900 || n > thisYear + 1) {
        setFieldError(`Year must be between 1900 and ${thisYear + 1}.`)
        return
      } else {
        payload[field] = n
      }
    }
    if (field === "warranty_expiry_date") {
      payload[field] = value && value.trim() ? value.trim() : null
    }
    if (field === "room_id") {
      payload.room_id = value && value !== ROOM_NONE && value.trim() ? value.trim() : null
    }
    const res = await updateItemUnit(homeId, item.item_unit_id, payload)
    if (res.error) {
      setFieldError(res.error.message)
      return
    }
    if (res.data) onItemUpdate(res.data)
    setEditingField(null)
  }

  const startEdit = (field: EditableField, current: string | null) => {
    setFieldError(null)
    setEditingField(field)
    const val = field === "room_id"
      ? (current && rooms.some((r) => r.room_id === current) ? current : ROOM_NONE)
      : (current ?? "")
    setEditValue(val)
  }

  const handleKeyDown = (
    e: React.KeyboardEvent,
    field: EditableField,
    value: string
  ) => {
    if (e.key === "Enter" && field !== "notes") saveField(field, value.trim() || null)
    if (e.key === "Escape") setEditingField(null)
  }

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const res = await uploadItemPhoto(homeId, item.item_unit_id, file, userId ?? null)
    if (res.data) {
      onItemUpdate({ ...item, photo_storage_ref: res.data.path })
    }
    e.target.value = ""
  }

  const handleReceiptSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setReceiptError(null)
    setReceiptUploading(true)
    const res = await uploadReceiptImage(item.item_unit_id, file, userId ?? null)
    if (res.error) {
      setReceiptError(res.error.message)
      setReceiptUploading(false)
      e.target.value = ""
      return
    }
    const updateRes = await updateItemUnit(homeId, item.item_unit_id, { receipt_storage_path: res.data!.path })
    setReceiptUploading(false)
    if (updateRes.data) onItemUpdate(updateRes.data)
    e.target.value = ""
  }

  const addTag = async (tag: string) => {
    const normalized = tag.trim().toLowerCase()
    if (!normalized || item.tags.includes(normalized)) return
    const newTags = [...item.tags, normalized]
    const res = await updateItemUnit(homeId, item.item_unit_id, { tags: newTags })
    if (res.data) {
      onItemUpdate(res.data)
      onTagsChange([...new Set([...allHomeTags, normalized])].sort())
    }
    setTagInput("")
  }

  const removeTag = async (tag: string) => {
    const newTags = item.tags.filter((t) => t !== tag)
    const res = await updateItemUnit(homeId, item.item_unit_id, { tags: newTags })
    if (res.data) onItemUpdate(res.data)
  }

  /** Helper to create shared EditableRow props */
  const editableRowProps = (field: EditableField, rawValue: string | null) => ({
    isEditing: editingField === field,
    editValue,
    editInputRef,
    onEditValueChange: setEditValue,
    onSave: saveField,
    onKeyDown: handleKeyDown,
    onStartEdit: () => startEdit(field, rawValue),
  })

  return (
    <SectionCard className="p-3 sm:p-5">
      {fieldError && editingField && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/5 px-4 py-2 text-sm text-destructive mb-3">
          {fieldError}
        </div>
      )}
      {/* Sidebar mode on lg+: photo full-width above info. Mobile/non-sidebar: horizontal */}
      {/* Full-width photo for sidebar desktop */}
      {sidebarMode && (
        <div className="hidden lg:block mb-3">
          {photoUrl ? (
            <div className="relative group/photo rounded-xl overflow-hidden bg-white aspect-square">
              <img
                src={photoUrl}
                alt={item.display_name}
                className="w-full h-full object-contain mix-blend-multiply"
              />
              <div className="absolute inset-0 bg-black/0 group-hover/photo:bg-black/30 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover/photo:opacity-100">
                <label className="cursor-pointer p-2 rounded-full bg-white/85 hover:bg-white transition-colors">
                  <CameraIcon className="size-4 text-foreground" />
                  <input type="file" accept="image/*" className="hidden" onChange={handlePhotoSelect} />
                </label>
                <button
                  type="button"
                  onClick={() => setPhotoSearchOpen(true)}
                  className="p-2 rounded-full bg-white/85 hover:bg-white transition-colors"
                  aria-label="Search for product photo"
                >
                  <SearchIcon className="size-4 text-foreground" />
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <label className="flex w-full aspect-square rounded-xl border-2 border-dashed border-muted-foreground/30 items-center justify-center cursor-pointer hover:border-muted-foreground/50 transition-colors">
                <CameraIcon className="size-8 text-muted-foreground" />
                <input type="file" accept="image/*" className="hidden" onChange={handlePhotoSelect} />
              </label>
              <button
                type="button"
                onClick={() => setPhotoSearchOpen(true)}
                className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors min-h-11 px-3"
              >
                <SearchIcon className="size-3" />
                Find photo
              </button>
            </div>
          )}
        </div>
      )}

      {/* Horizontal layout: photo left + info right (mobile always, desktop non-sidebar) */}
      <div className={cn("flex gap-3 sm:gap-4", sidebarMode && "lg:block")}>
        {/* Inline photo — hidden on lg when sidebar mode (shown full-width above) */}
        <div className={cn("shrink-0", sidebarMode && "lg:hidden")}>
          {photoUrl ? (
            <div className="relative group/photo">
              <img
                src={photoUrl}
                alt={item.display_name}
                className="w-[72px] h-[72px] sm:w-28 sm:h-28 rounded-xl object-contain mix-blend-multiply bg-white"
              />
              <div className="absolute inset-0 rounded-xl bg-black/0 group-hover/photo:bg-black/30 transition-colors flex items-center justify-center gap-1 opacity-0 group-hover/photo:opacity-100">
                <label className="cursor-pointer p-2.5 rounded-full bg-white/80 hover:bg-white transition-colors">
                  <CameraIcon className="size-3.5 text-foreground" />
                  <input type="file" accept="image/*" className="hidden" onChange={handlePhotoSelect} />
                </label>
                <button
                  type="button"
                  onClick={() => setPhotoSearchOpen(true)}
                  className="p-2.5 rounded-full bg-white/80 hover:bg-white transition-colors"
                  aria-label="Search for product photo"
                >
                  <SearchIcon className="size-3.5 text-foreground" />
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1">
              <label className="flex w-[72px] h-[72px] sm:w-28 sm:h-28 rounded-xl border-2 border-dashed border-muted-foreground/30 items-center justify-center cursor-pointer hover:border-muted-foreground/50 transition-colors">
                <CameraIcon className="size-6 text-muted-foreground" />
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handlePhotoSelect}
                />
              </label>
              <button
                type="button"
                onClick={() => setPhotoSearchOpen(true)}
                className="text-[11px] text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors min-h-11 px-3"
              >
                <SearchIcon className="size-3" />
                Find photo
              </button>
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          {/* Display name */}
          {editingField === "display_name" ? (
            <Input
              ref={editInputRef as React.RefObject<HTMLInputElement>}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={() => saveField("display_name", editValue.trim())}
              onKeyDown={(e) => handleKeyDown(e, "display_name", editValue)}
              className="text-lg font-semibold h-8"
            />
          ) : (
            <div className="flex items-start gap-2 justify-between">
              <div
                className="flex items-center gap-1.5 group cursor-pointer min-w-0"
                onClick={() => startEdit("display_name", item.display_name)}
              >
                <span className="text-lg font-semibold truncate leading-tight">{item.display_name || "Untitled"}</span>
                <PencilIcon className="size-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0" />
              </div>
              {deleteConfirm ? (
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-xs text-muted-foreground">Delete?</span>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="h-11 md:h-6 px-3 md:px-2 text-sm md:text-xs"
                    disabled={deleting}
                    onClick={onDelete}
                  >
                    {deleting ? <Loader2Icon className="size-3 animate-spin" /> : "Yes"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-11 md:h-6 px-3 md:px-2 text-sm md:text-xs"
                    onClick={() => setDeleteConfirm(false)}
                  >
                    No
                  </Button>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-11 w-11 md:h-6 md:w-6 p-0 text-muted-foreground/50 hover:text-destructive shrink-0 -mr-2 md:mr-0"
                  onClick={() => setDeleteConfirm(true)}
                  aria-label="Delete item"
                >
                  <Trash2Icon className="size-3.5" />
                </Button>
              )}
            </div>
          )}

          {/* Brand · Model inline */}
          <div className="flex items-center gap-1 text-[12px] text-muted-foreground mt-1 truncate">
            {item.brand && <span>{item.brand}</span>}
            {item.brand && item.model && <span className="text-muted-foreground/40">·</span>}
            {item.model && <span>{item.model}</span>}
          </div>

          {/* Details toggle — hidden on desktop in sidebar mode (details always shown) */}
          <button
            type="button"
            className={cn(
              "text-[11px] text-muted-foreground hover:text-foreground mt-1.5 flex items-center gap-1 min-h-11 -ml-1 px-1",
              sidebarMode && "lg:hidden"
            )}
            onClick={() => setDetailsOpen((o) => !o)}
          >
            {detailsOpen ? "Hide details" : "Details ›"}
          </button>
        </div>
      </div>

      {/* Expandable details drawer — always visible on desktop sidebar, toggle on mobile */}
      {(detailsOpen || sidebarMode) && (
        <div className={cn(
          "border-t border-white/60 mt-3 pt-3 space-y-1.5",
          sidebarMode && !detailsOpen && "hidden lg:block"
        )}>
          {/* Brand */}
          <EditableRow field="brand" label="Brand" displayValue={item.brand} placeholder="Add brand" {...editableRowProps("brand", item.brand)} />

          {/* Model */}
          <EditableRow field="model" label="Model" displayValue={item.model} placeholder="Add model" {...editableRowProps("model", item.model)} />

          {/* Category */}
          <EditableRow field="category" label="Category" displayValue={item.category} placeholder="Category" {...editableRowProps("category", item.category)} />

          {/* Room */}
          {editingField === "room_id" ? (
            <div className="flex items-baseline gap-1.5">
              <span className="text-xs text-muted-foreground w-16 shrink-0">Room</span>
              <Select
                value={editValue || ROOM_NONE}
                onValueChange={(v) => saveField("room_id", v === ROOM_NONE ? null : v)}
              >
                <SelectTrigger className="flex-1 max-w-[200px]">
                  <SelectValue placeholder="Room" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ROOM_NONE}>No room</SelectItem>
                  {rooms.map((r) => (
                    <SelectItem key={r.room_id} value={r.room_id}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div
              className="flex items-baseline gap-1.5 group cursor-pointer"
              onClick={() => startEdit("room_id", item.room_id)}
            >
              <span className="text-xs text-muted-foreground w-16 shrink-0">Room</span>
              <span className="text-sm">{roomName}</span>
              <PencilIcon className="size-3 text-muted-foreground opacity-0 group-hover:opacity-100 ml-auto" />
            </div>
          )}

          {/* Serial */}
          <EditableRow field="serial_number" label="Serial" displayValue={item.serial_number} placeholder="Add serial number" {...editableRowProps("serial_number", item.serial_number)} />

          {/* Purchase date */}
          <EditableRow field="purchase_date" label="Purchase" displayValue={formatDate(item.purchase_date)} placeholder="Add purchase date" inputType="date" {...editableRowProps("purchase_date", item.purchase_date)} />

          {/* Install date */}
          <EditableRow field="install_date" label="Install" displayValue={formatDate(item.install_date)} placeholder="Add install date" inputType="date" {...editableRowProps("install_date", item.install_date)} />

          {/* Manufactured year */}
          <EditableRow
            field="manufactured_year"
            label="Year made"
            displayValue={item.manufactured_year != null ? String(item.manufactured_year) : null}
            placeholder="Add year"
            inputType="number"
            {...editableRowProps(
              "manufactured_year",
              item.manufactured_year != null ? String(item.manufactured_year) : ""
            )}
          />

          {/* Status */}
          {editingField === "status" ? (
            <div className="flex items-baseline gap-1.5">
              <span className="text-xs text-muted-foreground w-16 shrink-0">Status</span>
              <Select
                value={editValue}
                onValueChange={(v) => saveField("status", v)}
              >
                <SelectTrigger className="w-28 h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">active</SelectItem>
                  <SelectItem value="stored">stored</SelectItem>
                  <SelectItem value="removed">removed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div
              className="flex items-baseline gap-1.5 group cursor-pointer"
              onClick={() => startEdit("status", item.status)}
            >
              <span className="text-xs text-muted-foreground w-16 shrink-0">Status</span>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-xs font-medium capitalize",
                  item.status === "active" &&
                    "bg-green-500/15 text-green-700 dark:text-green-400",
                  item.status === "stored" &&
                    "bg-amber-500/15 text-amber-700 dark:text-amber-400",
                  (item.status === "removed" || item.status === "sold") &&
                    "bg-muted text-muted-foreground"
                )}
              >
                {item.status}
              </span>
              <PencilIcon className="size-3 text-muted-foreground opacity-0 group-hover:opacity-100 ml-auto" />
            </div>
          )}

          {/* Store */}
          <EditableRow field="store_name" label="Store" displayValue={item.store_name} placeholder="Add store" {...editableRowProps("store_name", item.store_name)} />

          {/* Price */}
          <EditableRow
            field="price_paid"
            label="Price paid"
            displayValue={item.price_paid != null ? `$${item.price_paid.toFixed(2)}` : null}
            placeholder="Add price"
            {...editableRowProps("price_paid", item.price_paid != null ? String(item.price_paid) : "")}
          />

          {/* Receipt */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground w-16 shrink-0">Receipt</span>
            <div className="flex items-center gap-2 flex-1">
              {item.receipt_storage_path ? (
                <a
                  href={`${import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, "")}/storage/v1/object/public/Manuals/${item.receipt_storage_path.replace(/^\//, "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary underline underline-offset-2 truncate max-w-[160px]"
                >
                  View receipt
                </a>
              ) : (
                <span className="text-sm text-muted-foreground/60 italic">No receipt</span>
              )}
              <label className="ml-auto cursor-pointer">
                <input
                  type="file"
                  accept="image/*,.pdf"
                  className="hidden"
                  onChange={handleReceiptSelect}
                  disabled={receiptUploading}
                />
                <span className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                  {receiptUploading ? (
                    <Loader2Icon className="size-3 animate-spin" />
                  ) : (
                    <FileUpIcon className="size-3" />
                  )}
                  {item.receipt_storage_path ? "Replace" : "Upload"}
                </span>
              </label>
            </div>
          </div>
          {receiptError && (
            <p className="text-xs text-destructive">{receiptError}</p>
          )}

          {/* Warranty section */}
          <div className="border-t border-white/60 pt-2.5 mt-2">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Warranty</span>
            <div className="mt-1.5 space-y-1.5">
              <EditableRow
                field="warranty_expiry_date"
                label="Expires"
                displayValue={(() => {
                  if (!item.warranty_expiry_date) return null
                  const d = formatDate(item.warranty_expiry_date)
                  const days = Math.ceil((new Date(item.warranty_expiry_date).getTime() - Date.now()) / 86_400_000)
                  if (days < 0) return `${d} (expired)`
                  if (days <= 90) return `${d} (${days}d left)`
                  return d
                })()}
                placeholder="Add expiry date"
                inputType="date"
                {...editableRowProps("warranty_expiry_date", item.warranty_expiry_date)}
              />
              <EditableRow
                field="warranty_duration_months"
                label="Duration"
                displayValue={item.warranty_duration_months != null ? `${item.warranty_duration_months} months` : null}
                placeholder="Months"
                inputType="number"
                {...editableRowProps("warranty_duration_months", item.warranty_duration_months != null ? String(item.warranty_duration_months) : "")}
              />
              <EditableRow
                field="warranty_coverage"
                label="Coverage"
                displayValue={item.warranty_coverage}
                placeholder="What's covered"
                {...editableRowProps("warranty_coverage", item.warranty_coverage)}
              />
            </div>
          </div>

          {/* Tags — inside details drawer */}
          <div className="border-t border-white/60 pt-2.5 mt-2">
            <div className="flex items-start gap-1.5 flex-wrap min-h-[28px]">
              <span className="text-xs text-muted-foreground w-16 shrink-0 pt-1">Tags</span>
              <div className="flex items-center gap-1.5 flex-wrap flex-1">
                {(item.tags ?? []).map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 text-xs rounded-full border border-white/60 bg-white/40 px-2 py-0.5 font-medium text-foreground/80"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => removeTag(tag)}
                      className="text-muted-foreground hover:text-destructive transition-colors leading-none min-h-[24px] min-w-[24px] inline-flex items-center justify-center"
                      aria-label={`Remove tag ${tag}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
                {editingTags ? (
                  <div className="relative">
                    <input
                      ref={tagInputRef}
                      type="text"
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === ",") {
                          e.preventDefault()
                          void addTag(tagInput)
                        }
                        if (e.key === "Escape") {
                          setEditingTags(false)
                          setTagInput("")
                        }
                      }}
                      onBlur={() => {
                        if (tagInput.trim()) void addTag(tagInput)
                        else { setEditingTags(false) }
                      }}
                      placeholder="Add tag..."
                      className="text-xs border border-input rounded-full px-3 py-0.5 bg-background w-28 focus:outline-none focus:ring-1 focus:ring-primary"
                      list="tag-suggestions"
                      autoComplete="off"
                    />
                    <datalist id="tag-suggestions">
                      {allHomeTags
                        .filter((t) => !item.tags.includes(t) && t.includes(tagInput.toLowerCase()))
                        .map((t) => <option key={t} value={t} />)}
                    </datalist>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingTags(true)
                      setTimeout(() => tagInputRef.current?.focus(), 0)
                    }}
                    className="text-xs text-muted-foreground/60 hover:text-primary border border-dashed border-white/50 hover:border-primary rounded-full px-3 py-1.5 min-h-11 transition-colors"
                  >
                    + tag
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      <PhotoSearchSheet
        open={photoSearchOpen}
        onOpenChange={setPhotoSearchOpen}
        defaultQuery={photoSearchQuery}
        homeId={homeId}
        itemId={item.item_unit_id}
        userId={userId}
        onPhotoSaved={handlePhotoSearchSaved}
      />
    </SectionCard>
  )
}
