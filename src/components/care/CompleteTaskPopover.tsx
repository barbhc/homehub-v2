import { useState } from "react"
import { CalendarIcon, CheckCircle2Icon, Loader2Icon } from "lucide-react"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface CompleteTaskPopoverProps {
  /** The trigger element (e.g. a check circle button) */
  children: React.ReactNode
  onComplete: (completedAt: string, notes: string | null) => Promise<void>
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

export function CompleteTaskPopover({ children, onComplete }: CompleteTaskPopoverProps) {
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState(todayStr)
  const [notes, setNotes] = useState("")
  const [saving, setSaving] = useState(false)

  const handleOpen = (next: boolean) => {
    if (next) {
      setDate(todayStr())
      setNotes("")
    }
    setOpen(next)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      // Convert date to ISO timestamp at noon local time
      const completedAt = new Date(date + "T12:00:00").toISOString()
      await onComplete(completedAt, notes.trim() || null)
      setOpen(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        className="w-72 p-4"
        side="bottom"
        align="start"
        sideOffset={4}
      >
        <div className="space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle2Icon className="size-4 text-emerald-600" />
            <span className="text-sm font-semibold">Mark as done</span>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="complete-date" className="text-xs">
              <CalendarIcon className="size-3 inline mr-1" />
              Date completed
            </Label>
            <Input
              id="complete-date"
              type="date"
              value={date}
              max={todayStr()}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="complete-notes" className="text-xs">
              Notes <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Input
              id="complete-notes"
              placeholder="e.g., Replaced with OEM filters"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving || !date}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {saving && <Loader2Icon className="size-3.5 mr-1.5 animate-spin" />}
            {saving ? "Saving..." : "Done"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
