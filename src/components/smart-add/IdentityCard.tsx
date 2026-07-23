/**
 * IdentityCard — the "We found this" card under brand + model in the appliance
 * lane. One card, five states, one contract: the lookup is enrichment, never a
 * gate — a miss changes tone, not the ability to add.
 *
 *   loading  spinner line while the resolver runs
 *   found    resolved product + explicit "Use this" (nothing auto-applies)
 *   fuzzy    partial model → up to 3 family variants + "None of these"
 *   applied  what was filled + "Undo" / "Not my product"
 *   miss     quiet fallback (no red): typed data stands, snap-label assist
 *
 * Purely presentational — state machine lives in IdentifyStep; props in,
 * callbacks out, so every state is unit-testable.
 */
import { Loader2, Camera, Sparkles, Undo2 } from "lucide-react"
import type { ProductIdentity, VariantCandidate } from "@/modules/inventory/services/productLookupService"

export type IdentityCardState = "loading" | "found" | "fuzzy" | "applied" | "miss"

const SOURCE_LABEL: Record<ProductIdentity["source"], string> = {
  icecat: "Icecat product data",
  brave: "Web search",
  claude: "Claude product knowledge",
}

type IdentityCardProps = {
  state: IdentityCardState
  identity?: ProductIdentity | null
  /** Human label for the mapped category (found state subtitle). */
  categoryLabel?: string | null
  variants?: VariantCandidate[]
  onUse?: () => void
  onUndo?: () => void
  onNotMine?: () => void
  onPickVariant?: (model: string) => void
  onNoneOfThese?: () => void
  onSnapLabel?: () => void
}

const shellBase = "rounded-xl border px-4 py-3 text-sm"
const tealShell = `${shellBase} border-primary/30 bg-primary/[0.06]`
const quietShell = `${shellBase} border-border bg-muted/40`

function Eyebrow({ children, quiet = false }: { children: React.ReactNode; quiet?: boolean }) {
  return (
    <p
      className={`text-[10px] font-bold uppercase tracking-[0.12em] ${quiet ? "text-muted-foreground" : "text-primary"}`}
    >
      {children}
    </p>
  )
}

export function IdentityCard({
  state,
  identity,
  categoryLabel,
  variants = [],
  onUse,
  onUndo,
  onNotMine,
  onPickVariant,
  onNoneOfThese,
  onSnapLabel,
}: IdentityCardProps) {
  if (state === "loading") {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-sm" aria-busy="true">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        <span>Looking it up…</span>
      </div>
    )
  }

  if (state === "found" && identity) {
    return (
      <div className={tealShell} data-testid="identity-found">
        <Eyebrow>We found this</Eyebrow>
        <p className="font-semibold text-foreground mt-0.5">{identity.name}</p>
        {categoryLabel && <p className="text-xs text-muted-foreground">{categoryLabel}</p>}
        <p className="text-[11px] text-muted-foreground mt-1">Source: {SOURCE_LABEL[identity.source]}</p>
        <button
          type="button"
          onClick={onUse}
          className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Sparkles className="size-3.5" aria-hidden />
          Use this
        </button>
      </div>
    )
  }

  if (state === "fuzzy" && variants.length > 0) {
    return (
      <div className={tealShell} data-testid="identity-fuzzy">
        <Eyebrow>Which one is yours?</Eyebrow>
        <div className="mt-2 flex flex-col gap-1.5">
          {variants.map((v) => (
            <button
              key={v.model}
              type="button"
              onClick={() => onPickVariant?.(v.model)}
              className="rounded-lg border border-primary/30 bg-background px-3 py-2 text-left text-sm font-medium text-foreground hover:border-primary/60 transition-colors"
            >
              {v.model}
              {v.differentiator && <span className="text-muted-foreground font-normal"> · {v.differentiator}</span>}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onNoneOfThese}
          className="mt-2 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          None of these
        </button>
        <p className="text-[11px] text-muted-foreground mt-2">The full model is on the nameplate’s top line.</p>
      </div>
    )
  }

  if (state === "applied" && identity) {
    return (
      <div className={tealShell} data-testid="identity-applied">
        <Eyebrow>Using this</Eyebrow>
        <p className="font-semibold text-foreground mt-0.5">{identity.name}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onUndo}
            className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
          >
            <Undo2 className="size-3" aria-hidden />
            Undo
          </button>
          <button
            type="button"
            onClick={onNotMine}
            className="rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
          >
            Not my product
          </button>
        </div>
      </div>
    )
  }

  if (state === "miss") {
    return (
      <div className={quietShell} data-testid="identity-miss">
        <Eyebrow quiet>We don’t recognize this one</Eyebrow>
        <p className="text-xs text-muted-foreground mt-1">
          No problem — we’ll use exactly what you typed. Worth a glance: 0 vs O and 1 vs I on nameplates.
        </p>
        {onSnapLabel && (
          <button
            type="button"
            onClick={onSnapLabel}
            className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:border-primary/40 transition-colors"
          >
            <Camera className="size-3.5" aria-hidden />
            Snap the label — we’ll read it
          </button>
        )}
      </div>
    )
  }

  return null
}
