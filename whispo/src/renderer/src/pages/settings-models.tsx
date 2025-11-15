import { useMemo, useState } from "react"
import type {
  AnyModel,
  CHAT_PROVIDER_ID,
  CustomModel,
  ImportedLocalModel,
  LocalModel,
  STT_PROVIDER_ID,
} from "@shared/index"
import type { Config } from "@shared/types"
import {
  CHAT_PROVIDERS,
  RECOMMENDED_MODEL_IDS,
  STT_PROVIDERS,
} from "@shared/index"
import {
  useAddCustomModelMutation,
  useConfigQuery,
  useDeleteModelMutation,
  useDownloadModelMutation,
  useImportModelMutation,
  useModelDownloadProgressQuery,
  useModelsQuery,
  useRevealModelMutation,
  useSaveConfigMutation,
  useSetDefaultLocalModelMutation,
} from "@renderer/lib/query-client"
import { PageHeader } from "@renderer/components/page-header"
import { DefaultModelSection } from "@renderer/components/models/default-model-section"
import {
  ModelFilter,
  ModelFilterTabs,
} from "@renderer/components/models/model-filter-tabs"
import { ModelCard } from "@renderer/components/models/model-card"
import { Button } from "@renderer/components/ui/button"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@renderer/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@renderer/components/ui/dialog"
import { Input } from "@renderer/components/ui/input"
import { Textarea } from "@renderer/components/ui/textarea"
import { Switch } from "@renderer/components/ui/switch"
import { Spinner } from "@renderer/components/ui/spinner"
import { tipcClient } from "@renderer/lib/tipc-client"
import { cn } from "@renderer/lib/utils"

export function Component() {
  const configQuery = useConfigQuery()
  const saveConfigMutation = useSaveConfigMutation()
  const modelsQuery = useModelsQuery()
  const downloadModelMutation = useDownloadModelMutation()
  const deleteModelMutation = useDeleteModelMutation()
  const setDefaultMutation = useSetDefaultLocalModelMutation()
  const importModelMutation = useImportModelMutation()
  const addCustomModelMutation = useAddCustomModelMutation()
  const revealModelMutation = useRevealModelMutation()

  const [filter, setFilter] = useState<ModelFilter>("recommended")
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [customDialogOpen, setCustomDialogOpen] = useState(false)
  const [customForm, setCustomForm] = useState({
    displayName: "",
    description: "",
    endpoint: "",
    modelIdentifier: "",
    language: "english" as "english" | "multilingual",
    requiresApiKey: true,
  })

  const saveConfig = (next: Partial<Config>) => {
    if (!configQuery.data) return
    saveConfigMutation.mutate({
      config: {
        ...configQuery.data,
        ...next,
      },
    })
  }

  const models = modelsQuery.data || []
  const localModels = models.filter(
    (model) => model.provider === "local" || model.provider === "local-imported",
  )
  const recommendedModels = localModels.filter((model) =>
    RECOMMENDED_MODEL_IDS.includes(model.id),
  )
  const customModels = models.filter(
    (model): model is CustomModel => model.provider === "custom",
  )
  const defaultModel =
    models.find((model) => model.id === configQuery.data?.defaultLocalModel) ||
    null
  const availableLocalModels = localModels.filter((model) => {
    if (model.provider === "local-imported") return true
    return model.provider === "local" && model.isDownloaded
  })
  const downloadedLocalModels = availableLocalModels.map((model) => ({
    label: model.displayName,
    value: `local:${model.id}`,
  }))
  const sttProviderId =
    configQuery.data?.sttProviderId || STT_PROVIDERS[0]?.value || "openai"
  const transcriptPostProcessingProviderId =
    configQuery.data?.transcriptPostProcessingProviderId ||
    CHAT_PROVIDERS[0]?.value ||
    "openai"
  const transcriptPostProcessingPrompt =
    configQuery.data?.transcriptPostProcessingPrompt || ""
  const transcriptPostProcessingEnabled =
    configQuery.data?.transcriptPostProcessingEnabled ?? false

  const displayedModels = useMemo(() => {
    switch (filter) {
      case "recommended":
        return recommendedModels
      case "local":
        return localModels
      default:
        return []
    }
  }, [filter, recommendedModels, localModels])

  const isLoading = modelsQuery.isLoading || configQuery.isLoading

  const handleDownload = (modelId: string) => {
    downloadModelMutation.mutate({ modelId })
  }

  const handleDelete = async (modelId: string) => {
    if (configQuery.data?.defaultLocalModel === modelId) {
      saveConfig({ defaultLocalModel: undefined })
    }
    deleteModelMutation.mutate({ modelId })
  }

  const handleSetDefault = (modelId: string) => {
    setDefaultMutation.mutate({ modelId })
  }

  const handleReveal = (model: AnyModel) => {
    let localPath: string | undefined
    if (model.provider === "local") {
      localPath = (model as LocalModel).localPath
    } else if (model.provider === "local-imported") {
      localPath = (model as ImportedLocalModel).localPath
    }
    if (!localPath) return
    revealModelMutation.mutate({ filePath: localPath })
  }

  const handleImport = async () => {
    const filePath = await tipcClient.showModelImportDialog()
    if (!filePath) return
    importModelMutation.mutate({ filePath })
  }

  const handleAddCustomModel = () => {
    addCustomModelMutation.mutate(customForm, {
      onSuccess: () => {
        setCustomDialogOpen(false)
        setCustomForm({
          displayName: "",
          description: "",
          endpoint: "",
          modelIdentifier: "",
          language: "english",
          requiresApiKey: true,
        })
      },
    })
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Models"
        description="Manage speech-to-text providers, local downloads, and transcript post-processing."
      />

      <DefaultModelSection model={defaultModel} />

      <div className="grid gap-4 lg:grid-cols-2">
        <SpeechProviderCard
          sttProviderId={sttProviderId}
          sttProviders={STT_PROVIDERS}
          localOptions={downloadedLocalModels}
          onProviderChange={(value) => {
            saveConfig({
              sttProviderId: value as STT_PROVIDER_ID,
              defaultLocalModel: value.startsWith("local:")
                ? value.replace("local:", "")
                : configQuery.data?.defaultLocalModel,
            })
          }}
        />
        <TranscriptProcessingCard
          enabled={transcriptPostProcessingEnabled}
          providerId={transcriptPostProcessingProviderId}
          prompt={transcriptPostProcessingPrompt}
          onToggle={(value) =>
            saveConfig({ transcriptPostProcessingEnabled: value })
          }
          onProviderChange={(value) =>
            saveConfig({
              transcriptPostProcessingProviderId: value as CHAT_PROVIDER_ID,
            })
          }
          onPromptChange={(value) =>
            saveConfig({ transcriptPostProcessingPrompt: value })
          }
        />
      </div>

      <ModelFilterTabs
        activeFilter={filter}
        onFilterChange={(value) => setFilter(value)}
        onToggleSettings={() => setSettingsOpen((value) => !value)}
        settingsOpen={settingsOpen}
      />

      {settingsOpen && (
        <div className="rounded-lg border bg-muted/20 p-4">
          <h3 className="mb-3 text-sm font-semibold">Model Preferences</h3>
          <div className="space-y-3">
            <SettingToggle
              label="Auto-download recommended models"
              checked={configQuery.data?.autoDownloadRecommended ?? false}
              onCheckedChange={(value) =>
                saveConfig({ autoDownloadRecommended: value })
              }
            />
            <SettingToggle
              label="Enable model warmup"
              checked={configQuery.data?.enableModelWarmup ?? false}
              onCheckedChange={(value) =>
                saveConfig({ enableModelWarmup: value })
              }
            />
            <SettingToggle
              label="Prefer local models when available"
              checked={configQuery.data?.preferLocalModels ?? false}
              onCheckedChange={(value) =>
                saveConfig({ preferLocalModels: value })
              }
            />
          </div>
        </div>
      )}

      {filter === "cloud" && (
        <CloudProvidersCard
          config={configQuery.data}
          onConfigChange={saveConfig}
        />
      )}

      {filter === "custom" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-muted-foreground">
              Custom Models
            </h3>
            <Dialog open={customDialogOpen} onOpenChange={setCustomDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm">Add Custom Model</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Custom Model</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <Input
                    placeholder="Display name"
                    value={customForm.displayName}
                    onChange={(event) =>
                      setCustomForm((prev) => ({
                        ...prev,
                        displayName: event.currentTarget.value,
                      }))
                    }
                  />
                  <Input
                    placeholder="Description"
                    value={customForm.description}
                    onChange={(event) =>
                      setCustomForm((prev) => ({
                        ...prev,
                        description: event.currentTarget.value,
                      }))
                    }
                  />
                  <Input
                    placeholder="Endpoint URL"
                    value={customForm.endpoint}
                    onChange={(event) =>
                      setCustomForm((prev) => ({
                        ...prev,
                        endpoint: event.currentTarget.value,
                      }))
                    }
                  />
                  <Input
                    placeholder="Model identifier"
                    value={customForm.modelIdentifier}
                    onChange={(event) =>
                      setCustomForm((prev) => ({
                        ...prev,
                        modelIdentifier: event.currentTarget.value,
                      }))
                    }
                  />
                  <div className="flex items-center justify-between text-sm">
                    <span>Multilingual</span>
                    <Switch
                      checked={customForm.language === "multilingual"}
                      onCheckedChange={(checked) =>
                        setCustomForm((prev) => ({
                          ...prev,
                          language: checked ? "multilingual" : "english",
                        }))
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span>Requires API key</span>
                    <Switch
                      checked={customForm.requiresApiKey}
                      onCheckedChange={(checked) =>
                        setCustomForm((prev) => ({
                          ...prev,
                          requiresApiKey: checked,
                        }))
                      }
                    />
                  </div>
                  <Button onClick={handleAddCustomModel}>Save</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
          {customModels.length === 0 ? (
            <EmptyState message="No custom models added yet." />
          ) : (
            <div className="grid gap-3">
              {customModels.map((model) => (
                <div
                  key={model.id}
                  className="rounded-lg border bg-background p-4 text-sm"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold">{model.displayName}</div>
                      <p className="text-xs text-muted-foreground">
                        {model.description}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => handleDelete(model.id)}
                    >
                      Delete
                    </Button>
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    {model.endpoint}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {(filter === "recommended" || filter === "local") && (
        <>
          <div className="grid gap-3">
            {displayedModels.length === 0 ? (
              <EmptyState message="No models available for this filter." />
            ) : (
              displayedModels.map((model) => (
                <ModelCardWithProgress
                  key={model.id}
                  model={model}
                  isDefault={configQuery.data?.defaultLocalModel === model.id}
                  onDownload={() => handleDownload(model.id)}
                  onSetDefault={() => handleSetDefault(model.id)}
                  onDelete={() => handleDelete(model.id)}
                  onReveal={() => handleReveal(model)}
                />
              ))
            )}
          </div>
          {filter === "local" && (
            <div>
              <Button variant="outline" onClick={handleImport}>
                Import Local Model…
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

const SpeechProviderCard = ({
  sttProviderId,
  sttProviders,
  localOptions,
  onProviderChange,
}: {
  sttProviderId: string
  sttProviders: typeof STT_PROVIDERS
  localOptions: { label: string; value: string }[]
  onProviderChange: (value: string) => void
}) => {
  const activeLabel =
    sttProviders.find((provider) => provider.value === sttProviderId)?.label ||
    localOptions.find((option) => option.value === sttProviderId)?.label ||
    "Select provider"

  return (
    <div className="rounded-lg border bg-muted/20 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Speech to Text
      </p>
      <div className="mt-1 text-lg font-semibold text-white">{activeLabel}</div>
      <p className="text-sm text-muted-foreground">
        Switch between cloud engines or downloaded local models.
      </p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Provider
        </span>
        <Select value={sttProviderId} onValueChange={onProviderChange}>
          <SelectTrigger className="w-full sm:w-52">
            <SelectValue placeholder="Select provider" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>Cloud providers</SelectLabel>
              {sttProviders.map((provider) => (
                <SelectItem key={provider.value} value={provider.value}>
                  {provider.label}
                </SelectItem>
              ))}
            </SelectGroup>
            {localOptions.length > 0 && (
              <>
                <SelectSeparator />
                <SelectGroup>
                  <SelectLabel>Local models</SelectLabel>
                  {localOptions.map((model) => (
                    <SelectItem key={model.value} value={model.value}>
                      {model.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </>
            )}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

const TranscriptProcessingCard = ({
  enabled,
  providerId,
  prompt,
  onToggle,
  onProviderChange,
  onPromptChange,
}: {
  enabled: boolean
  providerId: string
  prompt: string
  onToggle: (value: boolean) => void
  onProviderChange: (value: string) => void
  onPromptChange: (value: string) => void
}) => {
  const [promptDialogOpen, setPromptDialogOpen] = useState(false)
  const providerLabel =
    CHAT_PROVIDERS.find((provider) => provider.value === providerId)?.label ||
    "Select provider"

  return (
    <div className="rounded-lg border bg-muted/20 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Transcript post-processing
          </p>
          <div className="mt-1 text-lg font-semibold text-white">
            {enabled ? providerLabel : "Disabled"}
          </div>
          <p className="text-sm text-muted-foreground">
            Clean up transcripts with your preferred LLM provider.
          </p>
        </div>
        <Switch checked={enabled} onCheckedChange={onToggle} />
      </div>
      {enabled && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Provider
            </span>
            <Select value={providerId} onValueChange={onProviderChange}>
              <SelectTrigger className="w-full md:w-52">
                <SelectValue placeholder="Select provider" />
              </SelectTrigger>
              <SelectContent>
                {CHAT_PROVIDERS.map((provider) => (
                  <SelectItem key={provider.value} value={provider.value}>
                    {provider.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
            <div className="flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground">
              <span>Prompt</span>
              <span>Supports {"{transcript}"}</span>
            </div>
            {prompt ? (
              <p className="text-sm text-muted-foreground line-clamp-3">
                {prompt}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Using the default clean-up instructions.
              </p>
            )}
            <Dialog open={promptDialogOpen} onOpenChange={setPromptDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="ml-auto">
                  Edit Prompt
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Transcript Prompt</DialogTitle>
                </DialogHeader>
                <Textarea
                  rows={8}
                  value={prompt}
                  onChange={(event) =>
                    onPromptChange(event.currentTarget.value)
                  }
                  placeholder="Provide custom instructions for post-processing…"
                />
                <div className="text-sm text-muted-foreground">
                  Use <span className="select-text">{"{transcript}"}</span> to
                  reference the original text.
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      )}
    </div>
  )
}

const ModelCardWithProgress = ({
  model,
  isDefault,
  onDownload,
  onSetDefault,
  onDelete,
  onReveal,
}: {
  model: AnyModel
  isDefault?: boolean
  onDownload?: () => void
  onSetDefault?: () => void
  onDelete?: () => void
  onReveal?: () => void
}) => {
  const shouldPoll =
    model.provider === "local" &&
    "isDownloaded" in model &&
    !model.isDownloaded
  const { data: downloadProgress } = useModelDownloadProgressQuery(
    shouldPoll ? model.id : undefined,
    {
      enabled: shouldPoll,
      refetchInterval: 750,
    },
  )

  return (
    <ModelCard
      model={model}
      isDefault={isDefault}
      onDownload={onDownload}
      onSetDefault={onSetDefault}
      onDelete={onDelete}
      onReveal={onReveal}
      downloadProgress={downloadProgress || undefined}
    />
  )
}

const CloudProvidersCard = ({
  config,
  onConfigChange,
}: {
  config?: Config | null
  onConfigChange: (next: Partial<Config>) => void
}) => {
  const providers: Array<{
    id: string
    name: string
    description: string
    ready: boolean
    apiKeyField: keyof Config
    baseUrlField: keyof Config
    basePlaceholder: string
  }> = [
    {
      id: "openai",
      name: "OpenAI Whisper",
      description: "whisper-1 via api.openai.com",
      ready: Boolean(config?.openaiApiKey),
      apiKeyField: "openaiApiKey",
      baseUrlField: "openaiBaseUrl",
      basePlaceholder: "https://api.openai.com/v1",
    },
    {
      id: "groq",
      name: "Groq Whisper",
      description: "whisper-large-v3 via groq.com",
      ready: Boolean(config?.groqApiKey),
      apiKeyField: "groqApiKey",
      baseUrlField: "groqBaseUrl",
      basePlaceholder: "https://api.groq.com/openai/v1",
    },
    {
      id: "gemini",
      name: "Gemini Flash",
      description: "gemini-1.5 via googleapis.com",
      ready: Boolean(config?.geminiApiKey),
      apiKeyField: "geminiApiKey",
      baseUrlField: "geminiBaseUrl",
      basePlaceholder: "https://generativelanguage.googleapis.com",
    },
  ]

  const handleChange = (field: keyof Config, value: string) => {
    onConfigChange({
      [field]: value,
    } as Partial<Config>)
  }

  return (
    <div className="grid gap-3">
      {providers.map((provider) => {
        const apiKeyValue =
          (config?.[provider.apiKeyField] as string | undefined) ?? ""
        const baseUrlValue =
          (config?.[provider.baseUrlField] as string | undefined) ?? ""
        return (
          <div
            key={provider.id}
            className="rounded-lg border bg-muted/20 p-4 text-sm"
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold text-white">{provider.name}</div>
                <p className="text-xs text-muted-foreground">
                  {provider.description}
                </p>
              </div>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-xs",
                  provider.ready
                    ? "bg-emerald-500/10 text-emerald-400"
                    : "bg-amber-500/10 text-amber-300",
                )}
              >
                {provider.ready ? "Configured" : "Missing API key"}
              </span>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <span>API Key</span>
                <Input
                  type="password"
                  value={apiKeyValue}
                  onChange={(event) =>
                    handleChange(provider.apiKeyField, event.currentTarget.value)
                  }
                  placeholder="sk-..."
                />
              </label>
              <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <span>API Base URL</span>
                <Input
                  type="url"
                  value={baseUrlValue}
                  onChange={(event) =>
                    handleChange(
                      provider.baseUrlField,
                      event.currentTarget.value,
                    )
                  }
                  placeholder={provider.basePlaceholder}
                />
              </label>
            </div>
          </div>
        )
      })}
    </div>
  )
}

const SettingToggle = ({
  label,
  checked,
  onCheckedChange,
}: {
  label: string
  checked: boolean
  onCheckedChange: (value: boolean) => void
}) => (
  <label className="flex items-center justify-between text-sm">
    <span>{label}</span>
    <Switch checked={checked} onCheckedChange={onCheckedChange} />
  </label>
)

const EmptyState = ({ message }: { message: string }) => (
  <div className="rounded-lg border border-dashed bg-muted/20 p-6 text-center text-sm text-muted-foreground">
    {message}
  </div>
)
