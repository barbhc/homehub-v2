import { useState } from "react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet"
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
import { createCareNote, updateCareNote, createTaskFromNote } from "@/modules/care"
import type { CareNote, CareNoteScope } from "@/integrations/types"
import type { ScheduleType } from "@/integrations/types"
import { supabase } from "@/integrations/shim/client"
import { Loader2Icon } from "lucide-react"

const CHUNK_TYPES = [
  { value: "care" as const, label: "Care" },
  { value: "how_to" as const, label: "How To" },
  { value: "troubleshooting" as const, label: "Troubleshooting" },
]

const TIER_OPTIONS = [
  { value: "essential" as const, label: "Essential" },
  { value: "recommended" as const, label: "Recommended" },
  { value: "optional" as const, label: "Optional" },
]

const SCHEDULE_OPTIONS: { value: ScheduleType; label: string }[] = [
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "semiannual", label: "Twice a year" },
  { value: "annual", label: "Yearly" },
  { value: "every_n_days", label: "Every N days" },
  { value: "as_needed", label: "As needed" },
]

export interface AddNoteSheetProps {
  open: boolean
  onClose: () => void
  homeId: string
  scope: CareNoteScope
  roomId?: string | null
  roomName?: string | null
  itemUnitId?: string | null
  itemName?: string | null
  onSaved: (note: CareNote) => void
}

export function AddNoteSheet({
  open,
  onClose,
  homeId,
  scope,
  roomId,
  roomName,
  itemUnitId,
  itemName,
  onSaved,
}: AddNoteSheetProps) {
  const [chunkType, setChunkType] = useState<"care" | "how_to" | "troubleshooting">("care")
  const [category, setCategory] = useState("")
  const [title, setTitle] = useState("")
  const [content, setContent] = useState("")
  const [createTask, setCreateTask] = useState(false)
  const [priorityTier, setPriorityTier] = useState<"essential" | "recommended" | "optional">(
    "recommended"
  )
  const [scheduleType, setScheduleType] = useState<ScheduleType>("monthly")
  const [intervalDays, setIntervalDays] = useState("30")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [importOpen, setImportOpen] = useState(false)
  const [importUrl, setImportUrl] = useState("")
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [importSuggestions, setImportSuggestions] = useState<
    Array<{ title: string; content: string; chunk_type: string; category?: string }>
  >([])

  const reset = () => {
    setChunkType("care")
    setCategory("")
    setTitle("")
    setContent("")
    setCreateTask(false)
    setPriorityTier("recommended")
    setScheduleType("monthly")
    setIntervalDays("30")
    setError(null)
    setImportUrl("")
    setImportError(null)
    setImportSuggestions([])
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const handleImportFetch = async () => {
    if (!importUrl.trim()) return
    setImporting(true)
    setImportError(null)
    setImportSuggestions([])
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await supabase.functions.invoke("import-care-url", {
        body: {
          url: importUrl.trim(),
          scope,
          context: roomId ? { room_name: roomName } : itemUnitId ? { item_name: itemName } : {},
        },
        headers: session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : undefined,
      })
      if (res.error) throw new Error(res.error.message ?? "Import failed")
      const body = res.data as { error?: string; suggestions?: typeof importSuggestions }
      if (body?.error) throw new Error(body.error)
      setImportSuggestions(Array.isArray(body?.suggestions) ? body.suggestions : [])
    } catch (e) {
      setImportError(e instanceof Error ? e.message : "Could not fetch URL")
    } finally {
      setImporting(false)
    }
  }

  const handleAddSuggestion = (s: { title: string; content: string; chunk_type: string }) => {
    setTitle(s.title)
    setContent(s.content)
    setChunkType(
      ["care", "how_to", "troubleshooting"].includes(s.chunk_type)
        ? (s.chunk_type as "care" | "how_to" | "troubleshooting")
        : "care"
    )
    setImportSuggestions((prev) => prev.filter((x) => x !== s))
  }

  const handleSave = async () => {
    const contentTrim = content.trim()
    if (!contentTrim) {
      setError("Content is required")
      return
    }
    setSaving(true)
    setError(null)
    try {
      const noteInput = {
        home_id: homeId,
        scope,
        room_id: scope === "room" ? roomId ?? null : null,
        item_unit_id: scope === "item_unit" ? itemUnitId ?? null : null,
        chunk_type: chunkType,
        category: scope === "home" && category.trim() ? category.trim() : null,
        title: title.trim() || null,
        content: contentTrim,
        source: "user" as const,
      }
      const createRes = await createCareNote(noteInput)
      if (createRes.error) throw new Error(createRes.error.message)
      const note = createRes.data!

      if (createTask) {
        const taskRes = await createTaskFromNote({
          homeId,
          roomId: scope === "room" ? roomId : null,
          itemUnitId: scope === "item_unit" ? itemUnitId : null,
          title: title.trim() || "Care task",
          description: contentTrim.slice(0, 500),
          priorityTier,
          careType: "cleaning",
          schedule: {
            scheduleType,
            intervalDays:
              scheduleType === "every_n_days"
                ? parseInt(intervalDays, 10) || 30
                : undefined,
          },
        })
        if (!taskRes.error && taskRes.data) {
          await updateCareNote(note.home_id, note.note_id, {
            task_template_id: taskRes.data.taskTemplateId,
          })
          onSaved({ ...note, task_template_id: taskRes.data.taskTemplateId })
        } else {
          onSaved(note)
        }
      } else {
        onSaved(note)
      }
      handleClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && handleClose()}>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Add care tip</SheetTitle>
        </SheetHeader>
        <div className="space-y-4 py-4">
          <div>
            <Label>Type</Label>
            <Select value={chunkType} onValueChange={(v) => setChunkType(v as typeof chunkType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CHUNK_TYPES.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {scope === "home" && (
            <div>
              <Label htmlFor="category">Category (optional)</Label>
              <Input
                id="category"
                placeholder="e.g. Pest Control, Windows…"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              />
            </div>
          )}
          <div>
            <Label htmlFor="title">Title (optional)</Label>
            <Input
              id="title"
              placeholder="Short title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="content">Content *</Label>
            <textarea
              id="content"
              className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-base md:text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Describe the care tip…"
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          </div>

          <div className="border rounded-lg p-3 space-y-2">
            <button
              type="button"
              onClick={() => setImportOpen(!importOpen)}
              className="text-sm font-medium text-foreground hover:underline"
            >
              {importOpen ? "−" : "+"} Import from URL
            </button>
            {importOpen && (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Input
                    placeholder="https://…"
                    value={importUrl}
                    onChange={(e) => setImportUrl(e.target.value)}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleImportFetch}
                    disabled={importing}
                  >
                    {importing ? <Loader2Icon className="size-3 animate-spin" /> : "Fetch tips"}
                  </Button>
                </div>
                {importError && (
                  <p className="text-sm text-destructive">{importError}</p>
                )}
                {importSuggestions.length > 0 && (
                  <div className="space-y-1">
                    {importSuggestions.map((s, i) => (
                      <div
                        key={i}
                        className="border rounded p-2 text-sm flex justify-between items-start gap-2"
                      >
                        <div>
                          <div className="font-medium">{s.title}</div>
                          <div className="text-muted-foreground line-clamp-2">{s.content}</div>
                        </div>
                        <Button size="sm" variant="ghost" onClick={() => handleAddSuggestion(s)}>
                          Add
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="border rounded-lg p-3 space-y-3">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={createTask}
                onChange={(e) => setCreateTask(e.target.checked)}
              />
              <span className="text-sm font-medium">Create a task</span>
            </label>
            {createTask && (
              <div className="space-y-3 pl-6">
                <div>
                  <Label>Tier</Label>
                  <Select
                    value={priorityTier}
                    onValueChange={(v) => setPriorityTier(v as typeof priorityTier)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIER_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Schedule</Label>
                  <Select
                    value={scheduleType}
                    onValueChange={(v) => setScheduleType(v as ScheduleType)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SCHEDULE_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {scheduleType === "every_n_days" && (
                  <div>
                    <Label htmlFor="interval">Every N days</Label>
                    <Input
                      id="interval"
                      type="number"
                      min={1}
                      max={365}
                      value={intervalDays}
                      onChange={(e) => setIntervalDays(e.target.value)}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <SheetFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2Icon className="size-3 animate-spin" /> : null}
            Save
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
