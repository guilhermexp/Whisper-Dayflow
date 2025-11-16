import type { ReactNode } from "react"

import { cn } from "@renderer/lib/utils"

export const CARD_BASE_CLASS =
  "rounded-2xl border border-white/10 bg-white/[0.02] p-4 shadow-[0_25px_45px_rgba(0,0,0,0.35)] backdrop-blur-sm"

type SectionCardProps = {
  title?: ReactNode
  description?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
}

export function SectionCard({
  title,
  description,
  action,
  children,
  className,
}: SectionCardProps) {
  return (
    <div className={cn(CARD_BASE_CLASS, "transition-all duration-200 hover:border-white/20", className)}>
      {(title || description || action) && (
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div className="space-y-0.5">
            {title && (
              <div className="text-xs uppercase tracking-wide text-white/60">
                {title}
              </div>
            )}
            {description && <p className="text-xs text-white/70">{description}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </div>
  )
}

type StatCardProps = {
  label: string
  value: ReactNode
  helper?: ReactNode
  icon?: string
  className?: string
}

export function StatCard({ label, value, helper, icon, className }: StatCardProps) {
  return (
    <div className={cn(CARD_BASE_CLASS, "transition-all duration-200 hover:border-white/20 hover:shadow-lg", className)}>
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wide text-white/60">{label}</div>
        {icon && (
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5">
            <span className={cn(icon, "text-lg text-white/40")}></span>
          </div>
        )}
      </div>
      <div className="mt-1.5 text-2xl font-semibold text-white">{value}</div>
      {helper && <div className="mt-0.5 text-xs text-white/70">{helper}</div>}
    </div>
  )
}

type InsightCardProps = {
  label: string
  value: ReactNode
  helper?: ReactNode
  className?: string
}

export function InsightCard({
  label,
  value,
  helper,
  className,
}: InsightCardProps) {
  return (
    <div className={cn("rounded-xl border border-white/10 bg-white/[0.03] p-3 transition-all duration-200 hover:border-white/20 hover:bg-white/[0.05]", className)}>
      <div className="text-xs uppercase tracking-wide text-white/60">{label}</div>
      <div className="mt-1 text-xl font-semibold text-white">{value}</div>
      {helper && <div className="mt-0.5 text-xs text-white/70">{helper}</div>}
    </div>
  )
}
