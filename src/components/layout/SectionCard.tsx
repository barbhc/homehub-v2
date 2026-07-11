import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"

type SectionCardProps = React.ComponentProps<typeof Card>

/**
 * Glass-morphism section card:
 * translucent white, backdrop blur, soft white border, rounded corners.
 */
export function SectionCard({ className, ...props }: SectionCardProps) {
  return (
    <Card
      className={cn(
        "rounded-2xl border border-white/70 bg-white/55 backdrop-blur-sm shadow-sm",
        className
      )}
      {...props}
    />
  )
}
