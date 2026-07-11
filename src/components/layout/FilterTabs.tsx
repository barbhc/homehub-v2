import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type FilterOption<T extends string = string> = {
  value: T
  label: string
  count?: number
}

type FilterTabsProps<T extends string = string> = {
  options: FilterOption<T>[]
  value: T
  onChange: (value: T) => void
  className?: string
}

export function FilterTabs<T extends string = string>({
  options,
  value,
  onChange,
  className,
}: FilterTabsProps<T>) {
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {options.map((opt) => {
        const isActive = opt.value === value
        return (
          <Button
            key={opt.value}
            variant={isActive ? "secondary" : "ghost"}
            size="sm"
            className={cn(
              "text-xs h-8 px-3",
              !isActive && "text-muted-foreground"
            )}
            onClick={() => onChange(opt.value)}
          >
            {opt.label}
            {opt.count != null && (
              <span className="ml-1.5 text-muted-foreground">{opt.count}</span>
            )}
          </Button>
        )
      })}
    </div>
  )
}
