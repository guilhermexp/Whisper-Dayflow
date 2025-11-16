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
} from "@renderer/lib/query-client"
import { PageHeader } from "@renderer/components/page-header"
import type { ModelFilter } from "@renderer/components/models/model-filter-tabs"
import { ModelFilterTabs } from "@renderer/components/models/model-filter-tabs"
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
import { CARD_BASE_CLASS, SectionCard } from "@renderer/components/ui/section-card"
import { cn } from "@renderer/lib/utils"
import { PREDEFINED_MODELS } from "@shared/predefined-models"

export function Component() {
  const configQuery = useConfigQuery()
  const saveConfigMutation = useSaveConfigMutation()
  const modelsQuery = useModelsQuery()
  const downloadModelMutation = useDownloadModelMutation()
  const deleteModelMutation = useDeleteModelMutation()

  const importModelMutation = useImportModelMutation()
  const addCustomModelMutation = useAddCustomModelMutation()
  const revealModelMutation = useRevealModelMutation()

  const [filter, setFilter] = useState<ModelFilter>("local")
  const [openrouterModels, setOpenrouterModels] = useState<Array<{id: string; name: string}>>([])
  const [loadingOpenrouterModels, setLoadingOpenrouterModels] = useState(false)
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
  const customModels = models.filter(
    (model): model is CustomModel => model.provider === "custom",
  )
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
      case "local":
        return localModels
      default:
        return []
    }
  }, [filter, localModels])

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
    saveConfig({
      sttProviderId: `local:${modelId}` as STT_PROVIDER_ID,
      defaultLocalModel: modelId
    })
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

  const handleFetchOpenrouterModels = async () => {
    setLoadingOpenrouterModels(true)
    try {
      const models = await tipcClient.fetchOpenRouterModels()
      setOpenrouterModels(models.map(m => ({ id: m.id, name: m.name })))
    } catch (error) {
      console.error("Failed to fetch OpenRouter models:", error)
    } finally {
      setLoadingOpenrouterModels(false)
    }
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

      <UnifiedSettingsCard
        sttProviderId={sttProviderId}
        sttProviders={STT_PROVIDERS}
        localOptions={downloadedLocalModels}
        onSttProviderChange={(value) => {
          saveConfig({
            sttProviderId: value as STT_PROVIDER_ID,
            defaultLocalModel: value.startsWith("local:")
              ? value.replace("local:", "")
              : configQuery.data?.defaultLocalModel,
          })
        }}
        transcriptPostProcessingEnabled={transcriptPostProcessingEnabled}
        transcriptProviderId={transcriptPostProcessingProviderId}
        transcriptPrompt={transcriptPostProcessingPrompt}
        onTogglePostProcessing={(value) =>
          saveConfig({ transcriptPostProcessingEnabled: value })
        }
        onTranscriptProviderChange={(value) =>
          saveConfig({
            transcriptPostProcessingProviderId: value as CHAT_PROVIDER_ID,
          })
        }
        onPromptChange={(value) =>
          saveConfig({ transcriptPostProcessingPrompt: value })
        }
      />

      <ModelFilterTabs
        activeFilter={filter}
        onFilterChange={(value) => setFilter(value)}
        onToggleSettings={() => setSettingsOpen((value) => !value)}
        settingsOpen={settingsOpen}
      />

      {settingsOpen && (
        <SectionCard title="Model Preferences" description="Fine-tune how Whispo handles provider models.">
          <div className="space-y-3 text-sm">
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
        </SectionCard>
      )}

      {filter === "cloud" && (
        <SectionCard
          title="Cloud providers"
          description="Configure API keys and endpoints for Whisper-compatible services."
        >
          <div className="grid gap-3">
          {[...STT_PROVIDERS, { label: "Gemini", value: "gemini" }].map((provider) => {
            const apiKeyField = `${provider.value}ApiKey` as keyof Config
            const baseUrlField = `${provider.value}BaseUrl` as keyof Config
            const apiKeyValue = (configQuery.data?.[apiKeyField] as string | undefined) ?? ""
            const baseUrlValue = (configQuery.data?.[baseUrlField] as string | undefined) ?? ""
            const isActive = sttProviderId === provider.value

            const basePlaceholder =
              provider.value === "openai" ? "https://api.openai.com/v1" :
              provider.value === "groq" ? "https://api.groq.com/openai/v1" :
              provider.value === "openrouter" ? "https://openrouter.ai/api/v1" :
              "https://generativelanguage.googleapis.com"

            const description =
              provider.value === "openai" ? "whisper-1 via api.openai.com" :
              provider.value === "groq" ? "whisper-large-v3 via groq.com" :
              provider.value === "openrouter" ? "Multiple models via openrouter.ai" :
              "gemini-1.5 via googleapis.com"

            const displayName =
              provider.value === "gemini" ? "Gemini Flash" :
              provider.value === "openrouter" ? "OpenRouter" :
              `${provider.label} Whisper`

            const cloudModel = {
              id: provider.value,
              displayName: displayName,
              description: description,
              provider: provider.value,
            } as AnyModel

            // Determine which models and handlers to use
            let modelProps = {}

            if (provider.value === "openrouter") {
              // OpenRouter uses dynamic model fetching
              modelProps = {
                availableModels: openrouterModels.length > 0 ? openrouterModels : [{ id: "", name: "" }],
                selectedModel: configQuery.data?.openrouterModel,
                onModelChange: (model: string) => saveConfig({ openrouterModel: model }),
                onFetchModels: handleFetchOpenrouterModels,
                isLoadingModels: loadingOpenrouterModels
              }
            } else if (provider.value === "openai") {
              // OpenAI uses predefined models
              modelProps = {
                availableModels: PREDEFINED_MODELS.openai,
                selectedModel: configQuery.data?.openaiWhisperModel,
                onModelChange: (model: string) => saveConfig({ openaiWhisperModel: model })
              }
            } else if (provider.value === "groq") {
              // Groq uses predefined models
              modelProps = {
                availableModels: PREDEFINED_MODELS.groq,
                selectedModel: configQuery.data?.groqWhisperModel,
                onModelChange: (model: string) => saveConfig({ groqWhisperModel: model })
              }
            } else if (provider.value === "gemini") {
              // Gemini uses predefined models
              modelProps = {
                availableModels: PREDEFINED_MODELS.gemini,
                selectedModel: configQuery.data?.geminiModel,
                onModelChange: (model: string) => saveConfig({ geminiModel: model })
              }
            }

            return (
              <ModelCard
                key={provider.value}
                model={cloudModel}
                isDefault={isActive}
                apiKeyValue={apiKeyValue}
                baseUrlValue={baseUrlValue}
                basePlaceholder={basePlaceholder}
                onApiKeyChange={(value) => saveConfig({ [apiKeyField]: value })}
                onBaseUrlChange={(value) => saveConfig({ [baseUrlField]: value })}
                onSetDefault={() => saveConfig({ sttProviderId: provider.value as STT_PROVIDER_ID })}
                {...modelProps}
              />
            )
          })}
          </div>
        </SectionCard>
      )}

      {filter === "custom" && (
        <SectionCard
          title="Custom models"
          description="Register third-party endpoints or internal services."
        >
          <div className="flex items-center justify-between">
            <div className="text-sm text-white/70">
              Add bespoke providers via HTTPS endpoints.
            </div>
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
            <div className="mt-4 grid gap-3">
              {customModels.map((model) => (
                <div
                  key={model.id}
                  className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-sm"
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
        </SectionCard>
      )}

      {filter === "local" && (
        <SectionCard
          title="Local models"
          description="Manage downloaded GGML/GGUF models stored on this machine."
          action={
            <Button variant="outline" size="sm" onClick={handleImport}>
              Import Local Model…
            </Button>
          }
        >
          <div className="grid gap-3">
            {displayedModels.length === 0 ? (
              <EmptyState message="No models available for this filter." />
            ) : (
              displayedModels.map((model) => (
                <ModelCardWithProgress
                  key={model.id}
                  model={model}
                  isDefault={sttProviderId === `local:${model.id}`}
                  onDownload={() => handleDownload(model.id)}
                  onSetDefault={() => handleSetDefault(model.id)}
                  onDelete={() => handleDelete(model.id)}
                  onReveal={() => handleReveal(model)}
                />
              ))
            )}
          </div>
        </SectionCard>
      )}
    </div>
  )
}

const UnifiedSettingsCard = ({
  sttProviderId,
  sttProviders,
  localOptions,
  onSttProviderChange,
  transcriptPostProcessingEnabled,
  transcriptProviderId,
  transcriptPrompt,
  onTogglePostProcessing,
  onTranscriptProviderChange,
  onPromptChange,
}: {
  sttProviderId: string
  sttProviders: typeof STT_PROVIDERS
  localOptions: { label: string; value: string }[]
  onSttProviderChange: (value: string) => void
  transcriptPostProcessingEnabled: boolean
  transcriptProviderId: string
  transcriptPrompt: string
  onTogglePostProcessing: (value: boolean) => void
  onTranscriptProviderChange: (value: string) => void
  onPromptChange: (value: string) => void
}) => {
  const [promptDialogOpen, setPromptDialogOpen] = useState(false)

  return (
    <div className={CARD_BASE_CLASS}>
      <div className="grid gap-4 md:grid-cols-2">
        {/* Speech to Text */}
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Speech to Text
          </p>
          <Select value={sttProviderId} onValueChange={onSttProviderChange}>
            <SelectTrigger className="w-full">
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

        {/* Transcript Post-Processing */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Post-Processing
            </p>
            <Switch checked={transcriptPostProcessingEnabled} onCheckedChange={onTogglePostProcessing} />
          </div>
          {transcriptPostProcessingEnabled && (
            <div className="flex items-center gap-3">
              <Select value={transcriptProviderId} onValueChange={onTranscriptProviderChange}>
                <SelectTrigger className="w-32">
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
              <Dialog open={promptDialogOpen} onOpenChange={setPromptDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline">
                    Edit Prompt
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Transcript Prompt</DialogTitle>
                  </DialogHeader>
                  <Textarea
                    rows={8}
                    value={transcriptPrompt}
                    onChange={(event) => onPromptChange(event.currentTarget.value)}
                    placeholder="Provide custom instructions for post-processing…"
                  />
                  <div className="text-sm text-muted-foreground">
                    Use <span className="select-text">{"{transcript}"}</span> to reference the original text.
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          )}
        </div>
      </div>
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



const SettingToggle = ({
  label,
  checked,
  onCheckedChange,
}: {
  label: string
  checked: boolean
  onCheckedChange: (value: boolean) => void
}) => {
  const id = `toggle-${label.toLowerCase().replace(/\s+/g, "-")}`
  return (
    <label
      htmlFor={id}
      className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-sm text-white/80"
    >
      <span>{label}</span>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
    </label>
  )
}

const EmptyState = ({ message }: { message: string }) => (
  <div
    className={cn(
      CARD_BASE_CLASS,
      "border-dashed text-center text-sm text-white/70",
    )}
  >
    {message}
  </div>
)
