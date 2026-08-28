/**
 * BrandAutocomplete — custom suggestion dropdown for the Brand field.
 *
 * Why not <datalist>: iOS Safari's datalist is broken across versions (options
 * render above the keyboard but taps don't register / don't fill the input),
 * and inside a WKWebView — the Capacitor shell — datalist UI doesn't appear at
 * all. This is plain DOM, so it renders identically everywhere the app runs.
 *
 * Behavior contract:
 *  - filters COMMON_BRANDS as you type (prefix matches first, then contains)
 *  - tap / Enter fills the field; typing anything else keeps free text — the
 *    list assists, it never restricts
 *  - mousedown on an option is prevented from stealing focus so the input's
 *    blur can't close the list before the click lands (the exact failure mode
 *    iOS datalist has)
 *  - ArrowUp/Down + Enter + Escape for keyboard users; combobox ARIA wiring
 */
import { useMemo, useState } from "react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { COMMON_BRANDS } from "@/modules/inventory/constants/brands"

const MAX_SUGGESTIONS = 6

export function brandSuggestionsFor(query: string): string[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const starts: string[] = []
  const contains: string[] = []
  for (const b of COMMON_BRANDS) {
    const lower = b.toLowerCase()
    // HH-75: this used to skip any brand whose LOWERCASED form equalled the
    // query — meant as "don't re-suggest what they already typed". But the
    // comparison ignores case while the suggestion's whole value is the case:
    // typing "lg" matched "LG" here and dropped it, so the list went empty at
    // the exact moment the brand was complete, and the tap that would have
    // fixed "lg" to "LG" disappeared with it. Instant for a two-letter brand.
    // Only an EXACT match — same characters, same case — is nothing to offer.
    if (b === query.trim()) continue
    if (lower.startsWith(q)) starts.push(b)
    else if (lower.includes(q)) contains.push(b)
  }
  return [...starts, ...contains].slice(0, MAX_SUGGESTIONS)
}

type BrandAutocompleteProps = {
  id: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  required?: boolean
  /** Marks the field as still needed — used when a scan read the model and not
   *  the brand, so the gap is visible on the field and not only in a status
   *  line that scrolls away. */
  invalid?: boolean
}

export function BrandAutocomplete({ id, value, onChange, placeholder, required, invalid }: BrandAutocompleteProps) {
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(-1)

  const suggestions = useMemo(() => brandSuggestionsFor(value), [value])
  const show = open && suggestions.length > 0
  const listboxId = `${id}-listbox`

  const pick = (brand: string) => {
    onChange(brand)
    setOpen(false)
    setHighlight(-1)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!show) {
      if (e.key === "ArrowDown" && suggestions.length > 0) setOpen(true)
      return
    }
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setHighlight((h) => (h + 1) % suggestions.length)
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setHighlight((h) => (h <= 0 ? suggestions.length - 1 : h - 1))
    } else if (e.key === "Enter") {
      if (highlight >= 0 && highlight < suggestions.length) {
        e.preventDefault()
        pick(suggestions[highlight])
      }
    } else if (e.key === "Escape") {
      setOpen(false)
      setHighlight(-1)
    }
  }

  return (
    <div className="relative">
      <Input
        id={id}
        aria-invalid={invalid}
        className={cn(invalid && "border-destructive")}
        role="combobox"
        aria-expanded={show}
        aria-controls={listboxId}
        aria-autocomplete="list"
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          setOpen(true)
          setHighlight(-1)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          setOpen(false)
          setHighlight(-1)
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        maxLength={100}
        required={required}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="words"
        spellCheck={false}
      />
      {show && (
        <ul
          id={listboxId}
          role="listbox"
          aria-label="Brand suggestions"
          className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-border bg-card shadow-lg"
        >
          {suggestions.map((b, i) => (
            <li key={b} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={i === highlight}
                // Prevent the input's blur (which closes the list) from firing
                // before this option's click does — the tap must always land.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(b)}
                className={cn(
                  "w-full min-h-11 px-3 py-2.5 text-left text-sm text-foreground transition-colors",
                  i === highlight ? "bg-primary/10 text-primary" : "hover:bg-muted/60",
                )}
              >
                {b}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
