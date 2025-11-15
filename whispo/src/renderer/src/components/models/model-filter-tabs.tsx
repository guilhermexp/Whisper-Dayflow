import { Button } from "@renderer/components/ui/button"
import { Settings } from "lucide-react"

export type ModelFilter = "recommended" | "local" | "cloud" | "custom"

type ModelFilterTabsProps = {
  activeFilter: ModelFilter
  onFilterChange: (filter: ModelFilter) => void
  onToggleSettings: () => void
  settingsOpen: boolean
}

export function ModelFilterTabs({
  activeFilter,
  onFilterChange,
  onToggleSettings,
  settingsOpen,
}: ModelFilterTabsProps) {
  const filters: { label: string; value: ModelFilter }[] = [
    { label: "Recommended", value: "recommended" },
    { label: "Local", value: "local" },
    { label: "Cloud", value: "cloud" },
    { label: "Custom", value: "custom" },
  ]

  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {filters.map((filter) => (
          <Button
            key={filter.value}
            variant={activeFilter === filter.value ? "default" : "ghost"}
            size="sm"
            className="rounded-full"
            onClick={() => onFilterChange(filter.value)}
          >
            {filter.label}
          </Button>
        ))}
      </div>

      <Button
        variant={settingsOpen ? "default" : "ghost"}
        size="icon"
        className="rounded-full"
        onClick={onToggleSettings}
        aria-label="Toggle model settings"
      >
        <Settings className="h-4 w-4" />
      </Button>
    </div>
  )
}
