import { useState } from "react"
import { Loader2Icon } from "lucide-react"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
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
/** Minimal room/location shape — works with both Room and Location types */
type RoomOption = { id: string; name: string }

const SCHEDULE_OPTIONS = [
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "semiannual", label: "Every 6 months" },
  { value: "annual", label: "Yearly" },
  { value: "as_needed", label: "As needed" },
] as const

const TIER_OPTIONS = [
  { value: "essential", label: "Essential" },
  { value: "recommended", label: "Recommended" },
  { value: "optional", label: "Optional" },
] as const

const TYPE_OPTIONS = [
  { value: "maintenance", label: "Maintenance" },
  { value: "cleaning", label: "Cleaning" },
] as const

type AddTaskSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (data: {
    title: string
    scheduleType: string
    careType: "cleaning" | "maintenance" | "mixed"
    priorityTier: "essential" | "recommended" | "optional"
    estimatedMinutes: number | null
    roomId: string | null
  }) => Promise<void>
  rooms: RoomOption[]
}

export function AddTaskSheet({ open, onOpenChange, onSave, rooms }: AddTaskSheetProps) {
  const [title, setTitle] = useState("")
  const [scheduleType, setScheduleType] = useState("monthly")
  const [careType, setCareType] = useState<"cleaning" | "maintenance">("maintenance")
  const [priorityTier, setPriorityTier] = useState<"essential" | "recommended" | "optional">("recommended")
  const [minutes, setMinutes] = useState("")
  const [roomId, setRoomId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reset = () => {
    setTitle("")
    setScheduleType("monthly")
    setCareType("maintenance")
    setPriorityTier("recommended")
    setMinutes("")
    setRoomId(null)
    setError(null)
  }

  const handleSave = async () => {
    if (!title.trim()) {
      setError("Task name is required")
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onSave({
        title: title.trim(),
        scheduleType,
        careType,
        priorityTier,
        estimatedMinutes: minutes ? parseInt(minutes, 10) : null,
        roomId,
      })
      reset()
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create task")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={(next) => {
      if (!next) reset()
      onOpenChange(next)
    }}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Add Task</SheetTitle>
          <SheetDescription>
            Create a standalone home task — not tied to a specific item.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5 py-6">
          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="task-title">Task name</Label>
            <Input
              id="task-title"
              placeholder="e.g., Pest inspection for termites"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          </div>

          {/* Type */}
          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={careType} onValueChange={(v) => setCareType(v as "cleaning" | "maintenance")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Frequency */}
          <div className="space-y-2">
            <Label>Frequency</Label>
            <Select value={scheduleType} onValueChange={setScheduleType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SCHEDULE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Tier */}
          <div className="space-y-2">
            <Label>Priority</Label>
            <Select value={priorityTier} onValueChange={(v) => setPriorityTier(v as "essential" | "recommended" | "optional")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIER_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Room (optional) */}
          {rooms.length > 0 && (
            <div className="space-y-2">
              <Label>Room <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Select value={roomId ?? "__none__"} onValueChange={(v) => setRoomId(v === "__none__" ? null : v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No room (whole home)</SelectItem>
                  {rooms.map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Estimated time (optional) */}
          <div className="space-y-2">
            <Label htmlFor="task-minutes">
              Estimated time <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id="task-minutes"
                type="number"
                min={1}
                placeholder="15"
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
                className="w-24"
              />
              <span className="text-sm text-muted-foreground">minutes</span>
            </div>
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </div>

        <SheetFooter>
          <Button
            onClick={handleSave}
            disabled={saving || !title.trim()}
            className="w-full"
          >
            {saving && <Loader2Icon className="size-4 mr-2 animate-spin" />}
            {saving ? "Creating…" : "Create Task"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
