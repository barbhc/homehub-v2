import { XIcon } from "lucide-react"
import { dismissPurchaseNudge } from "@/lib/purchaseNudge"

/**
 * "Track when your warranty ends by adding purchase details."
 *
 * Placed on the item page while the manual is being read, because that is the
 * one stretch of this flow where the user is waiting on us and has nothing to
 * do. It names the single thing the data buys — a warranty window that expires
 * whether or not anyone is watching — rather than listing fields.
 *
 * The × is a real dismissal, remembered per item. The fields do not disappear
 * with it: Details & records keeps them one tap away, which is the difference
 * between "not now" and "never offer this again".
 */
export function PurchaseNudge({
  itemUnitId, onAdd, onDismissed,
}: {
  itemUnitId: string
  onAdd: () => void
  onDismissed: () => void
}) {
  return (
    <div
      className="relative rounded-2xl border px-4 py-3.5"
      style={{
        borderColor: "color-mix(in srgb, var(--hh-teal) 30%, transparent)",
        background: "var(--hh-teal-wash)",
      }}
    >
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => {
          dismissPurchaseNudge(itemUnitId)
          onDismissed()
        }}
        className="absolute right-2.5 top-2.5 rounded-full p-1"
        style={{ color: "var(--hh-sub)" }}
      >
        <XIcon className="size-4" />
      </button>
      <p className="pr-6 text-[14px] font-bold tracking-[-0.01em]" style={{ color: "var(--hh-ink)" }}>
        Add purchase details?
      </p>
      <p className="mt-1 text-[12.5px] leading-snug" style={{ color: "var(--hh-sub)" }}>
        Track <b style={{ color: "var(--hh-ink)" }}>when your warranty ends</b> by adding purchase details.
      </p>
      <button
        type="button"
        onClick={onAdd}
        className="mt-2 text-[12.5px] font-bold underline underline-offset-2"
        style={{ color: "var(--hh-teal)" }}
      >
        Add details
      </button>
    </div>
  )
}
