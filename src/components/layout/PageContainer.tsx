import { cn } from "@/lib/utils"

type PageContainerProps = React.ComponentProps<"div">

/**
 * Standard page wrapper: max width, padding, vertical rhythm.
 * Use on every main page for consistent layout.
 */
export function PageContainer({
  className,
  children,
  ...props
}: PageContainerProps) {
  return (
    <div
      className={cn("p-6 max-w-6xl mx-auto space-y-6", className)}
      {...props}
    >
      {children}
    </div>
  )
}
