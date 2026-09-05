import { useEffect, useRef, useState } from "react"
import { SearchIcon, XIcon } from "lucide-react"
import { cn } from "@/lib/utils"

type RoomOption = { room_id: string; name: string }
type ItemOption = { item_unit_id: string; display_name: string; brand: string | null; model: string | null }

type FilterBarProps = {
  rooms: RoomOption[]
  items: ItemOption[]
  selectedRoomIds: string[]
  selectedItemId: string | null
  onRoomToggle: (roomId: string) => void
  onItemSelect: (id: string | null) => void
  variant?: "full" | "centered" | "compact"
  /** True while the item list is still on its way — see itemsEmptyNote. */
  itemsLoading?: boolean
  /** Set when the item list FAILED to load; renders with a retry. */
  itemsError?: string | null
  onRetryItems?: () => void
}

/**
 * What the picker says when it has nothing to show.
 *
 * HH-149 (owner, 2026-09-05): typing "Dishw" said "No appliances match" while
 * her Dishwasher sat in Items. The matcher was fine — the LIST was empty,
 * because it was still loading or had failed and told only the console. Three
 * different facts had been collapsed into one confident sentence. "No
 * appliances match" is now said ONLY when the list actually arrived and really
 * has no match.
 */
function ItemsEmptyNote({ loading, error, onRetry, query, className }: {
  loading: boolean; error: string | null; onRetry?: () => void; query: string; className: string
}) {
  if (loading) return <div className={className}>Loading your items…</div>
  if (error) {
    return (
      <div className={className} role="alert">
        <span>Couldn&apos;t load your items.</span>{" "}
        {onRetry && (
          <button type="button" onClick={onRetry} className="font-bold underline underline-offset-2">
            Try again
          </button>
        )}
      </div>
    )
  }
  return <div className={className}>No appliances match &quot;{query}&quot;</div>
}

function itemLabel(item: ItemOption): string {
  const sub = [item.brand, item.model].filter(Boolean).join(" ")
  return sub ? `${item.display_name} (${sub})` : item.display_name
}

export function FilterBar({
  rooms,
  items,
  selectedRoomIds,
  selectedItemId,
  onRoomToggle,
  onItemSelect,
  variant = "full",
  itemsLoading = false,
  itemsError = null,
  onRetryItems,
}: FilterBarProps) {
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const selectedItem = selectedItemId ? items.find((i) => i.item_unit_id === selectedItemId) : null

  const filtered =
    query.trim().length >= 2
      ? items.filter((i) => {
          const q = query.toLowerCase()
          return (
            i.display_name.toLowerCase().includes(q) ||
            (i.brand ?? "").toLowerCase().includes(q) ||
            (i.model ?? "").toLowerCase().includes(q)
          )
        })
      : []

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value)
    setOpen(e.target.value.trim().length >= 2)
  }

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setOpen(false)
      inputRef.current?.blur()
    }
  }

  const handleSelectItem = (item: ItemOption) => {
    onItemSelect(item.item_unit_id)
    setQuery("")
    setOpen(false)
  }

  const handleClearItem = () => {
    onItemSelect(null)
    setQuery("")
    inputRef.current?.focus()
  }

  if (variant === "centered") {
    return (
      <div className="w-full max-w-[560px] flex flex-col gap-2">
        {rooms.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground w-9 shrink-0">
              Room
            </span>
            {rooms.map((room) => {
              const active = selectedRoomIds.includes(room.room_id)
              return (
                <button
                  key={room.room_id}
                  type="button"
                  onClick={() => onRoomToggle(room.room_id)}
                  className={cn(
                    "rounded-full text-xs px-3 py-1 border transition-colors whitespace-nowrap",
                    active
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-border hover:border-primary hover:text-primary"
                  )}
                >
                  {room.name}
                </button>
              )
            })}
          </div>
        )}
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground w-9 shrink-0">
            Item
          </span>
          <div ref={containerRef} className="relative flex-1">
            <div
              className={cn(
                "flex items-center gap-2 rounded-lg border bg-background px-3 h-8 text-sm transition-colors",
                open || selectedItemId ? "border-primary ring-1 ring-primary/20" : "border-border"
              )}
            >
              <SearchIcon className="size-3.5 text-muted-foreground shrink-0" />
              {selectedItem && !query ? (
                <span className="flex-1 truncate text-foreground text-xs font-medium text-primary">
                  {itemLabel(selectedItem)}
                </span>
              ) : (
                <input
                  ref={inputRef}
                  type="text"
                  className="flex-1 bg-transparent outline-none placeholder:text-muted-foreground/50 text-xs"
                  placeholder="Search appliances…"
                  value={query}
                  onChange={handleInputChange}
                  onFocus={() => { if (query.trim().length >= 2) setOpen(true) }}
                  onKeyDown={handleInputKeyDown}
                />
              )}
              {(selectedItemId || query) && (
                <button
                  type="button"
                  onClick={handleClearItem}
                  className="text-muted-foreground hover:text-foreground shrink-0"
                  aria-label="Clear item filter"
                >
                  <XIcon className="size-3.5" />
                </button>
              )}
            </div>
            {open && filtered.length > 0 && (
              <ul className="absolute top-full mt-1 left-0 right-0 z-50 rounded-lg border border-border bg-card shadow-lg max-h-48 overflow-y-auto">
                {filtered.map((item) => {
                  const sub = [item.brand, item.model].filter(Boolean).join(" ")
                  return (
                    <li key={item.item_unit_id}>
                      <button
                        type="button"
                        className="w-full text-left px-3 py-2.5 hover:bg-primary/5 transition-colors flex items-center justify-between gap-3"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => handleSelectItem(item)}
                      >
                        <span className="text-sm font-medium">{item.display_name}</span>
                        {sub && <span className="text-xs text-muted-foreground shrink-0">{sub}</span>}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
            {open && query.trim().length >= 2 && filtered.length === 0 && (
              <ItemsEmptyNote
                loading={itemsLoading} error={itemsError} onRetry={onRetryItems} query={query}
                className="absolute top-full mt-1 left-0 right-0 z-50 rounded-lg border border-border bg-card shadow-lg px-3 py-2 text-xs text-muted-foreground"
              />
            )}
          </div>
        </div>
      </div>
    )
  }

  if (variant === "compact") {
    return (
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-card shrink-0 overflow-x-auto [&::-webkit-scrollbar]:hidden scrollbar-none">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground shrink-0">
          Room
        </span>
        {rooms.map((room) => {
          const active = selectedRoomIds.includes(room.room_id)
          return (
            <button
              key={room.room_id}
              type="button"
              onClick={() => onRoomToggle(room.room_id)}
              className={cn(
                "rounded-full text-xs px-3 py-1 border transition-colors whitespace-nowrap shrink-0",
                active
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-border hover:border-primary"
              )}
            >
              {room.name}
            </button>
          )
        })}
        {rooms.length > 0 && <div className="w-px h-4 bg-border shrink-0 mx-1" />}
        <div ref={containerRef} className="relative shrink-0">
          <div
            className={cn(
              "flex items-center gap-1.5 rounded-full border bg-background px-3 h-7 text-xs transition-colors",
              open || selectedItemId ? "border-primary" : "border-border"
            )}
          >
            <SearchIcon className="size-3 text-muted-foreground shrink-0" />
            {selectedItem && !query ? (
              <span className="text-primary font-medium whitespace-nowrap max-w-[120px] truncate">
                {selectedItem.display_name}
              </span>
            ) : (
              <input
                ref={inputRef}
                type="text"
                className="bg-transparent outline-none placeholder:text-muted-foreground/50 w-28"
                placeholder="Search items…"
                value={query}
                onChange={handleInputChange}
                onFocus={() => { if (query.trim().length >= 2) setOpen(true) }}
                onKeyDown={handleInputKeyDown}
              />
            )}
            {(selectedItemId || query) && (
              <button
                type="button"
                onClick={handleClearItem}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Clear item filter"
              >
                <XIcon className="size-3" />
              </button>
            )}
          </div>
          {open && filtered.length > 0 && (
            <ul className="absolute top-full mt-1 left-0 z-50 rounded-lg border border-border bg-card shadow-lg max-h-48 overflow-y-auto min-w-[200px]">
              {filtered.map((item) => {
                const sub = [item.brand, item.model].filter(Boolean).join(" ")
                return (
                  <li key={item.item_unit_id}>
                    <button
                      type="button"
                      className="w-full text-left px-3 py-2 hover:bg-primary/5 transition-colors flex items-center justify-between gap-3"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleSelectItem(item)}
                    >
                      <span className="text-sm">{item.display_name}</span>
                      {sub && <span className="text-xs text-muted-foreground shrink-0">{sub}</span>}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          {open && query.trim().length >= 2 && filtered.length === 0 && (
            <ItemsEmptyNote
              loading={itemsLoading} error={itemsError} onRetry={onRetryItems} query={query}
              className="absolute top-full mt-1 left-0 z-50 rounded-lg border border-border bg-card shadow-lg px-3 py-2 text-xs text-muted-foreground min-w-[200px]"
            />
          )}
        </div>
      </div>
    )
  }

  // variant === "full" (default)
  return (
    <div className="flex flex-col gap-3 pb-3 shrink-0">
      {rooms.length > 0 && (
        <div className="flex items-start gap-3">
          <span className="text-xs text-muted-foreground pt-1.5 shrink-0 w-10">Rooms</span>
          <div className="flex flex-wrap gap-1.5">
            {rooms.map((room) => {
              const active = selectedRoomIds.includes(room.room_id)
              return (
                <button
                  key={room.room_id}
                  type="button"
                  onClick={() => onRoomToggle(room.room_id)}
                  className={cn(
                    "rounded-full text-xs px-3 py-1 border whitespace-nowrap transition-colors",
                    active
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-border hover:border-foreground"
                  )}
                >
                  {room.name}
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <span className="text-xs text-muted-foreground shrink-0 w-10">Item</span>
        <div ref={containerRef} className="relative flex-1 max-w-sm">
          <div
            className={cn(
              "flex items-center gap-2 rounded-md border bg-background px-3 h-8 text-sm transition-colors",
              open || selectedItemId
                ? "border-primary ring-1 ring-primary/20"
                : "border-border"
            )}
          >
            <SearchIcon className="size-3.5 text-muted-foreground shrink-0" />
            {selectedItem && !query ? (
              <span className="flex-1 truncate text-foreground text-xs">{itemLabel(selectedItem)}</span>
            ) : (
              <input
                ref={inputRef}
                type="text"
                className="flex-1 bg-transparent outline-none placeholder:text-muted-foreground text-xs"
                placeholder="Search appliances…"
                value={query}
                onChange={handleInputChange}
                onFocus={() => { if (query.trim().length >= 2) setOpen(true) }}
                onKeyDown={handleInputKeyDown}
              />
            )}
            {(selectedItemId || query) && (
              <button
                type="button"
                onClick={handleClearItem}
                className="text-muted-foreground hover:text-foreground shrink-0"
                aria-label="Clear item filter"
              >
                <XIcon className="size-3.5" />
              </button>
            )}
          </div>

          {open && filtered.length > 0 && (
            <ul className="absolute top-full mt-1 left-0 right-0 z-50 rounded-md border border-border bg-card shadow-md max-h-48 overflow-y-auto">
              {filtered.map((item) => {
                const sub = [item.brand, item.model].filter(Boolean).join(" ")
                return (
                  <li key={item.item_unit_id}>
                    <button
                      type="button"
                      className="w-full text-left px-3 py-2 hover:bg-muted/60 transition-colors"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleSelectItem(item)}
                    >
                      <div className="text-sm font-medium leading-tight">{item.display_name}</div>
                      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}

          {open && query.trim().length >= 2 && filtered.length === 0 && (
            <ItemsEmptyNote
              loading={itemsLoading} error={itemsError} onRetry={onRetryItems} query={query}
              className="absolute top-full mt-1 left-0 right-0 z-50 rounded-md border border-border bg-card shadow-md px-3 py-2 text-xs text-muted-foreground"
            />
          )}
        </div>
      </div>
    </div>
  )
}
