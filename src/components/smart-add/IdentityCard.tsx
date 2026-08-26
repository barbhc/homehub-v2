/**
 * IdentityCard — the match card under brand + model in the appliance lane. One
 * card, five states, one contract: the lookup is enrichment, never a gate — a
 * miss changes tone, not the ability to add.
 *
 * HH-138: it used to print `identity.name` verbatim. For a Bosch dishwasher the
 * resolver returned "Bosch SHPM65Z55N/01 Manuals" — a web page's <title> — so
 * the screen appeared to announce it had found the MANUAL. It had found a
 * model. The owner: "we just want to identify the item and then on the next
 * page if you want to say oh we found the manual great".
 *
 * So the card now describes the match in OUR vocabulary — what kind of thing it
 * is, and the brand and model we matched on — and shows the resolver's own
 * string only when `isUsableProductName` says it is a name rather than a page
 * title. Announcing a manual is the manual step's job, and only after one is
 * actually found.
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
import { looksLikePageTitle } from "@/lib/itemName"

export type IdentityCardState = "loading" | "found" | "fuzzy" | "applied" | "miss"

const SOURCE_LABEL: Record<ProductIdentity["source"], string> = {
  icecat: "Icecat product data",
  brave: "Web search",
  claude: "Claude product knowledge",
}

type IdentityCardProps = {
  state: IdentityCardState
  identity?: ProductIdentity | null
  /** Human label for the mapped category — the HEADLINE of a match now, not a
   *  subtitle. "Dishwasher" is what the user asked this page to establish. */
  categoryLabel?: string | null
  /** What the lookup ran on. Shown as the evidence line, because these are the
   *  two fields the user typed or scanned and can check against the nameplate. */
  brand?: string | null
  model?: string | null
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

/**
 * What the card says it matched.
 *
 * Headline: the resolver's name when it IS a name; otherwise the kind of thing;
 * otherwise the match itself. Never a page title — that is the whole of HH-138.
 *
 * The gate is `looksLikePageTitle`, NOT `isUsableProductName`. The latter also
 * rejects names that repeat the model number, which is right for the name field
 * (HH-125) and wrong here: "LG WM4000HWA Front Load Washer" is precisely what
 * someone wants to read on a card confirming what we matched.
 *
 * Evidence: brand + model, so the user can check the card against the nameplate
 * in front of them rather than trusting it. Suppressed when the headline already
 * carries both — one line, not the same line twice.
 */
function MatchBody({
  identity, categoryLabel, brand, model,
}: { identity: ProductIdentity; categoryLabel?: string | null; brand?: string | null; model?: string | null }) {
  const namedWell = !!identity.name?.trim() && !looksLikePageTitle(identity.name)
  const parts = [brand, model].map((v) => v?.trim()).filter(Boolean) as string[]
  const evidence = parts.join(" · ")
  const headline = namedWell ? identity.name : categoryLabel || evidence || "This model"
  const flat = headline.toLowerCase()
  const headlineSaysItAll = parts.length > 0 && parts.every((v) => flat.includes(v.toLowerCase()))
  return (
    <>
      <p className="font-semibold text-foreground mt-0.5">{headline}</p>
      {namedWell && categoryLabel && <p className="text-xs text-muted-foreground">{categoryLabel}</p>}
      {evidence && !headlineSaysItAll && <p className="text-xs text-muted-foreground">{evidence}</p>}
    </>
  )
}

export function IdentityCard({
  state,
  identity,
  categoryLabel,
  brand,
  model,
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
        <Eyebrow>We found this item</Eyebrow>
        <MatchBody identity={identity} categoryLabel={categoryLabel} brand={brand} model={model} />
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
        <MatchBody identity={identity} categoryLabel={categoryLabel} brand={brand} model={model} />
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
