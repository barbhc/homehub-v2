import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"

type SectionCardProps = React.ComponentProps<typeof Card>

/**
 * Frosted section card.
 *
 * The background used to be a literal `bg-white/55` with a `border-white/70`,
 * which meant every card built on it stayed WHITE in dark mode — a tester
 * reported Settings as light-grey panels with dark text sitting on a black
 * page, while the one card that used the theme token rendered correctly right
 * above them. `--hh-surface` already carries both values (#FFFFFF / #161E1A),
 * so the frosting is now mixed from it and follows the theme in both
 * directions. Same look in light mode; a legible one in dark.
 */
export function SectionCard({ className, style, ...props }: SectionCardProps) {
  return (
    <Card
      className={cn("rounded-2xl border backdrop-blur-sm shadow-sm", className)}
      style={{
        background: "color-mix(in srgb, var(--hh-surface) 55%, transparent)",
        borderColor: "color-mix(in srgb, var(--hh-surface) 70%, transparent)",
        ...style,
      }}
      {...props}
    />
  )
}
