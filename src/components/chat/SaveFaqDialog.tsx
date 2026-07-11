import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { saveFaq } from "@/modules/knowledge"
import { getItemUnits } from "@/modules/items"
import type { ItemUnit } from "@/integrations/types"

type SaveFaqDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  question: string
  answer: string
  homeId: string
  defaultItemUnitId: string | null
  onSaved: (question: string, answer: string, itemUnitId: string | null) => void
}

const HOME_OPTION = "__home__"

export function SaveFaqDialog({
  open,
  onOpenChange,
  question,
  answer,
  homeId,
  defaultItemUnitId,
  onSaved,
}: SaveFaqDialogProps) {
  const [itemUnitId, setItemUnitId] = useState<string | null>(defaultItemUnitId)
  const [items, setItems] = useState<ItemUnit[]>([])
  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!open || !homeId) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setItemUnitId(defaultItemUnitId)
    setSaved(false)
    getItemUnits(homeId).then((r) => setItems(r.data ?? []))
  }, [open, homeId, defaultItemUnitId])

  const handleSave = async () => {
    if (!homeId || !question.trim() || !answer.trim()) return
    setLoading(true)
    const result = await saveFaq({
      home_id: homeId,
      item_unit_id: itemUnitId === HOME_OPTION || !itemUnitId ? null : itemUnitId,
      question: question.trim(),
      answer: answer.trim(),
    })
    setLoading(false)
    if (result.error) {
      return
    }
    setSaved(true)
    onSaved(question, answer, itemUnitId === HOME_OPTION || !itemUnitId ? null : itemUnitId)
    setTimeout(() => {
      onOpenChange(false)
    }, 600)
  }

  const selectValue = itemUnitId === null || itemUnitId === HOME_OPTION ? HOME_OPTION : itemUnitId

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" showCloseButton aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Save to knowledge base</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div>
            <Label className="text-muted-foreground text-xs">Question</Label>
            <p className="text-sm mt-0.5 line-clamp-2">{question || "—"}</p>
          </div>
          <div>
            <Label className="text-muted-foreground text-xs">Answer</Label>
            <p className="text-sm mt-0.5 line-clamp-3">{answer || "—"}</p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="faq-item">Link to item (optional)</Label>
            <Select
              value={selectValue}
              onValueChange={(v) => setItemUnitId(v === HOME_OPTION ? null : v)}
            >
              <SelectTrigger id="faq-item" className="w-full">
                <SelectValue placeholder="Choose item" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={HOME_OPTION}>Home (not item-specific)</SelectItem>
                {items.map((i) => (
                  <SelectItem key={i.item_unit_id} value={i.item_unit_id}>
                    {i.display_name}
                    {[i.brand, i.model].filter(Boolean).length > 0 &&
                      ` (${[i.brand, i.model].filter(Boolean).join(" ")})`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter showCloseButton={false}>
          {saved ? (
            <span className="text-sm text-muted-foreground">Saved</span>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={loading}>
                {loading ? "Saving…" : "Save"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
