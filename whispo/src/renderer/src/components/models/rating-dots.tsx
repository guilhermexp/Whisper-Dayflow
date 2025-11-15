import { cn } from "@renderer/lib/utils"

type RatingDotsProps = {
  label: string
  value: number
}

export function RatingDots({ label, value }: RatingDotsProps) {
  const clampedValue = Math.max(0, Math.min(10, value))
  const filledDots = Math.round(clampedValue / 2)
  const performanceColor = getPerformanceColor(clampedValue / 10)

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">
        {label}
      </span>
      <div className="flex items-center gap-1">
        {Array.from({ length: 5 }).map((_, index) => (
          <span
            key={index}
            className={cn(
              "h-1.5 w-1.5 rounded-full bg-muted transition-colors",
              index < filledDots && performanceColor,
            )}
          />
        ))}
      </div>
      <span className="text-xs font-mono text-muted-foreground">
        {clampedValue.toFixed(1)}
      </span>
    </div>
  )
}

const getPerformanceColor = (value: number) => {
  if (value >= 0.8) return "bg-green-500"
  if (value >= 0.6) return "bg-yellow-500"
  if (value >= 0.4) return "bg-orange-500"
  return "bg-red-500"
}
