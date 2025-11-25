import type { EnhancementMode } from "@shared/types/enhancement"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select"
import { cn } from "@renderer/lib/utils"
import { useTranslation } from "react-i18next"

interface ModeSelectorProps {
  mode: EnhancementMode
  onChange: (mode: EnhancementMode) => void
  disabled?: boolean
  className?: string
}

const MODES: Array<{
  value: EnhancementMode
  icon: string
}> = [
  {
    value: "off",
    icon: "i-mingcute-close-circle-line",
  },
  {
    value: "light",
    icon: "i-mingcute-magic-1-line",
  },
  {
    value: "medium",
    icon: "i-mingcute-sparkles-line",
  },
  {
    value: "heavy",
    icon: "i-mingcute-stars-line",
  },
]

export function ModeSelector({
  mode,
  onChange,
  disabled,
  className,
}: ModeSelectorProps) {
  const { t } = useTranslation()
  const currentMode = MODES.find((m) => m.value === mode) || MODES[0]

  return (
    <Select
      value={mode}
      onValueChange={(value) => onChange(value as EnhancementMode)}
      disabled={disabled}
    >
      <SelectTrigger className={cn("w-[240px]", className)}>
        <div className="flex items-center gap-2">
          <span className={cn(currentMode.icon, "text-base")}></span>
          <SelectValue />
        </div>
      </SelectTrigger>
      <SelectContent>
        {MODES.map((m) => (
          <SelectItem key={m.value} value={m.value}>
            <div className="flex items-center gap-2">
              <span className={cn(m.icon, "text-base")}></span>
              <div className="flex flex-col">
                <span className="font-medium">{t(`settings.enhancement.mode${m.value.charAt(0).toUpperCase() + m.value.slice(1)}`)}</span>
                <span className="text-xs text-white/70">{t(`settings.enhancement.mode${m.value.charAt(0).toUpperCase() + m.value.slice(1)}Desc`)}</span>
              </div>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
