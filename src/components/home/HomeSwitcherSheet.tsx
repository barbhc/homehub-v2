import { useEffect, useState } from "react"
import { CheckIcon, ChevronLeftIcon, HomeIcon, Loader2Icon, PlusIcon } from "lucide-react"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Input } from "@/components/ui/input"
import { createHome } from "@/modules/home"
import type { Home } from "@/integrations/types"

/**
 * Pick a home, or add one.
 *
 * The app supported multiple homes in its data model from the start — a
 * membership doc per home, and accepted invites already created second ones —
 * but there was no way to create a second home or move between them, so a
 * two-home user was pinned to whichever sorted first. This is the missing
 * surface, reached from the home name under the Home greeting: the one place
 * that already says which home you are looking at.
 *
 * Two views in ONE sheet rather than a sheet opening a dialog: stacked portals
 * on mobile are how you get a modal you can't dismiss.
 */
export function HomeSwitcherSheet({
  open,
  onOpenChange,
  homes,
  currentHomeId,
  userId,
  onSelect,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  homes: Home[]
  currentHomeId: string | null
  userId: string
  onSelect: (homeId: string) => void
  /** Called with the new home's id — the caller refreshes and selects it. */
  onCreated: (homeId: string) => Promise<void>
}) {
  const [view, setView] = useState<"list" | "add">("list")
  const [name, setName] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Always reopen on the list. Reopening into a half-typed add form would be a
  // small mystery every time.
  useEffect(() => {
    if (open) {
      setView("list")
      setName("")
      setError(null)
    }
  }, [open])

  const submit = async () => {
    const trimmed = name.trim()
    if (!trimmed || saving) return
    setSaving(true)
    setError(null)
    // isPrimary: false — the FIRST home keeps that flag. Two primaries would
    // make "which home is primary" depend on iteration order.
    const res = await createHome({ name: trimmed, userId, isPrimary: false })
    if (!res.data) {
      setSaving(false)
      setError(res.error?.message ?? "Couldn't add that home.")
      return
    }
    await onCreated(res.data.homeId)
    setSaving(false)
    onOpenChange(false)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {/* This sheet pads ITSELF. SheetContent deliberately ships without
          padding and every other bottom sheet pads its own children instead —
          putting a default on the primitive would double-pad all seven. The
          bottom inset is the part that was actually broken: the caption sat
          under the home indicator, unreadable. */}
      <SheetContent
        side="bottom"
        className="max-h-[85vh] overflow-y-auto px-5 pt-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:max-w-md"
      >
        {view === "list" ? (
          <>
            <SheetHeader className="px-0 pt-0">
              <SheetTitle className="text-[15px]">Your homes</SheetTitle>
            </SheetHeader>

            <div className="mt-1 flex flex-col gap-2">
              {homes.map((h) => {
                const selected = h.home_id === currentHomeId
                return (
                  <button
                    key={h.home_id}
                    type="button"
                    onClick={() => {
                      onSelect(h.home_id)
                      onOpenChange(false)
                    }}
                    className="flex items-center gap-2.5 rounded-xl border px-3.5 py-3 text-left"
                    style={{
                      borderColor: selected ? "var(--hh-teal)" : "var(--hh-line)",
                      background: selected ? "var(--hh-teal-wash)" : "var(--hh-surface)",
                    }}
                  >
                    <HomeIcon
                      className="size-[18px] shrink-0"
                      style={{ color: selected ? "var(--hh-teal)" : "var(--hh-sub)" }}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-semibold" style={{ color: "var(--hh-ink)" }}>
                        {h.name}
                      </span>
                      {selected && (
                        <span className="block text-[11px]" style={{ color: "var(--hh-sub)" }}>
                          You're here
                        </span>
                      )}
                    </span>
                    {selected && <CheckIcon className="size-4 shrink-0" style={{ color: "var(--hh-teal)" }} />}
                  </button>
                )
              })}

              <button
                type="button"
                onClick={() => setView("add")}
                className="flex items-center gap-2.5 rounded-xl border border-dashed px-3.5 py-3 text-left"
                style={{ borderColor: "var(--hh-line)" }}
              >
                <PlusIcon className="size-4 shrink-0" style={{ color: "var(--hh-teal)" }} aria-hidden />
                <span className="text-[13.5px] font-semibold" style={{ color: "var(--hh-teal)" }}>
                  Add a home
                </span>
              </button>
            </div>

            <p className="mt-3 px-1 text-[11px]" style={{ color: "var(--hh-sub)" }}>
              Each home keeps its own items, tasks, and rooms.
            </p>
          </>
        ) : (
          <>
            <SheetHeader className="px-0 pt-0">
              <SheetTitle className="flex items-center gap-1.5 text-[15px]">
                <button
                  type="button"
                  onClick={() => setView("list")}
                  aria-label="Back to your homes"
                  className="-ml-1 rounded p-0.5"
                  style={{ color: "var(--hh-sub)" }}
                >
                  <ChevronLeftIcon className="size-[18px]" />
                </button>
                Add a home
              </SheetTitle>
            </SheetHeader>

            <label htmlFor="new-home-name" className="mt-2 block text-[12px]" style={{ color: "var(--hh-sub)" }}>
              Home name
            </label>
            <Input
              id="new-home-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submit()
              }}
              placeholder="e.g., My House, Downtown Apartment"
              autoFocus
              className="mt-1.5"
            />

            {/* Said up front because it already happens — createHome seeds nine
                rooms. Finding them unexplained reads as data you didn't add. */}
            <p
              className="mt-3 rounded-xl px-3 py-2.5 text-[11.5px] leading-relaxed"
              style={{ background: "var(--hh-surface2)", color: "var(--hh-sub)" }}
            >
              We'll start it with the usual rooms — kitchen, bathroom, garage, and more. You can
              rename or remove them any time.
            </p>

            {error && (
              <p className="mt-2 text-[12px]" style={{ color: "var(--hh-clay)" }}>
                {error}
              </p>
            )}

            <button
              type="button"
              onClick={() => void submit()}
              disabled={saving || !name.trim()}
              className="mt-3.5 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-[13.5px] font-bold text-white disabled:opacity-60"
              style={{ background: "var(--hh-teal)" }}
            >
              {saving && <Loader2Icon className="size-4 animate-spin" />}
              {saving ? "Adding…" : "Add home"}
            </button>
            <p className="mt-2 text-center text-[11px]" style={{ color: "var(--hh-sub)" }}>
              You'll switch to it right away
            </p>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
