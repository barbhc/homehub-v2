import { useState, useEffect, useRef } from "react"
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
import { InlineError } from "@/components/layout/LoadStates"
import { saveFaq } from "@/modules/knowledge"
import { getItemUnits } from "@/modules/items"
import type { ItemUnit } from "@/integrations/types"

type SaveFaqDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  question: string
  answer: string
  homeId: string
  /** The item the conversation is about, preselected. null = the person picks one. */
  defaultItemUnitId: string | null
  onSaved: (question: string, answer: string, itemUnitId: string | null) => void
}

/** What a failed save says. The dialog stays open with the choice intact. */
export const SAVE_FAQ_ERROR = "Couldn't save your answer. Check your connection and try again."
/** What a failed item list says — without it the picker is an empty dead end. */
export const SAVE_FAQ_ITEMS_ERROR = "Couldn't load your items."

/**
 * Saves an Ask answer onto an ITEM — its page is where saved answers are shown
 * (the "Saved answers" tab on desktop, "Saved Q&A" on the phone).
 *
 * There is no whole-home choice any more. "Home (not item-specific)" saved
 * answers that only the Care Guide page (/faq) listed, and that page is gone
 * (audit 2026-09-29, D5) — so a whole-home save would have been written and
 * then never shown anywhere. Existing whole-home answers were copied into
 * House notes by scripts/ops/migrate-whole-home-faq.ts.
 *
 * ONE instance per page (ChatPage owns it). Each answer bubble used to carry
 * its own copy and hand its `onSaved` to the page, which opened the page's copy
 * with the same answer and a live Save — so one save showed two dialogs, and a
 * second tap wrote the answer twice (audit H6).
 *
 * A failed save is said in the dialog, which stays open with the chosen item so
 * Save can simply be pressed again. It used to return silently: the button came
 * back and nothing explained why the dialog had not closed.
 */
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
  const [itemsError, setItemsError] = useState<string | null>(null)
  const [itemsAttempt, setItemsAttempt] = useState(0)
  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  /** One write per answer: a second tap while the first save is in flight must
   *  not start another (state alone flips a render too late for a fast tap). */
  const savingRef = useRef(false)

  useEffect(() => {
    if (!open || !homeId) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setItemUnitId(defaultItemUnitId)
    setSaved(false)
    setSaveError(null)
  }, [open, homeId, defaultItemUnitId])

  useEffect(() => {
    if (!open || !homeId) return
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setItemsError(null)
    void getItemUnits(homeId).then((r) => {
      if (cancelled) return
      if (r.error) {
        console.warn(`[ask] could not load items for saving an answer (home ${homeId}):`, r.error.message)
        setItemsError(SAVE_FAQ_ITEMS_ERROR)
        return
      }
      setItems(r.data ?? [])
    })
    return () => { cancelled = true }
  }, [open, homeId, itemsAttempt])

  const handleSave = async () => {
    if (savingRef.current || saved) return
    if (!homeId || !itemUnitId || !question.trim() || !answer.trim()) return
    savingRef.current = true
    setLoading(true)
    setSaveError(null)
    const result = await saveFaq({
      home_id: homeId,
      item_unit_id: itemUnitId,
      question: question.trim(),
      answer: answer.trim(),
    })
    savingRef.current = false
    setLoading(false)
    if (result.error) {
      console.warn(`[ask] could not save an answer to item ${itemUnitId} (home ${homeId}):`, result.error.message)
      setSaveError(SAVE_FAQ_ERROR)
      return
    }
    setSaved(true)
    onSaved(question, answer, itemUnitId)
    setTimeout(() => {
      onOpenChange(false)
    }, 600)
  }

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
            <Label htmlFor="faq-item">Item</Label>
            <Select
              // "" shows the placeholder: nothing is chosen until the person
              // picks, because there is no longer a whole-home default.
              value={itemUnitId ?? ""}
              onValueChange={(v) => {
                setItemUnitId(v || null)
                setSaveError(null)
              }}
            >
              <SelectTrigger id="faq-item" className="w-full">
                <SelectValue placeholder="Choose an item" />
              </SelectTrigger>
              <SelectContent>
                {items.map((i) => (
                  <SelectItem key={i.item_unit_id} value={i.item_unit_id}>
                    {i.display_name}
                    {[i.brand, i.model].filter(Boolean).length > 0 &&
                      ` (${[i.brand, i.model].filter(Boolean).join(" ")})`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {itemsError ? (
              <InlineError onRetry={() => setItemsAttempt((n) => n + 1)}>{itemsError}</InlineError>
            ) : (
              <p className="text-xs text-muted-foreground">Saved answers show on the item&apos;s page.</p>
            )}
          </div>
          {saveError && <InlineError>{saveError}</InlineError>}
        </div>
        <DialogFooter showCloseButton={false}>
          {saved ? (
            <span className="text-sm text-muted-foreground">Saved</span>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={loading || !itemUnitId}>
                {loading ? "Saving…" : "Save"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
