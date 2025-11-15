import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { tv, type VariantProps } from "tailwind-variants"

import { cn } from "~/lib/utils"

const buttonVariants = tv({
  base: "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/20 disabled:pointer-events-none disabled:opacity-50",
  variants: {
    variant: {
      default: "bg-primary text-primary-foreground shadow hover:bg-primary/90",
      destructive:
        "bg-destructive text-destructive-foreground hover:bg-destructive/90",
      outline:
        "border border-input bg-background hover:bg-accent dark:hover:bg-neutral-900 hover:text-accent-foreground",
      secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
      ghost:
        "hover:bg-accent dark:hover:bg-neutral-800 hover:text-accent-foreground",
      link: "text-primary underline-offset-4 hover:underline",
      glass: "relative overflow-hidden bg-white/[0.14] text-white hover:bg-white/[0.18] active:bg-white/[0.25] glass-border",
      glassActive: "relative overflow-hidden bg-red-500/50 text-white hover:bg-red-400/60 active:bg-red-500/70 glass-border",
      glassDone: "relative overflow-hidden bg-white/90 text-black hover:bg-gray-100 active:bg-gray-200",
    },
    size: {
      default: "h-9 px-4 py-2",
      sm: "h-8 rounded-pill px-3 text-xs",
      lg: "h-10 rounded-pill px-8",
      icon: "h-8 w-8 rounded-pill",
    },
  },
  defaultVariants: {
    variant: "default",
    size: "default",
  },
})

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  },
)
Button.displayName = "Button"

export { Button, buttonVariants }
