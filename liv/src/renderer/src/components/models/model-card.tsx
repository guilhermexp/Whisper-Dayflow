import { Button } from "@renderer/components/ui/button"
import { Input } from "@renderer/components/ui/input"
import { DownloadProgress } from "./download-progress"
import { RatingDots } from "./rating-dots"
import type {
  AnyModel,
  DownloadProgress as DownloadProgressType,
  LocalModel,
} from "@shared/index"
import { Globe, HardDrive, Cpu, Download, Loader2, Cloud, Settings } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@renderer/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@renderer/components/ui/select"
import { useState, useMemo } from "react"

type ModelCardProps = {
  model: AnyModel
  isDefault?: boolean
  onDownload?: () => void
  onSetDefault?: () => void
  onDelete?: () => void
  onReveal?: () => void
  downloadProgress?: DownloadProgressType | null
  // Cloud provider specific props
  apiKeyValue?: string
  baseUrlValue?: string
  basePlaceholder?: string
  onApiKeyChange?: (value: string) => void
  onBaseUrlChange?: (value: string) => void
  // Generic model selection props (works for any provider)
  availableModels?: Array<{id: string; name: string}>
  selectedModel?: string
  onModelChange?: (model: string) => void
  // Optional: for providers that need to fetch models dynamically (like OpenRouter)
  onFetchModels?: () => void
  isLoadingModels?: boolean
}

export function ModelCard({
  model,
  isDefault,
  onDownload,
  onSetDefault,
  onDelete,
  onReveal,
  downloadProgress,
  apiKeyValue,
  baseUrlValue,
  basePlaceholder,
  onApiKeyChange,
  onBaseUrlChange,
  availableModels,
  selectedModel,
  onModelChange,
  onFetchModels,
  isLoadingModels,
}: ModelCardProps) {
  const [configDialogOpen, setConfigDialogOpen] = useState(false)
  const [modelSearchQuery, setModelSearchQuery] = useState("")
  const isLocal = model.provider === "local"
  const isImported = model.provider === "local-imported"
  const isCloudProvider = model.provider === "openai" || model.provider === "groq" || model.provider === "gemini" || model.provider === "openrouter"
  const supportsModelSelection = availableModels && availableModels.length > 0 && onModelChange
  const needsFetchModels = onFetchModels && (!availableModels || availableModels.length === 0 || availableModels[0]?.id === "")
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

  // Filter models based on search query
  const filteredModels = useMemo(() => {
    if (!availableModels) return []
    if (!modelSearchQuery.trim()) return availableModels

    const query = modelSearchQuery.toLowerCase()
    return availableModels.filter(m =>
      m.id.toLowerCase().includes(query) ||
      m.name.toLowerCase().includes(query)
    )
  }, [availableModels, modelSearchQuery])

  return (
    <div
      className={`rounded-lg border p-2.5 transition-colors ${isDefault ? "border-primary bg-primary/5" : "bg-background"}`}
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="text-[13px] font-semibold">{model.displayName}</div>
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          {isDefault && !isCloudProvider && <StatusBadge label="Default" />}
          {isDefault && isCloudProvider && <StatusBadge label="Active" />}
          {isCloudProvider && apiKeyValue && <StatusBadge label="Configured" />}
          {isCloudProvider && !apiKeyValue && <StatusBadge label="Missing API Key" variant="warning" />}
          {isDownloaded && !isDefault && <StatusBadge label="Downloaded" />}
          {isImported && <StatusBadge label="Imported" />}
        </div>
      </div>

      {renderMetadata(localModel)}

      {isCloudProvider && (
        <div className="mb-1.5 flex items-center gap-2 text-[10px] text-muted-foreground">
          <div className="flex items-center gap-1">
            <Cloud className="h-3 w-3" />
            <span>{model.description}</span>
          </div>
        </div>
      )}

      {!isCloudProvider && (
        <p className="mb-2 line-clamp-2 text-[10px] text-muted-foreground">
          {model.description}
        </p>
      )}

      {isCloudProvider && onApiKeyChange && onBaseUrlChange && (
        <Dialog open={configDialogOpen} onOpenChange={setConfigDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline" className="gap-1 h-7 text-[11px]">
              <Settings className="h-3 w-3" />
              Configure API
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{model.displayName} Configuration</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <label htmlFor={`${model.id}-api-key`} className="text-sm font-medium">
                  API Key
                </label>
                <Input
                  id={`${model.id}-api-key`}
                  type="password"
                  value={apiKeyValue || ""}
                  onChange={(e) => onApiKeyChange(e.currentTarget.value)}
                  placeholder="sk-..."
                />
              </div>
              <div className="space-y-2">
                <label htmlFor={`${model.id}-base-url`} className="text-sm font-medium">
                  Base URL
                </label>
                <Input
                  id={`${model.id}-base-url`}
                  type="url"
                  value={baseUrlValue || ""}
                  onChange={(e) => onBaseUrlChange(e.currentTarget.value)}
                  placeholder={basePlaceholder}
                />
              </div>
              {(supportsModelSelection || needsFetchModels) && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label htmlFor={`${model.id}-model`} className="text-sm font-medium">
                      Model
                    </label>
                    {supportsModelSelection && availableModels && availableModels.length > 0 && (
                      <span className="text-xs text-muted-foreground">
                        {filteredModels.length} of {availableModels.length} models
                      </span>
                    )}
                  </div>
                  {needsFetchModels ? (
                    <Button
                      size="sm"
                      onClick={onFetchModels}
                      disabled={isLoadingModels || !apiKeyValue}
                    >
                      {isLoadingModels ? (
                        <>
                          <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                          Loading models...
                        </>
                      ) : (
                        "Fetch Available Models"
                      )}
                    </Button>
                  ) : (
                    <>
                      {availableModels && availableModels.length > 10 && (
                        <Input
                          placeholder="Search models..."
                          value={modelSearchQuery}
                          onChange={(e) => setModelSearchQuery(e.currentTarget.value)}
                          className="mb-2"
                        />
                      )}
                      <Select
                        value={selectedModel || ""}
                        onValueChange={onModelChange}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select a model..." />
                        </SelectTrigger>
                        <SelectContent className="max-h-[400px]">
                          {filteredModels.length === 0 ? (
                            <div className="px-2 py-6 text-center text-sm text-muted-foreground">
                              No models found
                            </div>
                          ) : (
                            filteredModels.map((m) => (
                              <SelectItem key={m.id} value={m.id}>
                                {m.name}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                    </>
                  )}
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {isDownloading && downloadProgress && (
        <DownloadProgress
          progress={downloadProgress.progress}
          speedLabel={speedLabel}
          etaLabel={etaLabel}
        />
      )}

      <div className="mt-2 flex flex-wrap items-center justify-end gap-1.5">
        {!isDownloaded && isLocal && (
          <Button
            size="sm"
            className="gap-1 h-7 text-[11px]"
            onClick={onDownload}
            disabled={isDownloading}
          >
            {isDownloading ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                Downloading…
              </>
            ) : (
              <>
                <Download className="h-3 w-3" />
                Download
              </>
            )}
          </Button>
        )}

        {isDownloaded && !isDefault && (
          <Button size="sm" className="h-7 text-[11px]" onClick={onSetDefault}>
            Set as Default
          </Button>
        )}

        {isCloudProvider && !isDefault && onSetDefault && (
          <Button size="sm" className="h-7 text-[11px]" onClick={onSetDefault}>
            Set as Default
          </Button>
        )}

        {isDefault && (
          <span className="text-[10px] text-muted-foreground">
            {isCloudProvider ? "Active provider" : "Default model"}
          </span>
        )}

        {isDownloaded && (onReveal || onDelete) && (
          <>
            {onReveal && (
              <Button variant="ghost" size="sm" className="h-7 text-[11px]" onClick={onReveal}>
                Reveal
              </Button>
            )}
            {onDelete && (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive h-7 text-[11px]"
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
    <div className="mb-1.5 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
      <div className="flex items-center gap-0.5">
        <Globe className="h-3 w-3" />
        <span className="capitalize">{model.language}</span>
      </div>
      <div className="flex items-center gap-0.5">
        <HardDrive className="h-3 w-3" />
        <span>{model.size}</span>
      </div>
      <RatingDots label="Speed" value={model.speed} />
      <RatingDots label="Accuracy" value={model.accuracy} />
      <div className="flex items-center gap-0.5">
        <Cpu className="h-3 w-3" />
        <span>{model.ramUsage} GB RAM</span>
      </div>
    </div>
  )
}

const StatusBadge = ({ label, variant }: { label: string; variant?: "default" | "warning" }) => (
  <span className={`rounded-full px-1.5 py-0.5 text-[9px] uppercase tracking-tight ${
    variant === "warning"
      ? "bg-amber-500/10 text-amber-300"
      : "bg-muted"
  }`}>
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
