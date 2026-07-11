import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { updateTaskSchedule } from "@/modules/care"
import type { PriorityTier, RiskLevel, ScheduleType } from "@/integrations/types"

const SCHEDULE_OPTIONS: { value: ScheduleType; label: string }[] = [
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "semiannual", label: "Twice a year" },
  { value: "annual", label: "Yearly" },
  { value: "after_each_use", label: "After each use" },
  { value: "every_n_days", label: "Every N days" },
  { value: "seasonal", label: "Seasonal" },
  { value: "as_needed", label: "As needed" },
]

const TIER_OPTIONS: { value: PriorityTier; label: string }[] = [
  { value: "essential", label: "Essential" },
  { value: "recommended", label: "Recommended" },
  { value: "optional", label: "Optional" },
]

const RISK_OPTIONS: { value: RiskLevel; label: string }[] = [
  { value: "comfort", label: "None" },
  { value: "performance", label: "Performance" },
  { value: "prevent_damage", label: "Prevent damage" },
  { value: "safety", label: "Safety" },
]

interface TaskEditPopoverProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  taskTemplateId: string
  currentTier: PriorityTier
  currentSchedule: { scheduleType: ScheduleType; intervalDays?: number }
  currentEstimatedMinutes?: number | null
  currentRiskLevel?: RiskLevel | null
  onUpdated: () => void
}

export function TaskEditPopover({
  open,
  onOpenChange,
  taskTemplateId,
  currentTier,
  currentSchedule,
  currentEstimatedMinutes,
  currentRiskLevel,
  onUpdated,
}: TaskEditPopoverProps) {
  const [tier, setTier] = useState<PriorityTier>(currentTier)
  const [scheduleType, setScheduleType] = useState<ScheduleType>(
    currentSchedule.scheduleType
  )
  const [intervalDays, setIntervalDays] = useState(
    String(currentSchedule.intervalDays ?? 30)
  )
  const [minutes, setMinutes] = useState<string>(
    currentEstimatedMinutes != null ? String(currentEstimatedMinutes) : ""
  )
  const [riskLevel, setRiskLevel] = useState<RiskLevel>(currentRiskLevel ?? "comfort")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTier(currentTier)
    setScheduleType(currentSchedule.scheduleType)
    setIntervalDays(String(currentSchedule.intervalDays ?? 30))
    setMinutes(currentEstimatedMinutes != null ? String(currentEstimatedMinutes) : "")
    setRiskLevel(currentRiskLevel ?? "comfort")
  }, [open, currentTier, currentSchedule, currentEstimatedMinutes, currentRiskLevel])

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    const schedule = {
      scheduleType,
      intervalDays:
        scheduleType === "every_n_days"
          ? parseInt(intervalDays, 10) || 30
          : undefined,
    }
    const res = await updateTaskSchedule(taskTemplateId, {
      priorityTier: tier,
      schedule,
      estimatedMinutes: minutes === "" ? null : Number(minutes),
      riskLevel,
    }, "manual")
    setSaving(false)
    if (res.error) {
      setError(res.error.message)
      return
    }
    onUpdated()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[320px]">
        <DialogHeader>
          <DialogTitle>Edit task</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>Tier</Label>
            <Select value={tier} onValueChange={(v) => setTier(v as PriorityTier)}>
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
              <Label htmlFor="interval-days">Interval (days)</Label>
              <Input
                id="interval-days"
                type="number"
                min={1}
                max={365}
                value={intervalDays}
                onChange={(e) => setIntervalDays(e.target.value)}
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Estimated duration (minutes)</Label>
            <Input
              type="number"
              min={1}
              max={480}
              placeholder="e.g. 15"
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              className="w-full"
            />
          </div>
          <div>
            <Label>Risk tag</Label>
            <Select value={riskLevel} onValueChange={(v) => setRiskLevel(v as RiskLevel)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RISK_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
