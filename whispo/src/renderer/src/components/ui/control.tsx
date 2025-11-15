import { cn } from "@renderer/lib/utils"
import React from "react"

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
    <div
      className={cn("flex items-center justify-between gap-5 py-2.5", className)}
    >
      <div className="shrink-0">
        <span className="text-sm font-medium text-white/90">{label}</span>
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
    <div className={className}>
      {title && (
        <div className="mb-3">
          <span className="text-sm font-semibold text-white">{title}</span>
        </div>
      )}
      <div className="divide-y divide-white/5 rounded-lg border border-white/10 bg-white/[0.05] backdrop-blur-sm smooth-transition hover:bg-white/[0.08]">
        {children}
      </div>
      {endDescription && (
        <div className="mt-2 flex justify-end text-right text-xs text-white/50">
          <div className="max-w-[70%]">{endDescription}</div>
        </div>
      )}
    </div>
  )
}
