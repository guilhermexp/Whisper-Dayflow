import type { ReactNode } from "react"
import { cn } from "@renderer/lib/utils"

export type PageHeaderProps = {
  title: string
  description?: ReactNode
  actions?: ReactNode
  className?: string
}

export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-white/10 bg-white/[0.02] p-5",
        className,
      )}
    >
      <div className="flex flex-col gap-4 text-sm text-white lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-white">{title}</h1>
          {description && <p className="text-white/70">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
      </div>
    </section>
  )
}
