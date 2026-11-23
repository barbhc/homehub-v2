/** Settings → Appearance: light, dark, or the device's own setting. Moved from the one-page Settings unchanged. */
import { APPEARANCE_LABEL, useAppearance, type Appearance } from "@/lib/theme"

const APPEARANCES: readonly Appearance[] = ["light", "dark", "system"]

export function AppearancePane() {
  const { appearance, setAppearance } = useAppearance()
  return (
    <section
      className="rounded-2xl p-4 shadow-[0_1px_2px_rgba(15,23,42,0.05)]"
      style={{ background: "var(--hh-surface)" }}
    >
      <p className="text-[0.8125rem] leading-[1.38]" style={{ color: "var(--hh-sub)" }}>
        Choose a light or dark theme, or follow your device setting.
      </p>
      <div
        className="mt-3 inline-flex rounded-xl p-1"
        style={{ background: "var(--hh-surface2)", border: "1px solid var(--hh-line)" }}
        role="radiogroup"
        aria-label="Appearance"
      >
        {APPEARANCES.map((value) => {
          const active = appearance === value
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setAppearance(value)}
              className="hit-44 rounded-lg px-4 py-1.5 text-[0.8125rem] font-semibold transition-colors"
              style={
                active
                  ? { background: "var(--hh-surface)", color: "var(--hh-teal)", boxShadow: "0 1px 2px rgba(15,23,42,0.08)" }
                  : { background: "transparent", color: "var(--hh-sub)" }
              }
            >
              {APPEARANCE_LABEL[value]}
            </button>
          )
        })}
      </div>
    </section>
  )
}
