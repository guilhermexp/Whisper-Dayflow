import { useEffect } from "react"
import type { CustomPrompt } from "@shared/types/enhancement"
import { Switch } from "../ui/switch"
import { cn } from "@renderer/lib/utils"

interface EnhancementToggleProps {
  enabled: boolean
  onToggle: (enabled: boolean) => void
  processing?: boolean
  currentPrompt?: CustomPrompt
  className?: string
}

export function EnhancementToggle({
  enabled,
  onToggle,
  processing,
  currentPrompt,
  className,
}: EnhancementToggleProps) {
  // Keyboard shortcut: Cmd/Ctrl+E
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "e") {
        e.preventDefault()
        onToggle(!enabled)
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [enabled, onToggle])

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Switch
        checked={enabled}
        onCheckedChange={onToggle}
        disabled={processing}
        className={cn(processing && "opacity-50 cursor-not-allowed")}
      />
      <div className="flex flex-col">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "i-mingcute-sparkles-line text-base",
              enabled ? "text-white" : "text-white/40",
            )}
          ></span>
          <span className="text-sm font-medium">
            Enhancement {enabled ? "On" : "Off"}
          </span>
        </div>
        {enabled && currentPrompt && (
          <span className="text-xs text-white/70">
            {currentPrompt.title}
          </span>
        )}
      </div>
      {processing && (
        <span className="i-mingcute-loading-line text-base animate-spin text-white/60"></span>
      )}
    </div>
  )
}
