import { useMemo, useState } from "react"
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  monthGrid,
  monthLabel,
  parseIso,
  shiftMonth,
  formatIsoShort,
} from "@/lib/monthGrid"

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"]

interface DateFieldProps {
  id?: string
  /** ISO `YYYY-MM-DD`, or empty. */
  value: string
  onChange: (iso: string) => void
  placeholder?: string
  /** ISO date after which selection is refused — defaults to today. */
  max?: string
  className?: string
}

/**
 * A date field that opens a month grid in place.
 *
 * `<input type="date">` was what this used to be, and on iOS it opens a wheel
 * you scroll three columns of to land on a date two months back — which is
 * where nearly every purchase date lives. A month grid is one tap once you are
 * on the right page, and it looks the same on every platform, which the native
 * control emphatically does not.
 *
 * The grid is always six rows so the buttons don't move under your thumb when
 * you page between a 4-row and a 5-row month.
 */
export function DateField({
  id,
  value,
  onChange,
  placeholder = "Choose a date",
  max,
  className,
}: DateFieldProps) {
  const selected = parseIso(value)
  const today = useMemo(() => {
    const now = new Date()
    return {
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      iso: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`,
    }
  }, [])

  const [open, setOpen] = useState(false)
  const [view, setView] = useState(() =>
    selected ? { year: selected.year, month: selected.month } : { year: today.year, month: today.month }
  )

  const ceiling = max ?? today.iso
  const cells = useMemo(() => monthGrid(view.year, view.month), [view])

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <button
        type="button"
        id={id}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={cn(
          "flex h-11 w-full items-center justify-between rounded-md border px-3 text-base shadow-xs transition-colors md:h-9 md:text-sm",
          open ? "border-primary" : "border-input",
          value ? "text-foreground" : "text-muted-foreground"
        )}
      >
        {value ? formatIsoShort(value) : placeholder}
        <CalendarIcon className={cn("size-5 shrink-0", open ? "text-primary" : "text-muted-foreground")} />
      </button>

      {open && (
        <div className="rounded-xl border bg-card p-3 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-base font-semibold">{monthLabel(view.year, view.month)}</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setView((v) => shiftMonth(v.year, v.month, -1))}
                aria-label="Previous month"
                className="flex size-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:size-9"
              >
                <ChevronLeftIcon className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => setView((v) => shiftMonth(v.year, v.month, 1))}
                aria-label="Next month"
                className="flex size-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:size-9"
              >
                <ChevronRightIcon className="size-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-0.5 text-center">
            {WEEKDAYS.map((d, i) => (
              <span key={i} className="py-1 text-xs text-muted-foreground">
                {d}
              </span>
            ))}
            {cells.map((cell) => {
              const isSelected = cell.iso === value
              const isFuture = cell.iso > ceiling
              return (
                <button
                  key={cell.iso}
                  type="button"
                  disabled={isFuture}
                  onClick={() => {
                    onChange(cell.iso)
                    setOpen(false)
                  }}
                  aria-label={formatIsoShort(cell.iso)}
                  aria-current={isSelected ? "date" : undefined}
                  className={cn(
                    "rounded-md py-2 text-sm transition-colors",
                    isSelected && "bg-primary font-semibold text-primary-foreground",
                    !isSelected && cell.inMonth && "hover:bg-muted",
                    !isSelected && !cell.inMonth && "text-muted-foreground/45 hover:bg-muted",
                    isFuture && "cursor-not-allowed opacity-35 hover:bg-transparent"
                  )}
                >
                  {cell.day}
                </button>
              )
            })}
          </div>

          {value && (
            <button
              type="button"
              onClick={() => {
                onChange("")
                setOpen(false)
              }}
              className="mt-2 w-full rounded-md py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  )
}
