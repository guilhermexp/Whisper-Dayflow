import { Button } from "@renderer/components/ui/button"
import { DownloadProgress } from "./download-progress"
import { RatingDots } from "./rating-dots"
import type {
  AnyModel,
  DownloadProgress as DownloadProgressType,
  LocalModel,
} from "@shared/index"
import { Globe, HardDrive, Cpu, Download, Loader2 } from "lucide-react"

type ModelCardProps = {
  model: AnyModel
  isDefault?: boolean
  onDownload?: () => void
  onSetDefault?: () => void
  onDelete?: () => void
  onReveal?: () => void
  downloadProgress?: DownloadProgressType | null
}

export function ModelCard({
  model,
  isDefault,
  onDownload,
  onSetDefault,
  onDelete,
  onReveal,
  downloadProgress,
}: ModelCardProps) {
  const isLocal = model.provider === "local"
  const isImported = model.provider === "local-imported"
  const localModel = (isLocal ? model : null) as LocalModel | null
  const isDownloaded =
    (isLocal && !!localModel?.isDownloaded && !!localModel?.localPath) ||
    isImported
  const isDownloading =
    downloadProgress?.status === "downloading" ||
    downloadProgress?.status === "verifying"

  const speedLabel = downloadProgress?.speed
    ? `${(downloadProgress.speed / (1024 * 1024)).toFixed(2)} MB/s`
    : undefined
  const etaLabel =
    downloadProgress?.eta && Number.isFinite(downloadProgress.eta)
      ? formatSeconds(downloadProgress.eta)
      : undefined

  return (
    <div
      className={`rounded-lg border p-4 transition-colors ${isDefault ? "border-primary bg-primary/5" : "bg-background"}`}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-sm font-semibold">{model.displayName}</div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          {isDefault && <StatusBadge label="Default" />}
          {isDownloaded && !isDefault && <StatusBadge label="Downloaded" />}
          {isImported && <StatusBadge label="Imported" />}
        </div>
      </div>

      {renderMetadata(localModel)}

      <p className="mb-3 line-clamp-2 text-xs text-muted-foreground">
        {model.description}
      </p>

      {isDownloading && downloadProgress && (
        <DownloadProgress
          progress={downloadProgress.progress}
          speedLabel={speedLabel}
          etaLabel={etaLabel}
        />
      )}

      <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
        {!isDownloaded && isLocal && (
          <Button
            size="sm"
            className="gap-1"
            onClick={onDownload}
            disabled={isDownloading}
          >
            {isDownloading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Downloading…
              </>
            ) : (
              <>
                <Download className="h-3.5 w-3.5" />
                Download
              </>
            )}
          </Button>
        )}

        {isDownloaded && !isDefault && (
          <Button size="sm" onClick={onSetDefault}>
            Set as Default
          </Button>
        )}

        {isDefault && (
          <span className="text-xs text-muted-foreground">Default model</span>
        )}

        {isDownloaded && (onReveal || onDelete) && (
          <>
            {onReveal && (
              <Button variant="ghost" size="sm" onClick={onReveal}>
                Reveal
              </Button>
            )}
            {onDelete && (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive"
                onClick={onDelete}
              >
                Delete
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

const renderMetadata = (model: LocalModel | null) => {
  if (!model) return null

  return (
    <div className="mb-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
      <div className="flex items-center gap-1">
        <Globe className="h-3.5 w-3.5" />
        <span className="capitalize">{model.language}</span>
      </div>
      <div className="flex items-center gap-1">
        <HardDrive className="h-3.5 w-3.5" />
        <span>{model.size}</span>
      </div>
      <RatingDots label="Speed" value={model.speed} />
      <RatingDots label="Accuracy" value={model.accuracy} />
      <div className="flex items-center gap-1">
        <Cpu className="h-3.5 w-3.5" />
        <span>{model.ramUsage} GB RAM</span>
      </div>
    </div>
  )
}

const StatusBadge = ({ label }: { label: string }) => (
  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] uppercase tracking-tight">
    {label}
  </span>
)

const formatSeconds = (seconds: number) => {
  if (seconds < 60) {
    return `${seconds.toFixed(0)}s`
  }
  const minutes = Math.floor(seconds / 60)
  const remaining = seconds % 60
  return `${minutes}m ${remaining.toFixed(0)}s`
}
