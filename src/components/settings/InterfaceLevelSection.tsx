import { useRef, useState } from "react"
import { InlineError, SectionCard } from "@/components/layout"
import { CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { useAuth } from "@/modules/auth"
import { setInterfaceLevelPref } from "@/lib/userPreferences"
import {
  useInterfaceOverride,
  setInterfaceOverride,
  type InterfaceOverride,
} from "@/lib/interfaceLevel"

const OPTIONS: { value: InterfaceOverride; label: string; hint: string }[] = [
  { value: "simple", label: "Simple", hint: "Just the essentials" },
  { value: "standard", label: "Standard", hint: "Adapts as your home grows" },
  { value: "advanced", label: "Advanced", hint: "Show every feature" },
]

/**
 * Progressive-complexity override (Phase B). Lets the user opt up or down from
 * the auto-derived level. Writes immediately to localStorage; the whole app
 * re-renders via useInterfaceOverride. The server copy is the one that
 * survives a new launch, so a failed save is undone here and said.
 */
export function InterfaceLevelSection() {
  const current = useInterfaceOverride()
  const { user } = useAuth()
  const [saveError, setSaveError] = useState<string | null>(null)
  /** What the server last confirmed — where a failed save puts the choice back. */
  const confirmed = useRef<InterfaceOverride>(current)
  const saveSeq = useRef(0)

  // Write the cache immediately (the whole app re-renders synchronously), then
  // persist. A failed save puts the choice back and says so (audit H6): it used
  // to be swallowed, and useInterfaceLevelSync then quietly restored the
  // server's old level on the next launch — the choice "un-made itself".
  const choose = (value: InterfaceOverride) => {
    setSaveError(null)
    setInterfaceOverride(value)
    const uid = user?.id
    if (!uid) return
    const seq = ++saveSeq.current
    setInterfaceLevelPref(uid, value)
      .then(() => {
        if (seq === saveSeq.current) confirmed.current = value
      })
      .catch((e: unknown) => {
        console.warn(`[settings] could not save interface level "${value}" for ${uid}:`, e instanceof Error ? e.message : e)
        if (seq !== saveSeq.current) return // a later choice is in flight; it decides
        setInterfaceOverride(confirmed.current)
        setSaveError("Couldn't save your choice. Check your connection and try again.")
      })
  }

  return (
    <SectionCard className="mt-6">
      <CardContent className="p-4">
        <h2 className="mb-2 text-sm font-semibold text-foreground">Interface</h2>
        <p className="text-sm text-muted-foreground mb-3">
        How much of Homehub to show. <strong>Standard</strong> reveals more as you add items and
        use the app; choose <strong>Simple</strong> for a calmer view or <strong>Advanced</strong>{" "}
        to see everything now.
      </p>
      <div className="flex flex-wrap gap-2">
        {OPTIONS.map((opt) => {
          const active = current === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              aria-pressed={active}
              onClick={() => choose(opt.value)}
              className={cn(
                "flex-1 min-w-[8rem] rounded-lg border px-3 py-2.5 text-left transition-colors",
                active
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-background text-foreground hover:border-foreground/40"
              )}
            >
              <span className="block text-sm font-semibold">{opt.label}</span>
              <span
                className={cn(
                  "block text-xs mt-0.5",
                  active ? "text-background/80" : "text-muted-foreground"
                )}
              >
                {opt.hint}
              </span>
            </button>
          )
          })}
        </div>
        {saveError && <InlineError className="mt-3">{saveError}</InlineError>}
      </CardContent>
    </SectionCard>
  )
}
