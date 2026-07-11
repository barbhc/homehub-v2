import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Plus, Package, MessageCircle, Wrench, Calendar } from "lucide-react"
import { cn } from "@/lib/utils"

const actions = [
  { label: "Add Item", to: "/inventory", icon: Plus, disabled: false },
  { label: "Inventory", to: "/inventory", icon: Package, disabled: false },
  { label: "Schedule", to: "/maintenance", icon: Calendar, disabled: false },
  { label: "Ask about an item", to: "#", icon: MessageCircle, disabled: true },
  { label: "Troubleshoot", to: "/maintenance", icon: Wrench, disabled: true },
] as const

type QuickActionsRowProps = {
  className?: string
}

export function QuickActionsRow({ className }: QuickActionsRowProps) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {actions.map(({ label, to, icon: Icon, disabled }) =>
        disabled ? (
          <Button
            key={label}
            variant="ghost"
            size="sm"
            className="gap-2 text-muted-foreground cursor-not-allowed hover:bg-transparent"
            disabled
            aria-disabled="true"
          >
            <Icon className="h-3.5 w-3.5 opacity-60" />
            <span className="text-sm">{label}</span>
          </Button>
        ) : (
          <Button
            key={label}
            variant="ghost"
            size="sm"
            className="gap-2 text-muted-foreground hover:text-foreground focus-visible:ring-2"
            asChild
          >
            <Link to={to}>
              <Icon className="h-3.5 w-3.5" />
              <span className="text-sm">{label}</span>
            </Link>
          </Button>
        )
      )}
    </div>
  )
}
