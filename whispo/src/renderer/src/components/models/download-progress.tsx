type DownloadProgressProps = {
  progress: number
  speedLabel?: string
  etaLabel?: string
}

export function DownloadProgress({
  progress,
  speedLabel,
  etaLabel,
}: DownloadProgressProps) {
  const normalized = Math.min(100, Math.max(0, progress))
  return (
    <div className="space-y-2 py-1.5">
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${normalized}%` }}
        />
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{normalized.toFixed(0)}%</span>
        {speedLabel && <span>{speedLabel}</span>}
        {etaLabel && <span>{etaLabel} remaining</span>}
      </div>
    </div>
  )
}
