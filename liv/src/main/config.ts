import { app } from "electron"
import path from "path"
import fs from "fs"
import { Config } from "@shared/types"
import {
  getSystemAutoLaunchPreference,
  syncAutoLaunchSetting,
} from "./auto-launch"
import { PREDEFINED_PROMPTS } from "../shared/data/predefined-prompts"
import { mediaController } from "./services/media-controller"

const DEFAULT_PROFILE_WIDGETS: Config["profileWidgetsEnabled"] = [
  "work_time_daily",
  "parallelism",
  "engagement_topics",
  "meeting_suggestions",
  "top_projects",
  "top_people",
  "business_opportunities",
  "focus_risks",
]

/**
 * Atomically writes data to a file to prevent corruption
 * Writes to a temporary file first, then renames it
 */
const atomicWriteFileSync = (filePath: string, data: string) => {
  const tmpPath = `${filePath}.tmp`
  try {
    fs.writeFileSync(tmpPath, data, "utf8")
    fs.renameSync(tmpPath, filePath)
  } catch (error) {
    // Clean up temp file if it exists
    if (fs.existsSync(tmpPath)) {
      fs.unlinkSync(tmpPath)
    }
    throw error
  }
}

export const dataFolder = path.join(app.getPath("appData"), process.env.APP_ID)

export const recordingsFolder = path.join(dataFolder, "recordings")

export const configPath = path.join(dataFolder, "config.json")

const LOCAL_PROVIDER_PREFIX = "local:"

const getConfig = () => {
  try {
    return JSON.parse(fs.readFileSync(configPath, "utf8")) as Config
  } catch {
    return {}
  }
}

const getDefaultLanguage = (): "en-US" | "pt-BR" => {
  // Try to get system locale
  const locale = app.getLocale()

  if (locale.startsWith("pt")) {
    return "pt-BR"
  }

  return "en-US"
}

const withDefaults = (config?: Config): Config => {
  return {
    enableAudioCues: true,
    audioVolume: config?.audioVolume ?? 0.7,
    launchOnStartup: getSystemAutoLaunchPreference(),
    preferLocalModels: config?.preferLocalModels ?? false,
    language: config?.language ?? getDefaultLanguage(),

    // Enhancement defaults
    enhancementEnabled: config?.enhancementEnabled ?? false,
    enhancementProvider: config?.enhancementProvider ?? "openai",
    selectedPromptId: config?.selectedPromptId ?? "default",
    customPrompts: config?.customPrompts ?? [],
    enhancementTimeout: config?.enhancementTimeout ?? 30000,

    // Auto-journal (experimental) defaults
    autoJournalEnabled: config?.autoJournalEnabled ?? false,
    autoJournalWindowMinutes: config?.autoJournalWindowMinutes ?? 60,
    autoJournalTargetPilePath: config?.autoJournalTargetPilePath ?? "",
    autoJournalAutoSaveEnabled: config?.autoJournalAutoSaveEnabled ?? false,
    autoJournalSourceMode: config?.autoJournalSourceMode ?? "both",
    autoJournalPrompt: config?.autoJournalPrompt ?? "",
    autoJournalIncludeScreenCapture:
      config?.autoJournalIncludeScreenCapture ?? false,
    ragEmbeddingProvider: config?.ragEmbeddingProvider ?? "ollama",
    forceLocalRagEmbeddings: config?.forceLocalRagEmbeddings ?? true,
    embeddingModel: config?.embeddingModel ?? "qwen3-embedding:0.6b",
    ollamaBaseUrl: config?.ollamaBaseUrl ?? "http://localhost:11434",
    profileWidgetsEnabled:
      config?.profileWidgetsEnabled ?? DEFAULT_PROFILE_WIDGETS,
    timelineExpanded: config?.timelineExpanded ?? true,

    // Context capture defaults
    useClipboardContext: config?.useClipboardContext ?? false,
    useSelectedTextContext: config?.useSelectedTextContext ?? false,
    useScreenCaptureContext: config?.useScreenCaptureContext ?? false,

    // Periodic screenshot capture defaults
    periodicScreenshotEnabled: config?.periodicScreenshotEnabled ?? false,
    periodicScreenshotIntervalMinutes:
      config?.periodicScreenshotIntervalMinutes ?? 60,
    screenSessionRecordingEnabled:
      config?.screenSessionRecordingEnabled ?? false,
    screenSessionCaptureIntervalSeconds:
      config?.screenSessionCaptureIntervalSeconds ?? 5,

    ...config,
  }
}

const applyConfigMigrations = (
  config: Config,
): { config: Config; modified: boolean } => {
  let modified = false
  const nextConfig = { ...config }

  if (nextConfig.defaultLocalModel && !nextConfig.sttProviderId) {
    nextConfig.sttProviderId = `${LOCAL_PROVIDER_PREFIX}${nextConfig.defaultLocalModel}`
    modified = true
  }

  if (
    nextConfig.defaultLocalModel &&
    nextConfig.preferLocalModels === undefined
  ) {
    nextConfig.preferLocalModels = true
    modified = true
  }

  return { config: nextConfig, modified }
}

class ConfigStore {
  config: Config | undefined

  constructor() {
    const initialConfig = withDefaults(getConfig())
    const { config: migratedConfig, modified } =
      applyConfigMigrations(initialConfig)
    this.config = migratedConfig
    syncAutoLaunchSetting(this.config.launchOnStartup ?? false)
    if (modified) {
      this.persist()
    }
  }

  get() {
    return this.config || {}
  }

  save(config: Config) {
    const next = withDefaults(config)
    const { config: migratedConfig } = applyConfigMigrations(next)
    this.config = migratedConfig
    syncAutoLaunchSetting(this.config.launchOnStartup ?? false)

    // Update media controller when config changes
    mediaController.setEnabled(this.config.isPauseMediaEnabled ?? false)

    this.persist()
  }

  private persist() {
    fs.mkdirSync(dataFolder, { recursive: true })
    atomicWriteFileSync(configPath, JSON.stringify(this.config, null, 2))
  }
}

export const configStore = new ConfigStore()
