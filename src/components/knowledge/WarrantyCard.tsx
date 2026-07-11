import { SectionCard } from "@/components/layout"
import { Badge } from "@/components/ui/badge"
import type { ItemUnit } from "@/integrations/types"

interface WarrantyCardProps {
  item: ItemUnit
}

function formatDuration(months: number): string {
  if (months >= 12 && months % 12 === 0) {
    const years = months / 12
    return years === 1 ? "1 year" : `${years} years`
  }
  return `${months} months`
}

function formatPurchaseDate(iso: string): string {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

export function WarrantyCard({ item }: WarrantyCardProps) {
  const { warranty_duration_months, purchase_date, warranty_coverage } = item

  if (warranty_duration_months == null && purchase_date == null) return null

  const expiryDate =
    item.warranty_expiry_date ??
    (purchase_date && warranty_duration_months
      ? (() => {
          const [y, m, d] = purchase_date.split("-").map(Number)
          const exp = new Date(y, m - 1, d)
          exp.setMonth(exp.getMonth() + warranty_duration_months)
          return exp.toISOString().split("T")[0]
        })()
      : null)

  const today = new Date().toISOString().split("T")[0]
  const sixtyDaysFromNow = new Date()
  sixtyDaysFromNow.setDate(sixtyDaysFromNow.getDate() + 60)
  const cutoff = sixtyDaysFromNow.toISOString().split("T")[0]

  let badge: React.ReactNode
  if (!expiryDate) {
    badge = <Badge variant="secondary">Unknown</Badge>
  } else if (expiryDate > cutoff) {
    badge = <Badge className="bg-green-600 hover:bg-green-600">Active</Badge>
  } else if (expiryDate > today) {
    badge = (
      <Badge className="bg-amber-500 text-amber-950 hover:bg-amber-500">
        Expiring soon
      </Badge>
    )
  } else {
    badge = <Badge variant="destructive">Expired</Badge>
  }

  return (
    <SectionCard className="p-4 sm:p-6">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h2 className="font-medium">Warranty</h2>
        {badge}
      </div>
      {warranty_duration_months != null && (
        <p className="text-sm text-muted-foreground">
          {formatDuration(warranty_duration_months)}
        </p>
      )}
      {warranty_coverage && (
        <p className="text-sm mt-1">{warranty_coverage}</p>
      )}
      {purchase_date && expiryDate && (
        <p className="text-xs text-muted-foreground mt-2">
          Purchased {formatPurchaseDate(purchase_date)} · Expires{" "}
          {formatPurchaseDate(expiryDate)}
        </p>
      )}
    </SectionCard>
  )
}
