import { useState } from "react"
import { tipcClient } from "@renderer/lib/tipc-client"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Button } from "@renderer/components/ui/button"
import { SectionCard } from "@renderer/components/ui/section-card"
import { PromptEditor } from "@renderer/components/enhancement/PromptEditor"
import type { CustomPrompt } from "@shared/types/enhancement"
import type { Config } from "@shared/types"
import { PREDEFINED_PROMPTS } from "@shared/data/predefined-prompts"
import { Switch } from "@renderer/components/ui/switch"
import { Label } from "@renderer/components/ui/label"
import { Input } from "@renderer/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@renderer/components/ui/select"
import { cn } from "@renderer/lib/utils"
import { useTranslation } from "react-i18next"
import { PageHeader } from "@renderer/components/page-header"

export const Component = () => {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const [promptEditorOpen, setPromptEditorOpen] = useState(false)
  const [editingPrompt, setEditingPrompt] = useState<CustomPrompt | undefined>()
  const [viewingPrompt, setViewingPrompt] = useState<CustomPrompt | undefined>()
  const [openrouterModels, setOpenrouterModels] = useState<Array<{id: string; name: string}>>([])
  const [loadingOpenrouterModels, setLoadingOpenrouterModels] = useState(false)

  const { data: config } = useQuery({
    queryKey: ["config"],
    queryFn: async () => {
      return tipcClient.getConfig()
    },
  })

  const saveConfigMutation = useMutation({
    mutationFn: async (newConfig: Config) => {
      return tipcClient.saveConfig({ config: newConfig })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["config"] })
    },
  })

  const handleSaveConfig = (updates: Partial<Config>) => {
    if (!config) return
    saveConfigMutation.mutate({ ...config, ...updates })
  }

  const handleCreatePrompt = () => {
    setEditingPrompt(undefined)
    setPromptEditorOpen(true)
  }

  const handleEditPrompt = (prompt: CustomPrompt) => {
    setEditingPrompt(prompt)
    setViewingPrompt(undefined)
    setPromptEditorOpen(true)
  }

  const handleViewPrompt = (prompt: CustomPrompt) => {
    setViewingPrompt(prompt)
    setEditingPrompt(undefined)
    setPromptEditorOpen(true)
  }

  const handleSavePrompt = (prompt: CustomPrompt) => {
    if (!config) return

    const customPrompts = config.customPrompts || []
    const existingIndex = customPrompts.findIndex((p) => p.id === prompt.id)

    let newPrompts: CustomPrompt[]
    if (existingIndex >= 0) {
      // Update existing
      newPrompts = [...customPrompts]
      newPrompts[existingIndex] = prompt
    } else {
      // Add new
      newPrompts = [...customPrompts, prompt]
    }

    handleSaveConfig({ customPrompts: newPrompts })
  }

  const handleDeletePrompt = (promptId: string) => {
    if (!config) return
    const customPrompts = config.customPrompts || []
    const newPrompts = customPrompts.filter((p) => p.id !== promptId)
    handleSaveConfig({ customPrompts: newPrompts })
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

  const allPrompts = [
    ...PREDEFINED_PROMPTS,
    ...(config?.customPrompts || []),
  ]

  const selectedPrompt = allPrompts.find(
    (p) => p.id === (config?.selectedPromptId || "default"),
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("settings.enhancement.title")}
        description={t("settings.enhancement.description")}
      />

      {/* Enable Enhancement */}
      <SectionCard title={t("settings.enhancement.enable")}>
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>{t("settings.enhancement.enableAI")}</Label>
            <p className="text-xs text-white/70">
              {t("settings.enhancement.enableDesc")}
            </p>
          </div>
          <Switch
            checked={config?.enhancementEnabled ?? false}
            onCheckedChange={(checked) =>
              handleSaveConfig({ enhancementEnabled: checked })
            }
          />
        </div>
      </SectionCard>

      {/* Enhancement Provider */}
      <SectionCard
        title={t("settings.enhancement.provider")}
        description={t("settings.enhancement.providerDesc")}
      >
        <div className="space-y-4">
          <div>
            <Label>{t("settings.enhancement.selectProvider")}</Label>
            <Select
              value={config?.enhancementProvider ?? "openai"}
              onValueChange={(value) =>
                handleSaveConfig({
                  enhancementProvider: value as "openai" | "groq" | "gemini" | "openrouter" | "custom",
                })
              }
              disabled={!config?.enhancementEnabled}
            >
              <SelectTrigger className="w-full mt-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="openai">OpenAI (gpt-4o-mini)</SelectItem>
                <SelectItem value="groq">Groq (llama-3.1-70b)</SelectItem>
                <SelectItem value="gemini">Gemini (flash-002)</SelectItem>
                <SelectItem value="openrouter">OpenRouter</SelectItem>
                <SelectItem value="custom">{t("settings.enhancement.customProvider")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {config?.enhancementProvider === "openrouter" && (
            <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.02] p-4">
              {config?.openrouterApiKey ? (
                // API key já configurada - mostrar apenas seletor de modelo
                <div>
                  <Label htmlFor="openrouterModel">
                    Modelo
                  </Label>
                  {!openrouterModels || openrouterModels.length === 0 ? (
                    <Button
                      size="sm"
                      onClick={handleFetchOpenrouterModels}
                      disabled={loadingOpenrouterModels}
                      className="w-full mt-2"
                    >
                      {loadingOpenrouterModels ? (
                        <>
                          <span className="i-mingcute-loading-line animate-spin mr-2"></span>
                          Carregando modelos...
                        </>
                      ) : (
                        "Buscar Modelos Disponíveis"
                      )}
                    </Button>
                  ) : (
                    <Select
                      value={config?.openrouterModel || ""}
                      onValueChange={(value) =>
                        handleSaveConfig({ openrouterModel: value })
                      }
                    >
                      <SelectTrigger className="w-full mt-2">
                        <SelectValue placeholder="Selecione um modelo..." />
                      </SelectTrigger>
                      <SelectContent>
                        {openrouterModels.map((model) => (
                          <SelectItem key={model.id} value={model.id}>
                            {model.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <p className="text-xs text-white/60 mt-1">
                    API configurada na página de Modelos
                  </p>
                </div>
              ) : (
                // API key não configurada - mostrar aviso
                <div className="text-center py-4">
                  <p className="text-sm text-white/70 mb-3">
                    OpenRouter não está configurado
                  </p>
                  <p className="text-xs text-white/60">
                    Configure sua API key do OpenRouter na página <strong>Modelos</strong> para usar este provedor
                  </p>
                </div>
              )}
            </div>
          )}

          {config?.enhancementProvider === "custom" && (
            <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.02] p-4">
              <div>
                <Label htmlFor="customEnhancementApiKey">
                  {t("settings.enhancement.customApiKey")}
                </Label>
                <Input
                  id="customEnhancementApiKey"
                  type="password"
                  value={config?.customEnhancementApiKey ?? ""}
                  onChange={(e) =>
                    handleSaveConfig({ customEnhancementApiKey: e.target.value })
                  }
                  placeholder="sk-..."
                  className="mt-2"
                />
              </div>

              <div>
                <Label htmlFor="customEnhancementBaseUrl">
                  {t("settings.enhancement.customBaseUrl")}
                </Label>
                <Input
                  id="customEnhancementBaseUrl"
                  value={config?.customEnhancementBaseUrl ?? ""}
                  onChange={(e) =>
                    handleSaveConfig({ customEnhancementBaseUrl: e.target.value })
                  }
                  placeholder="https://api.example.com/v1"
                  className="mt-2"
                />
                <p className="text-xs text-white/60 mt-1">
                  {t("settings.enhancement.customBaseUrlDesc")}
                </p>
              </div>

              <div>
                <Label htmlFor="customEnhancementModel">
                  {t("settings.enhancement.customModel")}
                </Label>
                <Input
                  id="customEnhancementModel"
                  value={config?.customEnhancementModel ?? ""}
                  onChange={(e) =>
                    handleSaveConfig({ customEnhancementModel: e.target.value })
                  }
                  placeholder="model-name"
                  className="mt-2"
                />
                <p className="text-xs text-white/60 mt-1">
                  {t("settings.enhancement.customModelDesc")}
                </p>
              </div>
            </div>
          )}
        </div>
      </SectionCard>

      {/* Custom Prompts */}
      <SectionCard
        title={t("settings.enhancement.prompts")}
        description={t("settings.enhancement.promptsDesc")}
        action={
          <Button size="sm" onClick={handleCreatePrompt}>
            <span className="i-mingcute-add-line text-base mr-1"></span>
            {t("settings.enhancement.newPrompt")}
          </Button>
        }
      >
        <div className="space-y-2">
          {/* Predefined Prompts */}
          <div>
            <h4 className="text-xs uppercase tracking-wide text-white/60 mb-2">
              {t("settings.enhancement.predefinedPrompts")}
            </h4>
            <div className="space-y-2">
              {PREDEFINED_PROMPTS.map((prompt) => (
                <div
                  key={prompt.id}
                  className={cn(
                    "flex items-start justify-between rounded-xl border border-white/10 bg-white/[0.02] p-3 transition-all duration-200",
                    selectedPrompt?.id === prompt.id
                      ? "border-white/20 bg-white/[0.05]"
                      : "hover:border-white/15 hover:bg-white/[0.03]",
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-lg bg-white/5",
                        selectedPrompt?.id === prompt.id && "bg-white/10",
                      )}
                    >
                      <span className={cn(prompt.icon, "text-lg")}></span>
                    </div>
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">
                          {prompt.title}
                        </span>
                        {selectedPrompt?.id === prompt.id && (
                          <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs">
                            {t("settings.enhancement.active")}
                          </span>
                        )}
                      </div>
                      {prompt.description && (
                        <p className="text-xs text-white/70">
                          {prompt.description}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleViewPrompt(prompt)}
                    >
                      <span className="i-mingcute-eye-line"></span>
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        handleSaveConfig({ selectedPromptId: prompt.id })
                      }
                      disabled={selectedPrompt?.id === prompt.id}
                    >
                      {selectedPrompt?.id === prompt.id ? t("settings.enhancement.active") : t("settings.enhancement.use")}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Custom Prompts */}
          {config?.customPrompts && config.customPrompts.length > 0 && (
            <div className="mt-4">
              <h4 className="text-xs uppercase tracking-wide text-white/60 mb-2">
                {t("settings.enhancement.customPrompts")}
              </h4>
              <div className="space-y-2">
                {config.customPrompts.map((prompt) => (
                  <div
                    key={prompt.id}
                    className={cn(
                      "flex items-start justify-between rounded-xl border border-white/10 bg-white/[0.02] p-3 transition-all duration-200",
                      selectedPrompt?.id === prompt.id
                        ? "border-white/20 bg-white/[0.05]"
                        : "hover:border-white/15 hover:bg-white/[0.03]",
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={cn(
                          "flex h-8 w-8 items-center justify-center rounded-lg bg-white/5",
                          selectedPrompt?.id === prompt.id && "bg-white/10",
                        )}
                      >
                        <span className={cn(prompt.icon, "text-lg")}></span>
                      </div>
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">
                            {prompt.title}
                          </span>
                          {selectedPrompt?.id === prompt.id && (
                            <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs">
                              {t("settings.enhancement.active")}
                            </span>
                          )}
                        </div>
                        {prompt.description && (
                          <p className="text-xs text-white/70">
                            {prompt.description}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          handleSaveConfig({ selectedPromptId: prompt.id })
                        }
                        disabled={selectedPrompt?.id === prompt.id}
                      >
                        {selectedPrompt?.id === prompt.id ? t("settings.enhancement.active") : t("settings.enhancement.use")}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleEditPrompt(prompt)}
                      >
                        <span className="i-mingcute-edit-line"></span>
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDeletePrompt(prompt.id)}
                      >
                        <span className="i-mingcute-delete-line"></span>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </SectionCard>

      {/* Context Capture */}
      <SectionCard
        title={t("settings.enhancement.contextCapture")}
        description={t("settings.enhancement.contextCaptureDesc")}
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>{t("settings.enhancement.useClipboard")}</Label>
              <p className="text-xs text-white/70">
                {t("settings.enhancement.useClipboardDesc")}
              </p>
            </div>
            <Switch
              checked={config?.useClipboardContext ?? false}
              onCheckedChange={(checked) =>
                handleSaveConfig({ useClipboardContext: checked })
              }
              disabled={!config?.enhancementEnabled}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>{t("settings.enhancement.useSelectedText")}</Label>
              <p className="text-xs text-white/70">
                {t("settings.enhancement.useSelectedTextDesc")}
              </p>
            </div>
            <Switch
              checked={config?.useSelectedTextContext ?? false}
              onCheckedChange={(checked) =>
                handleSaveConfig({ useSelectedTextContext: checked })
              }
              disabled={!config?.enhancementEnabled}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>{t("settings.enhancement.useScreenCapture")}</Label>
              <p className="text-xs text-white/70">
                {t("settings.enhancement.useScreenCaptureDesc")}
              </p>
            </div>
            <Switch
              checked={config?.useScreenCaptureContext ?? false}
              onCheckedChange={(checked) =>
                handleSaveConfig({ useScreenCaptureContext: checked })
              }
              disabled={!config?.enhancementEnabled}
            />
          </div>
        </div>
      </SectionCard>

      <PromptEditor
        open={promptEditorOpen}
        onOpenChange={setPromptEditorOpen}
        prompt={viewingPrompt || editingPrompt}
        onSave={handleSavePrompt}
        readOnly={!!viewingPrompt}
      />
    </div>
  )
}
