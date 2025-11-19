import { cn } from "@renderer/lib/utils"
import React from "react"

import { CARD_BASE_CLASS } from "./section-card"

export const Control = ({
  label,
  children,
  className,
}: {
  label: React.ReactNode
  children: React.ReactNode
  className?: string
}) => {
  return (
    <div className={cn("flex items-center justify-between gap-5 py-3", className)}>
      <div className="shrink-0 pr-3">
        <span className="text-sm font-medium text-white">{label}</span>
      </div>
      <div className="flex max-w-[50%] grow items-center justify-end">
        {children}
      </div>
    </div>
  )
}

export const ControlGroup = ({
  children,
  className,
  title,
  endDescription,
}: {
  children: React.ReactNode
  className?: string
  title?: React.ReactNode
  endDescription?: React.ReactNode
}) => {
  return (
    <div className={cn("glass-container glass-border space-y-3", className)}>
      {(title || endDescription) && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-1">
          {title && (
            <span className="text-sm font-semibold text-white/90 tracking-wide">{title}</span>
          )}
          {endDescription && (
            <div className="text-xs text-white/60">{endDescription}</div>
          )}
        </div>
      )}
      <div className="divide-y divide-white/5">{children}</div>
    </div>
  )
}
