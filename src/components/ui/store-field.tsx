import { useEffect, useMemo, useRef, useState } from "react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { suggestStores } from "@/lib/storeSuggestions"

interface StoreFieldProps {
  id?: string
  value: string
  onChange: (value: string) => void
  /** Every `store_name` already on this home's items. */
  homeEntries: readonly (string | null | undefined)[]
  placeholder?: string
  className?: string
}

/**
 * "Where you bought it", with the home's own answers offered back.
 *
 * Free text here is how a home ends up with "home depot", "Home Depot" and
 * "HomeDepot" as three retailers, which makes the field useless for grouping a
 * warranty view or answering "what did I buy at Costco". Offering last time's
 * spelling is what prevents it.
 *
 * It suggests; it never decides. The raw text is always the last row, so a
 * store we have never heard of takes one tap rather than a fight.
 */
export function StoreField({
  id,
  value,
  onChange,
  homeEntries,
  placeholder = "Store or site",
  className,
}: StoreFieldProps) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const suggestions = useMemo(
    () => suggestStores({ query: value, homeEntries }),
    [value, homeEntries]
  )

  // The journey gallery caught this: inside a sheet, this field sits last, so
  // the list opened below the fold behind the footer and was never seen — the
  // assertions passed because the options were in the DOM. Pull the field and
  // its list into view when it opens, which is what a native picker does.
  useEffect(() => {
    if (!open || suggestions.length === 0) return
    // Two details, both learned the hard way in the gallery:
    //  - "end", not "center": centring the FIELD leaves the list below it
    //    still clipped by the sheet's footer, which is the bug being fixed.
    //  - "auto", not "smooth": a smooth scroll IS an animation, and anything
    //    that cancels animations (Playwright's screenshot mode, and a user's
    //    prefers-reduced-motion) cancels it half-done or not at all.
    const id = requestAnimationFrame(() =>
      wrapRef.current?.scrollIntoView?.({ block: "end", behavior: "auto" })
    )
    return () => cancelAnimationFrame(id)
  }, [open, suggestions.length])

  return (
    <div ref={wrapRef} className={cn("flex flex-col gap-2", className)}>
      <Input
        id={id}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        maxLength={120}
        onChange={(e) => {
          onChange(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        // Blur closes the list, but not before a tap on a row can land.
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        className={cn(open && suggestions.length > 0 && "border-primary")}
      />

      {open && suggestions.length > 0 && (
        <ul className="overflow-hidden rounded-xl border bg-card shadow-sm" role="listbox">
          {suggestions.map((s) => {
            const isExact = s.value.toLowerCase() === value.trim().toLowerCase()
            return (
              <li key={`${s.isRaw ? "raw:" : ""}${s.value}`} className="border-t first:border-t-0">
                <button
                  type="button"
                  role="option"
                  aria-selected={isExact}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onChange(s.value)
                    setOpen(false)
                  }}
                  className={cn(
                    "flex min-h-11 w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted",
                    isExact && "bg-secondary"
                  )}
                >
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate text-base",
                      s.isRaw ? "text-muted-foreground" : "font-medium"
                    )}
                  >
                    {s.isRaw ? `Use "${s.value}" as typed` : s.value}
                  </span>
                  {s.uses > 0 && (
                    <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-primary">
                      {s.uses === 1 ? "Used once" : `Used ${s.uses}×`}
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
