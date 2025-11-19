import type { ReactNode } from "react"

import { cn } from "@renderer/lib/utils"

export const CARD_BASE_CLASS =
  "glass-container glass-border p-4"

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
    <div className={cn(CARD_BASE_CLASS, "transition-all duration-200", className)}>
      {(title || description || action) && (
        <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
          <div className="space-y-0.5">
            {title && (
              <div className="text-[10px] uppercase tracking-wide text-white/60">
                {title}
              </div>
            )}
            {description && <p className="text-[10px] text-white/70">{description}</p>}
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
    <div className={cn(CARD_BASE_CLASS, "transition-all duration-200 hover:shadow-lg", className)}>
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-wide text-white/60">{label}</div>
        {icon && (
          <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-white/5">
            <span className={cn(icon, "text-sm text-white/40")}></span>
          </div>
        )}
      </div>
      <div className="mt-1 text-lg font-semibold text-white">{value}</div>
      {helper && <div className="mt-0.5 text-[10px] text-white/70">{helper}</div>}
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
    <div className={cn("glass-container glass-border p-3 transition-all duration-200 hover:bg-white/[0.08]", className)}>
      <div className="text-[10px] uppercase tracking-wide text-white/60">{label}</div>
      <div className="mt-0.5 text-base font-semibold text-white">{value}</div>
      {helper && <div className="mt-0.5 text-[10px] text-white/70">{helper}</div>}
    </div>
  )
}
