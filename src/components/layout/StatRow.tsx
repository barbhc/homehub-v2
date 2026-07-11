import { cn } from "@/lib/utils"

type StatRowProps = {
  children: React.ReactNode
  className?: string
}

export function StatRow({ children, className }: StatRowProps) {
  return (
    <div className={cn("grid grid-cols-2 md:grid-cols-4 gap-3", className)}>
      {children}
    </div>
  )
}
