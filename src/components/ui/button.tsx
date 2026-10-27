import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

// hit-44 (src/index.css): every Button takes a 44pt tap, including the compact
// md+ sizes an iPad shows to a finger — the hit area grows, the button doesn't.
// Larger Text (`larger-text:`, only when the iPhone's text size is raised): a
// text button's fixed height becomes a 44pt floor and its label may wrap, so a
// grown label stays inside its button instead of spilling out of it or off the
// screen. Icon-only sizes keep their box.
// hh-press (src/index.css): shrinks to 96% and dims the instant a finger lands;
// under Reduce Motion only the dim stays.
const buttonVariants = cva(
  "hh-press hit-44 larger-text:whitespace-normal inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--hh-teal-fill)] text-primary-foreground shadow-sm hover:bg-[var(--hh-teal-fill-hover)] active:bg-[var(--hh-teal-fill-active)]",
        destructive:
          // The FILL token, not --t-destructive: in dark that is a bright text red
          // (white on it 3.76:1), and the old /70 alpha passed only by letting the
          // dark dialog show through. Opaque fill: white 4.83 / 6.47:1.
          "bg-destructive-fill text-white shadow-sm hover:bg-destructive-fill/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40",
        outline:
          "border border-primary bg-transparent text-primary hover:bg-secondary hover:text-primary",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary-hover active:bg-secondary-active",
        ghost:
          "hover:bg-secondary hover:text-secondary-foreground",
        link:
          "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 md:h-9 larger-text:h-auto larger-text:min-h-11 px-4 py-2 has-[>svg]:px-3",
        xs: "h-6 larger-text:h-auto larger-text:min-h-6 larger-text:py-0.5 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-11 md:h-8 larger-text:h-auto larger-text:min-h-11 larger-text:py-1.5 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-11 md:h-10 larger-text:h-auto larger-text:min-h-11 larger-text:py-2 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-11 md:size-9",
        "icon-xs": "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-11 md:size-8",
        "icon-lg": "size-11 md:size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export { Button, buttonVariants }
