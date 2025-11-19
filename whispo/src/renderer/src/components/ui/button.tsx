import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { tv, type VariantProps } from "tailwind-variants"

import { cn } from "~/lib/utils"

const buttonVariants = tv({
  base: "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-body font-medium transition-all duration-150 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:pointer-events-none disabled:opacity-50 hover:scale-[1.02] active:scale-[0.98]",
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
      glass: "glass-effect text-white hover:bg-white/[0.12] active:bg-white/[0.16] shadow-lg hover:shadow-xl border-white/10",
      glassActive: "bg-red-500/20 text-white hover:bg-red-500/30 active:bg-red-500/40 border border-red-500/30 backdrop-blur-md shadow-[0_0_15px_rgba(239,68,68,0.2)]",
      glassDone: "bg-white/90 text-black hover:bg-white active:bg-white/80 shadow-lg backdrop-blur-md font-semibold",
    },
    size: {
      default: "h-9 px-3 py-2",
      sm: "h-8 px-2.5 text-xs",
      lg: "h-11 px-4",
      icon: "h-9 w-9",
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
