import { SectionCard } from "@/components/layout"
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
 * re-renders via useInterfaceOverride.
 */
export function InterfaceLevelSection() {
  const current = useInterfaceOverride()
  const { user } = useAuth()

  // Write the cache immediately (the whole app re-renders synchronously), then
  // persist for cross-device sync (best-effort — the cache is the fallback).
  const choose = (value: InterfaceOverride) => {
    setInterfaceOverride(value)
    if (user?.id) void setInterfaceLevelPref(user.id, value).catch(() => {})
  }

  return (
    <SectionCard title="Interface" className="mt-6">
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
    </SectionCard>
  )
}
