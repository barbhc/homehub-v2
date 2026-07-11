import { useState, useRef, useEffect } from "react"
import { PencilIcon, StickyNoteIcon } from "lucide-react"
import { SectionCard } from "@/components/layout"
import { cn } from "@/lib/utils"
import type { ItemUnit } from "@/integrations/types"
import { updateItemUnit } from "@/modules/items"

interface NotesCardProps {
  item: ItemUnit
  homeId: string
  onItemUpdate: (item: ItemUnit) => void
  className?: string
}

export function NotesCard({ item, homeId, onItemUpdate, className }: NotesCardProps) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(item.notes ?? "")
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setValue(item.notes ?? "")
  }, [item.notes])

  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus()
      textareaRef.current.setSelectionRange(value.length, value.length)
    }
  }, [editing, value.length])

  const save = async () => {
    setEditing(false)
    const trimmed = value.trim() || null
    if (trimmed === (item.notes ?? null)) return
    const res = await updateItemUnit(homeId, item.item_unit_id, { notes: trimmed })
    if (res.data) onItemUpdate(res.data)
  }

  return (
    <SectionCard className={cn("p-3 sm:p-4", className)}>
      <div className="flex items-center gap-1.5 mb-2">
        <StickyNoteIcon className="size-3.5 text-primary" />
        <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Notes</span>
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="ml-auto text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
          >
            <PencilIcon className="size-3" />
            Edit
          </button>
        )}
      </div>

      {editing ? (
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === "Escape") { setValue(item.notes ?? ""); setEditing(false) }
          }}
          placeholder="Add a note..."
          className="w-full min-h-[60px] rounded-lg border border-input bg-white/40 px-3 py-2 text-base md:text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-y"
        />
      ) : (
        <div
          className={cn(
            "text-sm leading-relaxed rounded-lg bg-white/40 border border-dashed border-white/60 px-3 py-2 min-h-[40px] cursor-pointer transition-colors hover:bg-white/60",
            !item.notes && "flex items-center"
          )}
          onClick={() => setEditing(true)}
        >
          {item.notes ? (
            <span className="whitespace-pre-wrap">{item.notes}</span>
          ) : (
            <span className="text-muted-foreground/50 italic text-xs">Click to add a note...</span>
          )}
        </div>
      )}
    </SectionCard>
  )
}
