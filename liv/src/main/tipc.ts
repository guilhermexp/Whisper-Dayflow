import fs from "fs"
import { getRendererHandlers, tipc } from "@egoist/tipc/main"
import { showPanelWindow, WINDOWS } from "./window"
import {
  app,
  clipboard,
  Menu,
  shell,
  systemPreferences,
  dialog,
  desktopCapturer,
} from "electron"
import path from "path"
import { configStore, recordingsFolder } from "./config"
import { modelManager } from "./model-manager"
import type {
  AutoJournalActivity,
  Config,
  RecordingAudioProfile,
  RecordingHistoryItem,
  RecordingHistorySearchFilters,
} from "../shared/types"
import { RendererHandlers } from "./renderer-handlers"
import {
  postProcessTranscript,
  generateAutoJournalSummaryFromHistory,
} from "./llm"
import { enhancementService } from "./services/enhancement-service"
import { abortOngoingTranscription, state } from "./state"
import { updateTrayIcon } from "./tray"
import { isAccessibilityGranted } from "./utils"
import { writeText, openAccessibilitySettings } from "./keyboard"
import { clipboardManager } from "./clipboard-manager"
import { transcribeWithLocalModel } from "./local-transcriber"
import { historyStore } from "./history-store"
import { buildAnalyticsSnapshot, runHistorySearch } from "./history-analytics"
import { screenCaptureService } from "./services/screen-capture-service"
import {
  listAutoJournalRuns,
  runAutoJournalOnce,
  startAutoJournalScheduler,
  stopAutoJournalScheduler,
  restartAutoJournalScheduler,
  getSchedulerStatus,
} from "./services/auto-journal-service"
import { saveAutoJournalEntry } from "./services/auto-journal-entry"

const t = tipc.create()

const normalizeProviderError = {
  stt(response: Response, body: string) {
    const status = response.status
    if (body.trim().startsWith("<!DOCTYPE")) {
      return `Provider returned HTML (status ${status}). Check base URL, proxy, or VPN.`
    }

    try {
      const parsed = JSON.parse(body)
      const description =
        parsed?.error?.message || parsed?.message || parsed?.error || body

      switch (status) {
        case 401:
          return `Unauthorized (${response.statusText}). Verify API key.`
        case 403:
          return `Forbidden (${response.statusText}). Check API permissions.`
        case 429:
          return `Rate limited. ${description}`
        default:
          return `${response.statusText} ${description}`
      }
    } catch {
      return `${response.statusText} ${body.slice(0, 200)}`
    }
  },
}

const CLOUD_STT_MODEL_LABELS: Record<string, string> = {
  openai: "OpenAI (gpt-4o-mini-transcribe)",
  groq: "Groq Whisper (whisper-large-v3)",
}

const LOCAL_PROVIDER_PREFIX = "local:"

const deriveSttProviderId = (config: Config) => {
  const preferLocal = config.preferLocalModels === true
  const hasDefaultLocal = Boolean(config.defaultLocalModel)

  if (preferLocal && hasDefaultLocal) {
    return `${LOCAL_PROVIDER_PREFIX}${config.defaultLocalModel}`
  }

  if (config.sttProviderId?.length) {
    return config.sttProviderId
  }
  if (hasDefaultLocal) {
    return `${LOCAL_PROVIDER_PREFIX}${config.defaultLocalModel}`
  }
  return "openai"
}

const resolveActiveSttModelInfo = async (config: Config) => {
  const providerId = deriveSttProviderId(config)

  if (providerId.startsWith(LOCAL_PROVIDER_PREFIX)) {
    const explicitId = providerId.slice(LOCAL_PROVIDER_PREFIX.length)
    const localModelId = explicitId || config.defaultLocalModel

    if (localModelId) {
      try {
        const models = await modelManager.listAllModels()
        const target = models.find(
          (model) =>
            (model.provider === "local" ||
              model.provider === "local-imported") &&
            model.id === localModelId,
        )

        if (target) {
          const origin =
            target.provider === "local-imported"
              ? "imported local model"
              : "local catalog model"
          return {
            providerId,
            description: `${origin}: ${target.displayName} [${target.id}]`,
          }
        }
      } catch (error) {
        console.warn(
          "[transcription] Failed to resolve local model metadata",
          error,
        )
      }

      return {
        providerId,
        description: `local model [${localModelId}] (metadata unavailable)`,
      }
    }

    return {
      providerId,
      description: "local model (not configured)",
    }
  }

  return {
    providerId,
    description: CLOUD_STT_MODEL_LABELS[providerId] || providerId,
  }
}

const safeWordCount = (text: string) => {
  const normalized = text.trim()
  if (!normalized) return 0
  return normalized.split(/\s+/).length
}

const estimateConfidenceScore = (options: {
  words: number
  duration: number
  providerId: string
}) => {
  if (!options.words || !options.duration) return null
  const wpm = (options.words / options.duration) * 60000
  const base = options.providerId.startsWith(LOCAL_PROVIDER_PREFIX)
    ? 0.88
    : options.providerId === "groq"
      ? 0.94
      : 0.9
  const pacePenalty = Math.min(0.25, Math.abs(150 - wpm) / 400)
  const lengthBoost = Math.min(0.05, options.words / 1500)
  const score = base - pacePenalty + lengthBoost
  return Number(Math.max(0.6, Math.min(0.99, score)).toFixed(2))
}

const normalizeAudioProfileInput = (profile?: RecordingAudioProfile) => {
  if (!profile) return undefined
  return {
    peakLevel:
      typeof profile.peakLevel === "number"
        ? Math.min(1, Math.max(0, profile.peakLevel))
        : null,
    averageLevel:
      typeof profile.averageLevel === "number"
        ? Math.min(1, Math.max(0, profile.averageLevel))
        : null,
    silenceRatio:
      typeof profile.silenceRatio === "number"
        ? Math.min(1, Math.max(0, profile.silenceRatio))
        : null,
    sampleCount: profile.sampleCount ?? 0,
  }
}

export const router = {
  restartApp: t.procedure.action(async () => {
    app.relaunch()
    app.quit()
  }),

  getUpdateInfo: t.procedure.action(async () => {
    const { getUpdateInfo } = await import("./updater")
    return getUpdateInfo()
  }),

  quitAndInstall: t.procedure.action(async () => {
    const { quitAndInstall } = await import("./updater")

    quitAndInstall()
  }),

  checkForUpdatesAndDownload: t.procedure.action(async () => {
    const { checkForUpdatesAndDownload } = await import("./updater")

    return checkForUpdatesAndDownload()
  }),

  openMicrophoneInSystemPreferences: t.procedure.action(async () => {
    await shell.openExternal(
      "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone",
    )
  }),

  openAccessibilitySettings: t.procedure.action(async () => {
    await openAccessibilitySettings()
  }),

  hidePanelWindow: t.procedure.action(async () => {
    const panel = WINDOWS.get("panel")

    panel?.hide()
  }),

  showContextMenu: t.procedure
    .input<{ x: number; y: number; selectedText?: string }>()
    .action(async ({ input, context }) => {
      const items: Electron.MenuItemConstructorOptions[] = []

      if (input.selectedText) {
        items.push({
          label: "Copy",
          click() {
            clipboard.writeText(input.selectedText || "")
          },
        })
      }

      if (import.meta.env.DEV) {
        items.push({
          label: "Inspect Element",
          click() {
            context.sender.inspectElement(input.x, input.y)
          },
        })
      }

      const panelWindow = WINDOWS.get("panel")
      const isPanelWindow = panelWindow?.webContents.id === context.sender.id

      if (isPanelWindow) {
        items.push({
          label: "Close",
          click() {
            panelWindow?.hide()
          },
        })
      }

      const menu = Menu.buildFromTemplate(items)
      menu.popup({
        x: input.x,
        y: input.y,
      })
    }),

  getMicrophoneStatus: t.procedure.action(async () => {
    return systemPreferences.getMediaAccessStatus("microphone")
  }),

  isAccessibilityGranted: t.procedure.action(async () => {
    return isAccessibilityGranted()
  }),

  requestAccessibilityAccess: t.procedure.action(async () => {
    if (process.platform === "win32") return true

    return systemPreferences.isTrustedAccessibilityClient(true)
  }),

  requestMicrophoneAccess: t.procedure.action(async () => {
    return systemPreferences.askForMediaAccess("microphone")
  }),

  showPanelWindow: t.procedure.action(async () => {
    showPanelWindow()
  }),

  displayError: t.procedure
    .input<{ title?: string; message: string }>()
    .action(async ({ input }) => {
      dialog.showErrorBox(input.title || "Error", input.message)
    }),

  createRecording: t.procedure
    .input<{
      recording: ArrayBuffer
      duration: number
      mimeType: string
      audioProfile?: RecordingAudioProfile
      contextScreenshotPath?: string
      contextCapturedAt?: number
    }>()
    .action(async ({ input }) => {
      fs.mkdirSync(recordingsFolder, { recursive: true })

      if (state.isTranscribing) {
        const error = new Error("Transcription already in progress")
        error.name = "BusyError"
        throw error
      }

      const controller = new AbortController()
      state.isTranscribing = true
      state.transcriptionAbortController = controller

      const config = configStore.get()
      let transcript: string | undefined
      const recordedAt = Date.now()
      const recordingId = recordedAt.toString()
      const recordingBuffer = Buffer.from(input.recording)
      const providerId = deriveSttProviderId(config)
      const isLocalProvider = providerId.startsWith(LOCAL_PROVIDER_PREFIX)
      const localModelId = isLocalProvider
        ? providerId.slice(LOCAL_PROVIDER_PREFIX.length) ||
          config.defaultLocalModel
        : undefined
      const mimeType = input.mimeType || "audio/wav"
      const fileExtension = mimeType === "audio/wav" ? "wav" : "webm"
      const normalizedAudioProfile = normalizeAudioProfileInput(
        input.audioProfile,
      )
      const transcriptionStartedAt = Date.now()
      let transcriptionLatencyMs = 0
      let postProcessingTimeMs = 0
      const hasPostProcessing = Boolean(
        config.transcriptPostProcessingEnabled &&
          config.transcriptPostProcessingPrompt,
      )
      const llmProviderId = hasPostProcessing
        ? config.transcriptPostProcessingProviderId || "openai"
        : undefined

      console.log(
        `[transcription] createRecording provider=${providerId} defaultLocal=${config.defaultLocalModel ?? "none"} mime=${mimeType}`,
      )

      // Declare enhancementMetadata outside try block so it's accessible later
      let enhancementMetadata:
        | {
            originalTranscript?: string
            enhancementPromptId?: string
            enhancementProvider?: string
            enhancementProcessingTime?: number
          }
        | undefined

      try {
        let baseTranscript: string | null = null

        if (isLocalProvider) {
          if (mimeType !== "audio/wav") {
            throw new Error(
              "Local transcription requires WAV audio. Please try recording again.",
            )
          }

          if (!localModelId) {
            throw new Error(
              "Select a default local model before starting a transcription.",
            )
          }

          console.log(
            `[transcription] Using local model ${localModelId} with threads=${config.localInferenceThreads ?? "auto"}`,
          )
          baseTranscript = await transcribeWithLocalModel({
            audioBuffer: recordingBuffer,
            modelId: localModelId,
            threads: config.localInferenceThreads,
            signal: controller.signal,
          })
        } else {
          console.log(`[transcription] Using cloud provider ${providerId}`)
          const form = new FormData()
          form.append(
            "file",
            new File([recordingBuffer], `recording.${fileExtension}`, {
              type: mimeType,
            }),
          )
          const model =
            providerId === "groq"
              ? config.groqWhisperModel || "whisper-large-v3"
              : providerId === "openrouter"
                ? config.openrouterModel || "gpt-4o-mini-transcribe"
                : providerId === "openai"
                  ? config.openaiWhisperModel || "gpt-4o-mini-transcribe"
                  : providerId === "gemini"
                    ? config.geminiModel || "gemini-1.5-flash-002"
                    : "gpt-4o-mini-transcribe"

          form.append("model", model)
          form.append("response_format", "json")

          const groqBaseUrl =
            config.groqBaseUrl || "https://api.groq.com/openai/v1"
          const openaiBaseUrl =
            config.openaiBaseUrl || "https://api.openai.com/v1"
          const openrouterBaseUrl =
            config.openrouterBaseUrl || "https://openrouter.ai/api/v1"

          const baseUrl =
            providerId === "groq"
              ? groqBaseUrl
              : providerId === "openrouter"
                ? openrouterBaseUrl
                : openaiBaseUrl

          const apiKey =
            providerId === "groq"
              ? config.groqApiKey
              : providerId === "openrouter"
                ? config.openrouterApiKey
                : config.openaiApiKey

          const transcriptResponse = await fetch(
            `${baseUrl}/audio/transcriptions`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${apiKey}`,
              },
              body: form,
              signal: controller.signal,
            },
          )

          if (!transcriptResponse.ok) {
            const raw = await transcriptResponse.text()
            throw new Error(normalizeProviderError.stt(transcriptResponse, raw))
          }

          const json: { text: string } = await transcriptResponse.json()
          baseTranscript = json.text
        }

        if (baseTranscript == null) {
          throw new Error("No transcript returned from transcription provider")
        }

        transcriptionLatencyMs = Date.now() - transcriptionStartedAt
        const postProcessingStartedAt = Date.now()

        // Call postProcessTranscript with metadata return if enhancement is enabled
        const postProcessResult = await postProcessTranscript(baseTranscript, {
          signal: controller.signal,
          returnMetadata: config.enhancementEnabled,
        })

        // Handle both string and object returns
        if (typeof postProcessResult === "string") {
          transcript = postProcessResult
        } else {
          transcript = postProcessResult.text
          // Store enhancement metadata for later use
          if (postProcessResult.metadata) {
            enhancementMetadata = postProcessResult.metadata
          }
        }

        postProcessingTimeMs = Date.now() - postProcessingStartedAt
      } catch (error) {
        if ((error as Error).name === "AbortError") {
          console.info("[createRecording] transcription aborted by user")
          return
        }

        throw error
      } finally {
        if (state.transcriptionAbortController === controller) {
          state.transcriptionAbortController = null
        }
        state.isTranscribing = false

        // Unmute system audio after transcription completes
        const { mediaController } = await import("./services/media-controller")
        await mediaController.unmuteSystemAudio()
      }

      if (!transcript) {
        return
      }

      // Update lastTranscription state
      state.lastTranscription = transcript

      const transcriptWordCount = safeWordCount(transcript)
      const transcriptCharacterCount = transcript.length
      const wordsPerMinute =
        transcriptWordCount > 0 && input.duration > 0
          ? Number(((transcriptWordCount / input.duration) * 60000).toFixed(2))
          : undefined
      const confidenceScore = estimateConfidenceScore({
        words: transcriptWordCount,
        duration: input.duration,
        providerId,
      })
      const processingTimeMs = Date.now() - transcriptionStartedAt

      const item: RecordingHistoryItem = {
        id: recordingId,
        createdAt: recordedAt,
        duration: input.duration,
        transcript,
        filePath: path.join(
          recordingsFolder,
          `${recordingId}.${fileExtension}`,
        ),
        fileSize: recordingBuffer.byteLength,
        transcriptWordCount,
        transcriptCharacterCount,
        wordsPerMinute,
        providerId,
        hasPostProcessing,
        llmProviderId,
        processingTimeMs,
        transcriptionLatencyMs,
        postProcessingTimeMs,
        confidenceScore,
        tags: [],
        audioProfile: normalizedAudioProfile,
        contextScreenshotPath: input.contextScreenshotPath,
        contextCapturedAt: input.contextCapturedAt,
        // Enhancement metadata
        ...(enhancementMetadata && {
          originalTranscript: enhancementMetadata.originalTranscript,
          enhancementPromptId: enhancementMetadata.enhancementPromptId,
          enhancementProvider: enhancementMetadata.enhancementProvider,
          enhancementProcessingTime:
            enhancementMetadata.enhancementProcessingTime,
        }),
      }

      historyStore.append(item)

      fs.writeFileSync(
        path.join(recordingsFolder, `${item.id}.${fileExtension}`),
        recordingBuffer,
      )

      if (config.autoJournalIncludeScreenCapture) {
        ;(async () => {
          try {
            const result = await screenCaptureService.captureAndExtractText()
            const screenText = result?.text?.trim()
            if (result && screenText) {
              historyStore.update(item.id, {
                contextCapturedAt: result.timestamp,
                contextScreenText: screenText.slice(0, 4000),
                contextScreenAppName: result.appName,
                contextScreenWindowTitle: result.windowTitle,
              })
            }
          } catch (error) {
            console.error(
              "[auto-journal] screen capture for history failed:",
              error,
            )
          }
        })()
      }

      const main = WINDOWS.get("main")
      if (main) {
        getRendererHandlers<RendererHandlers>(
          main.webContents,
        ).refreshRecordingHistory.send()
      }

      const panel = WINDOWS.get("panel")
      if (panel) {
        panel.hide()
      }

      // paste
      const shouldPreserveClipboard = config.preserveClipboard !== false

      // Save clipboard content if preserve clipboard is enabled
      if (shouldPreserveClipboard) {
        clipboardManager.saveClipboard()
      }

      clipboard.writeText(transcript)
      const activeModelInfo = await resolveActiveSttModelInfo(config)
      console.log(
        `[transcription] STT model (${activeModelInfo.providerId}): ${activeModelInfo.description}`,
      )
      if (isAccessibilityGranted()) {
        await writeText(transcript)

        // Schedule clipboard restoration after writeText completes
        if (shouldPreserveClipboard) {
          clipboardManager.scheduleRestore(600)
        }
      } else if (shouldPreserveClipboard) {
        // Even if accessibility is not granted, we should restore if needed
        clipboardManager.scheduleRestore(600)
      }
    }),

  cancelTranscription: t.procedure.action(async () => {
    abortOngoingTranscription()
  }),

  getRecordingHistory: t.procedure.action(async () => historyStore.readAll()),

  searchRecordingHistory: t.procedure
    .input<RecordingHistorySearchFilters>()
    .action(async ({ input }) => {
      return runHistorySearch(historyStore.readAll(), input)
    }),

  getRecordingAnalytics: t.procedure.action(async () =>
    buildAnalyticsSnapshot(historyStore.readAll()),
  ),

  deleteRecordingItem: t.procedure
    .input<{ id: string }>()
    .action(async ({ input }) => {
      historyStore.delete(input.id)
    }),

  updateRecordingItem: t.procedure
    .input<{
      id: string
      patch: Partial<
        Pick<RecordingHistoryItem, "tags" | "accuracyScore" | "confidenceScore">
      >
    }>()
    .action(async ({ input }) => {
      return historyStore.update(input.id, input.patch)
    }),

  deleteRecordingHistory: t.procedure.action(async () => {
    historyStore.clear()
  }),

  /**
   * Capture a screenshot when a recording starts and store it next to recordings.
   * This does NOT run OCR or call any LLMs – it only saves the image and returns its path
   * and capture timestamp so it can be associated with the eventual RecordingHistoryItem.
   */
  captureRecordingScreenshot: t.procedure.action(async () => {
    const capturedAt = Date.now()

    try {
      const sources = await desktopCapturer.getSources({
        types: ["screen"],
        thumbnailSize: { width: 1280, height: 720 },
      })

      if (!sources.length) {
        console.warn("[auto-journal] No screen sources available for capture.")
        return { path: "", capturedAt }
      }

      const primary = sources[0]
      const image = primary.thumbnail
      if (image.isEmpty()) {
        console.warn("[auto-journal] Captured screen thumbnail is empty.")
        return { path: "", capturedAt }
      }

      // Ensure a screenshots subfolder under recordingsFolder
      const screenshotsDir = path.join(recordingsFolder, "screenshots")
      fs.mkdirSync(screenshotsDir, { recursive: true })

      const fileName = `screenshot-${capturedAt}.png`
      const filePath = path.join(screenshotsDir, fileName)
      const pngBuffer = image.toPNG()
      fs.writeFileSync(filePath, pngBuffer)

      console.log("[auto-journal] Captured recording screenshot:", filePath)

      return {
        path: filePath,
        capturedAt,
      }
    } catch (error) {
      console.error(
        "[auto-journal] Failed to capture recording screenshot:",
        error,
      )
      return { path: "", capturedAt }
    }
  }),

  /**
   * Generate an auto-journal style summary of recent recordings.
   *
   * This is the first step of the Dayflow-like pipeline: it looks at a sliding
   * time window of RecordingHistoryItem and returns a JSON summary with
   * activity blocks. Currently this is exposed for experimentation and will
   * later be wired into the Pile journal UI.
   */
  generateAutoJournalSummary: t.procedure
    .input<{ windowMinutes?: number } | undefined>()
    .action(async ({ input }) => {
      const history = historyStore.readAll()
      return generateAutoJournalSummaryFromHistory(history, {
        windowMinutes: input?.windowMinutes ?? 60,
        promptOverride: configStore.get().autoJournalPrompt,
      })
    }),

  runAutoJournalNow: t.procedure
    .input<{ windowMinutes?: number } | undefined>()
    .action(async ({ input }) => {
      return runAutoJournalOnce(input?.windowMinutes)
    }),

  listAutoJournalRuns: t.procedure
    .input<{ limit?: number } | undefined>()
    .action(async ({ input }) => {
      return listAutoJournalRuns(input?.limit ?? 50)
    }),

  getAutoJournalSettings: t.procedure.action(async () => {
    const cfg = configStore.get()
    return {
      autoJournalEnabled: cfg.autoJournalEnabled ?? false,
      autoJournalWindowMinutes: cfg.autoJournalWindowMinutes ?? 60,
      autoJournalTargetPilePath: cfg.autoJournalTargetPilePath ?? "",
      autoJournalAutoSaveEnabled: cfg.autoJournalAutoSaveEnabled ?? false,
      autoJournalPrompt: cfg.autoJournalPrompt ?? "",
      autoJournalIncludeScreenCapture:
        cfg.autoJournalIncludeScreenCapture ?? false,
      autoJournalTitlePromptEnabled: cfg.autoJournalTitlePromptEnabled ?? false,
      autoJournalTitlePrompt: cfg.autoJournalTitlePrompt ?? "",
      autoJournalSummaryPromptEnabled:
        cfg.autoJournalSummaryPromptEnabled ?? false,
      autoJournalSummaryPrompt: cfg.autoJournalSummaryPrompt ?? "",
    }
  }),

  saveAutoJournalSettings: t.procedure
    .input<{
      autoJournalEnabled?: boolean
      autoJournalWindowMinutes?: number
      autoJournalTargetPilePath?: string
      autoJournalPrompt?: string
      autoJournalAutoSaveEnabled?: boolean
      autoJournalIncludeScreenCapture?: boolean
      autoJournalTitlePromptEnabled?: boolean
      autoJournalTitlePrompt?: string
      autoJournalSummaryPromptEnabled?: boolean
      autoJournalSummaryPrompt?: string
    }>()
    .action(async ({ input }) => {
      const cfg = configStore.get()
      const wasEnabled = cfg.autoJournalEnabled ?? false
      const willBeEnabled = input.autoJournalEnabled ?? cfg.autoJournalEnabled ?? false

      configStore.save({
        ...cfg,
        autoJournalEnabled: willBeEnabled,
        autoJournalWindowMinutes:
          input.autoJournalWindowMinutes ?? cfg.autoJournalWindowMinutes ?? 60,
        autoJournalTargetPilePath:
          input.autoJournalTargetPilePath ??
          cfg.autoJournalTargetPilePath ??
          "",
        autoJournalAutoSaveEnabled:
          input.autoJournalAutoSaveEnabled ??
          cfg.autoJournalAutoSaveEnabled ??
          false,
        autoJournalIncludeScreenCapture:
          input.autoJournalIncludeScreenCapture ??
          cfg.autoJournalIncludeScreenCapture ??
          false,
        autoJournalPrompt:
          input.autoJournalPrompt ?? cfg.autoJournalPrompt ?? "",
        autoJournalTitlePromptEnabled:
          input.autoJournalTitlePromptEnabled ??
          cfg.autoJournalTitlePromptEnabled ??
          false,
        autoJournalTitlePrompt:
          input.autoJournalTitlePrompt ?? cfg.autoJournalTitlePrompt ?? "",
        autoJournalSummaryPromptEnabled:
          input.autoJournalSummaryPromptEnabled ??
          cfg.autoJournalSummaryPromptEnabled ??
          false,
        autoJournalSummaryPrompt:
          input.autoJournalSummaryPrompt ?? cfg.autoJournalSummaryPrompt ?? "",
      })

      // Restart scheduler with immediate run if user just enabled it
      const justEnabled = !wasEnabled && willBeEnabled
      restartAutoJournalScheduler(justEnabled)

      const updatedCfg = configStore.get()
      return {
        autoJournalEnabled: updatedCfg.autoJournalEnabled,
        autoJournalWindowMinutes: updatedCfg.autoJournalWindowMinutes,
        autoJournalTargetPilePath: updatedCfg.autoJournalTargetPilePath,
      autoJournalAutoSaveEnabled: updatedCfg.autoJournalAutoSaveEnabled,
      autoJournalIncludeScreenCapture:
        updatedCfg.autoJournalIncludeScreenCapture,
      autoJournalPrompt: updatedCfg.autoJournalPrompt,
        autoJournalTitlePromptEnabled: updatedCfg.autoJournalTitlePromptEnabled,
        autoJournalTitlePrompt: updatedCfg.autoJournalTitlePrompt,
        autoJournalSummaryPromptEnabled:
          updatedCfg.autoJournalSummaryPromptEnabled,
        autoJournalSummaryPrompt: updatedCfg.autoJournalSummaryPrompt,
      }
    }),

  /**
   * Get the current status of the auto-journal scheduler.
   */
  getAutoJournalSchedulerStatus: t.procedure.action(async () => {
    return getSchedulerStatus()
  }),

  /**
   * Persist an auto-journal summary as a new post in the current pile.
   */
  createAutoJournalEntry: t.procedure
    .input<{
      pilePath: string
      summary: string
      activities: AutoJournalActivity[]
      windowStartTs?: number
      windowEndTs?: number
      highlight?: "Highlight" | "Do later" | "New idea" | null
    }>()
    .action(async ({ input }) => {
      try {
        return await saveAutoJournalEntry(input)
      } catch (error) {
        console.error("[auto-journal] Failed to save entry", error)
        throw error
      }
    }),

  listModels: t.procedure.action(async () => {
    return modelManager.listAllModels()
  }),

  listDownloadedModels: t.procedure.action(async () => {
    return modelManager.listDownloadedModels()
  }),

  downloadModel: t.procedure
    .input<{ modelId: string }>()
    .action(async ({ input }) => {
      await modelManager.downloadModel(input.modelId)
    }),

  deleteModel: t.procedure
    .input<{ modelId: string }>()
    .action(async ({ input }) => {
      await modelManager.deleteModel(input.modelId)
    }),

  importLocalModel: t.procedure
    .input<{ filePath: string }>()
    .action(async ({ input }) => {
      return modelManager.importModel(input.filePath)
    }),

  showModelImportDialog: t.procedure.action(async () => {
    const result = await dialog.showOpenDialog({
      title: "Import local Whisper model",
      buttonLabel: "Import",
      properties: ["openFile"],
      filters: [
        {
          name: "Whisper GGML/GGUF models",
          extensions: ["bin", "ggml", "gguf"],
        },
      ],
    })

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    return result.filePaths[0]
  }),

  addCustomModel: t.procedure
    .input<{
      displayName: string
      description: string
      endpoint: string
      modelIdentifier: string
      language: "english" | "multilingual"
      requiresApiKey: boolean
    }>()
    .action(async ({ input }) => {
      return modelManager.addCustomModel(input)
    }),

  setDefaultLocalModel: t.procedure
    .input<{ modelId: string }>()
    .action(async ({ input }) => {
      const models = await modelManager.listAllModels()
      const target = models.find(
        (model) =>
          (model.provider === "local" || model.provider === "local-imported") &&
          model.id === input.modelId,
      )

      if (!target) {
        throw new Error("Model not found or not a local model")
      }

      const config = configStore.get()
      configStore.save({
        ...config,
        defaultLocalModel: input.modelId,
        sttProviderId: `${LOCAL_PROVIDER_PREFIX}${input.modelId}`,
      })
      console.log(
        `[config] Default local model set to ${input.modelId}; STT provider is now ${LOCAL_PROVIDER_PREFIX}${input.modelId}`,
      )
    }),

  getModelDownloadProgress: t.procedure
    .input<{ modelId: string }>()
    .action(async ({ input }) => {
      return modelManager.getDownloadProgress(input.modelId)
    }),

  revealModelInFolder: t.procedure
    .input<{ filePath: string }>()
    .action(async ({ input }) => {
      if (!input.filePath) return
      shell.showItemInFolder(input.filePath)
    }),

  getConfig: t.procedure.action(async () => {
    return configStore.get()
  }),

  saveConfig: t.procedure
    .input<{ config: Config }>()
    .action(async ({ input }) => {
      const prevConfig = configStore.get()
      const prevProvider = deriveSttProviderId(prevConfig)
      const prevDefault = prevConfig.defaultLocalModel
      configStore.save(input.config)
      const nextConfig = configStore.get()
      const nextProvider = deriveSttProviderId(nextConfig)
      if (prevProvider !== nextProvider) {
        console.log(
          `[config] STT provider changed from ${prevProvider} to ${nextProvider}`,
        )
      }
      if (prevDefault !== nextConfig.defaultLocalModel) {
        console.log(
          `[config] Default local model changed from ${prevDefault ?? "none"} to ${nextConfig.defaultLocalModel ?? "none"}`,
        )
      }
    }),

  // Enhancement procedures
  enhanceTranscript: t.procedure
    .input<{
      text: string
      promptId?: string
      skipContext?: boolean
    }>()
    .action(async ({ input }) => {
      return await enhancementService.enhanceTranscript(input.text, {
        promptId: input.promptId,
        skipContext: input.skipContext,
      })
    }),

  getEnhancementHistory: t.procedure.action(async () => {
    return enhancementService.getHistory()
  }),

  clearEnhancementHistory: t.procedure.action(async () => {
    enhancementService.clearHistory()
  }),

  getEnhancementResult: t.procedure
    .input<{ id: string }>()
    .action(async ({ input }) => {
      return enhancementService.getResult(input.id)
    }),

  fetchOpenRouterModels: t.procedure.action(async () => {
    const config = configStore.get()
    const apiKey = config.openrouterApiKey

    if (!apiKey) {
      throw new Error("OpenRouter API key is required")
    }

    try {
      const response = await fetch("https://openrouter.ai/api/v1/models", {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      })

      if (!response.ok) {
        throw new Error(
          `Failed to fetch OpenRouter models: ${response.statusText}`,
        )
      }

      const data = await response.json()
      return data.data as Array<{
        id: string
        name: string
        pricing: {
          prompt: string
          completion: string
        }
        context_length: number
      }>
    } catch (error) {
      console.error("[OpenRouter] Failed to fetch models:", error)
      throw error
    }
  }),

  recordEvent: t.procedure
    .input<{ type: "start" | "end" }>()
    .action(async ({ input }) => {
      if (input.type === "start") {
        state.isRecording = true
      } else {
        state.isRecording = false
      }
      updateTrayIcon()
    }),
}

export type Router = typeof router
