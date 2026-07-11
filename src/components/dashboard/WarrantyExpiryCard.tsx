import { Link } from "react-router-dom"
import { SectionCard } from "@/components/layout"
import type { ExpiringWarrantyItem } from "@/lib/dashboard"

interface WarrantyExpiryCardProps {
  items: ExpiringWarrantyItem[]
}

export function WarrantyExpiryCard({ items }: WarrantyExpiryCardProps) {
  if (items.length === 0) return null

  return (
    <SectionCard className="border-l-4 border-l-amber-500 p-4">
      <h2 className="font-medium mb-3">Warranties expiring soon</h2>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.item_unit_id}>
            <Link
              to={`/items/${item.item_unit_id}`}
              className="flex items-center justify-between gap-2 py-1.5 px-2 -mx-2 rounded-md hover:bg-muted/50 transition-colors group"
            >
              <span className="text-sm truncate">{item.display_name}</span>
              <span className="text-xs font-medium shrink-0 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-400">
                {item.days_remaining} {item.days_remaining === 1 ? "day" : "days"} left
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </SectionCard>
  )
}
