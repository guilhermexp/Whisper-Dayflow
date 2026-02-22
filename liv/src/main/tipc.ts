import fs from "fs"
import { getRendererHandlers, tipc } from "@egoist/tipc/main"
import { showPanelWindow, WINDOWS } from "./window"
import {
  app,
  BrowserWindow,
  clipboard,
  Menu,
  shell,
  systemPreferences,
  dialog,
  desktopCapturer,
} from "electron"
import path from "path"
import matter from "gray-matter"
import { configStore, recordingsFolder } from "./config"
import { modelManager } from "./model-manager"
import type {
  AutoJournalActivity,
  Config,
  RecordingAudioProfile,
  RecordingHistoryItem,
  RecordingHistorySearchFilters,
} from "../shared/types"
import { RendererHandlers, ErrorNotification } from "./renderer-handlers"
import {
  postProcessTranscript,
  generateAutoJournalSummaryFromHistory,
} from "./llm"
import { enhancementService } from "./services/enhancement-service"
import { abortOngoingTranscription, resetTranscriptionState, state } from "./state"
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
  runAutoJournalForRange,
  startAutoJournalScheduler,
  stopAutoJournalScheduler,
  restartAutoJournalScheduler,
  getSchedulerStatus,
  deleteAutoJournalRun,
  GIF_DIR,
} from "./services/auto-journal-service"
import {
  restartNanobotRuntime,
  startNanobotRuntime,
  stopNanobotRuntime,
} from "./services/nanobot-runtime-service"
import { saveAutoJournalEntry } from "./services/auto-journal-entry"
import {
  startPeriodicScreenshotScheduler,
  stopPeriodicScreenshotScheduler,
  restartPeriodicScreenshotScheduler,
  getPeriodicScreenshotStatus,
  capturePeriodicScreenshotNow,
  listPeriodicScreenshots,
  deletePeriodicScreenshot,
  getPeriodicScreenshotsDir,
} from "./services/periodic-screenshot-service"
import {
  applyScreenSessionRecordingConfig,
  getScreenSessionRecordingStatus,
  getScreenSessionRecordingsDir,
  listScreenSessionRecordings,
  startScreenSessionRecording,
  stopScreenSessionRecording,
  syncScreenSessionRecordingWithConfig,
} from "./services/screen-session-recording-service"
import {
  getAutonomousKanbanBoard,
  refreshAutonomousKanban,
  searchAutonomousKanbanMemory,
  getAutonomousKanbanStatus,
  getAutonomousPromptContext,
  createKanbanCard,
  updateKanbanCard,
  deleteKanbanCard,
  moveKanbanCard,
} from "./services/autonomous-kanban-service"
import {
  getAutonomousProfileBoard,
  refreshAutonomousProfile,
  getAutonomousProfileStatus,
} from "./services/autonomous-profile-service"
import {
  getLifeContext,
  updateLifeContext,
  getLifeAnalysis,
  refreshLifeAnalysis,
  addWisdomEntry,
  deleteWisdomEntry,
} from "./services/autonomous-life-service"
import {
  checkOllamaStatus,
  listOllamaEmbeddingModels,
  pullOllamaEmbeddingModel,
  getOllamaPullProgress,
} from "./services/ollama-embedding-service"
import {
  getFocusSessionStatus,
  pauseFocusSession,
  resumeFocusSession,
  startFocusSession,
  stopFocusSession,
} from "./services/focus-session-service"
import settings from "electron-settings"
import {
  getKey,
  setKey,
  deleteKey,
  getOpenrouterKey,
  setOpenrouterKey,
  getOpenrouterModels,
  fetchOpenrouterModels,
  getGeminiKey,
  setGeminiKey,
  deleteGeminiKey,
  getGroqKey,
  setGroqKey,
  deleteGroqKey,
  getDeepgramKey,
  setDeepgramKey,
  deleteDeepgramKey,
  getCustomKey,
  setCustomKey,
  deleteCustomKey,
} from "./pile-utils/store"
import pileHelper from "./pile-utils/pileHelper"
import pileIndex from "./pile-utils/pileIndex"
import pileTags from "./pile-utils/pileTags"
import pileHighlights from "./pile-utils/pileHighlights"
import pileLinks from "./pile-utils/pileLinks"
import { getLinkPreview, getLinkContent } from "./pile-utils/linkPreview"

const t = tipc.create()

/**
 * Send a notification to the main window renderer
 * Use for user-facing feedback (errors, warnings, info)
 */
const sendNotification = (notification: ErrorNotification) => {
  const mainWindow = WINDOWS.get("main")
  if (mainWindow && !mainWindow.isDestroyed()) {
    getRendererHandlers<RendererHandlers>(mainWindow.webContents).showNotification.send(notification)
  } else {
    // Fallback: log to console if main window not available
    console.log(`[Notification] ${notification.type}: ${notification.title} - ${notification.message}`)
  }
}

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
  deepgram: "Deepgram (nova-3)",
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

const pilesConfigPath = path.join(app.getPath("home"), "Piles", "piles.json")
let invalidPilesConfigReported = false

type PileConfigEntry = { name?: string; path?: string; theme?: string }

const readPilesConfigSafeSync = (): PileConfigEntry[] => {
  if (!fs.existsSync(pilesConfigPath)) return []

  const raw = fs.readFileSync(pilesConfigPath, "utf-8")
  const trimmed = raw.trim()
  if (!trimmed) return []

  try {
    const parsed = JSON.parse(trimmed)
    return Array.isArray(parsed) ? parsed : []
  } catch (error) {
    if (!invalidPilesConfigReported) {
      invalidPilesConfigReported = true
      console.warn("[tipc] Invalid piles config JSON; recovering file", error)
    }
    try {
      const backupPath = `${pilesConfigPath}.corrupt-${Date.now()}.json`
      fs.writeFileSync(backupPath, raw, "utf-8")
      fs.writeFileSync(pilesConfigPath, "[]", "utf-8")
      console.warn(
        `[tipc] Corrupt piles config backed up to ${backupPath} and reset to []`,
      )
    } catch (repairError) {
      console.warn("[tipc] Failed to repair piles config", repairError)
    }
    return []
  }
}

const loadAllowedRoots = () => {
  const roots = new Set<string>([path.resolve(path.dirname(pilesConfigPath))])
  roots.add(path.resolve(app.getPath("home")))

  const documentsLiv = path.join(app.getPath("documents"), "Liv")
  roots.add(path.resolve(documentsLiv))

  try {
    const piles = readPilesConfigSafeSync()
    for (const pile of piles) {
      if (pile?.path) {
        roots.add(path.resolve(String(pile.path)))
      }
    }
  } catch (error) {
    console.warn("[tipc] Failed to read piles config for allowed roots", error)
  }

  return roots
}

const assertAllowedPath = (targetPath: string) => {
  const resolved = path.resolve(targetPath)
  const allowedRoots = loadAllowedRoots()
  for (const root of allowedRoots) {
    if (resolved === root || resolved.startsWith(root + path.sep)) {
      return
    }
  }
  throw new Error(`[tipc] Path outside allowed roots: ${targetPath}`)
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

  openScreenRecordingInSystemPreferences: t.procedure.action(async () => {
    if (process.platform !== "darwin") return
    await shell.openExternal(
      "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
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

  getScreenRecordingStatus: t.procedure.action(async () => {
    if (process.platform !== "darwin") return "granted"
    try {
      return systemPreferences.getMediaAccessStatus("screen")
    } catch {
      return "unknown"
    }
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

  requestScreenRecordingAccess: t.procedure.action(async () => {
    if (process.platform !== "darwin") return true

    try {
      const sources = await desktopCapturer.getSources({
        types: ["screen"],
        thumbnailSize: { width: 320, height: 180 },
      })

      if (!sources.length) return false

      // On macOS without permission, thumbnails are usually empty.
      return sources.some((source) => !source.thumbnail.isEmpty())
    } catch {
      return false
    }
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
        console.warn("[createRecording] Transcription already in progress, rejecting new request")
        sendNotification({
          type: "warning",
          title: "Aguarde",
          message: "Uma transcrição já está em andamento. Aguarde ela terminar antes de iniciar outra.",
          code: "BusyError",
        })
        const error = new Error("Transcription already in progress")
        error.name = "BusyError"
        throw error
      }

      // Helper to ensure cleanup on any error path and send notification
      const ensureCleanup = async (error?: Error) => {
        resetTranscriptionState()
        const { mediaController } = await import("./services/media-controller")
        await mediaController.forceUnmute()

        // Send user-facing notification if there's an error
        if (error && error.name !== "AbortError") {
          sendNotification({
            type: "error",
            title: error.name === "EmptyRecordingError" ? "Gravação Vazia" : "Erro na Transcrição",
            message: error.message,
            code: error.name,
          })
        }
      }

      const controller = new AbortController()
      state.isTranscribing = true
      state.transcriptionAbortController = controller

      const config = configStore.get()
      let transcript: string | undefined
      const recordedAt = Date.now()
      const recordingId = recordedAt.toString()
      const recordingBuffer = Buffer.from(input.recording)

      if (
        !recordingBuffer.byteLength ||
        !input.duration ||
        input.duration <= 0
      ) {
        const error = new Error(
          "Não capturamos áudio (o arquivo veio vazio). Tente novamente mantendo a tecla pressionada por cerca de 1 segundo.",
        )
        error.name = "EmptyRecordingError"
        await ensureCleanup(error)
        throw error
      }

      if (recordingBuffer.byteLength < 5000 || input.duration < 300) {
        console.warn("[createRecording] Received very small audio blob", {
          bytes: recordingBuffer.byteLength,
          duration: input.duration,
          mimeType: input.mimeType,
        })
        // Stop early with a friendly error to avoid sending tiny blobs to the provider
        const error = new Error(
          "Gravação muito curta. Segure a tecla por pelo menos meio segundo para iniciar o áudio.",
        )
        error.name = "EmptyRecordingError"
        await ensureCleanup(error)
        throw error
      }
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
        } else if (providerId === "deepgram") {
          // Deepgram has a different API format
          console.log(`[transcription] Using Deepgram provider`)
          const deepgramModel = config.deepgramModel || "nova-3"
          const deepgramUrl = `https://api.deepgram.com/v1/listen?model=${deepgramModel}&language=pt&smart_format=true`
          const deepgramKey = (await getDeepgramKey()) || config.deepgramApiKey

          const transcriptResponse = await fetch(deepgramUrl, {
            method: "POST",
            headers: {
              Authorization: `Token ${deepgramKey || ""}`,
              "Content-Type": mimeType,
            },
            body: recordingBuffer,
            signal: controller.signal,
          })

          if (!transcriptResponse.ok) {
            const raw = await transcriptResponse.text()
            throw new Error(normalizeProviderError.stt(transcriptResponse, raw))
          }

          const json = await transcriptResponse.json()
          // Deepgram returns transcript in results.channels[0].alternatives[0].transcript
          baseTranscript =
            json?.results?.channels?.[0]?.alternatives?.[0]?.transcript || ""
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
              ? config.groqWhisperModel || "whisper-large-v3-turbo"
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

          const encryptedApiKey =
            providerId === "groq"
              ? await getGroqKey()
              : providerId === "openrouter"
                ? await getOpenrouterKey()
                : await getKey()
          const configApiKey =
            providerId === "groq"
              ? config.groqApiKey
              : providerId === "openrouter"
                ? config.openrouterApiKey
                : config.openaiApiKey
          const apiKey = encryptedApiKey || configApiKey

          if (!apiKey) {
            throw new Error(
              `Missing API key for provider '${providerId}'. Configure it in Settings.`,
            )
          }
          console.log(
            `[transcription] Using ${providerId} API key source=${encryptedApiKey ? "encrypted-store" : "config"}`,
          )

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
          await ensureCleanup()
          return
        }

        const err = error as Error
        if (/file is empty/i.test(err.message)) {
          err.name = "EmptyRecordingError"
          err.message =
            "Não capturamos áudio (o arquivo veio vazio). Tente novamente mantendo a tecla pressionada por cerca de 1 segundo."
        }

        // Ensure cleanup on error before throwing - this also sends notification
        await ensureCleanup(err)
        throw err
      } finally {
        // Safety net: always ensure state is clean
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
            const screenshotsDir = path.join(recordingsFolder, "screenshots")
            const screenshotPath = path.join(screenshotsDir, `${item.id}.png`)
            const result =
              await screenCaptureService.captureAndExtractText(screenshotPath)
            const screenText = result?.text?.trim()
            const exists =
              result?.imagePath && fs.existsSync(result.imagePath ?? "")
            if (result && (screenText || exists)) {
              const updated = historyStore.update(item.id, {
                contextCapturedAt: result.timestamp,
                contextScreenText: screenText?.slice(0, 4000),
                contextScreenAppName: result.appName,
                contextScreenWindowTitle: result.windowTitle,
                contextScreenshotPath: exists ? result.imagePath : undefined,
              })

              // Notify renderer so history list can show the screenshot as soon as it is saved
              if (updated) {
                const mainWindow = WINDOWS.get("main")
                if (mainWindow) {
                  getRendererHandlers<RendererHandlers>(
                    mainWindow.webContents,
                  ).refreshRecordingHistory.send()
                }
              }
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

    // Guard: ReplayKit crashes when no visible BrowserWindow exists (tray-only mode)
    const hasVisibleWindow = BrowserWindow.getAllWindows().some(
      (w) => !w.isDestroyed() && w.isVisible(),
    )
    if (!hasVisibleWindow) {
      console.warn("[auto-journal] No visible window — skipping screenshot to avoid ReplayKit crash")
      return { path: "", capturedAt }
    }

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

  runAutoJournalForRange: t.procedure
    .input<{ windowStartTs: number; windowEndTs: number }>()
    .action(async ({ input }) => {
      return runAutoJournalForRange({
        windowStartTs: input.windowStartTs,
        windowEndTs: input.windowEndTs,
      })
    }),

  listAutoJournalRuns: t.procedure
    .input<{ limit?: number } | undefined>()
    .action(async ({ input }) => {
      return listAutoJournalRuns(input?.limit ?? 50)
    }),

  deleteAutoJournalRun: t.procedure
    .input<{ runId: string }>()
    .action(async ({ input }) => {
      return deleteAutoJournalRun(input.runId)
    }),

  getAutoJournalSettings: t.procedure.action(async () => {
    const cfg = configStore.get()
    return {
      autoJournalEnabled: cfg.autoJournalEnabled ?? false,
      autoJournalWindowMinutes: cfg.autoJournalWindowMinutes ?? 60,
      autoJournalSourceMode: cfg.autoJournalSourceMode ?? "both",
      autoJournalVideoProvider: cfg.autoJournalVideoProvider ?? "gemini",
      autoJournalVideoModel:
        cfg.autoJournalVideoModel ?? "gemini-3-flash-preview",
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
      autoJournalGifDir: GIF_DIR,
      screenSessionRecordingEnabled: cfg.screenSessionRecordingEnabled ?? false,
      screenSessionCaptureIntervalSeconds:
        cfg.screenSessionCaptureIntervalSeconds ?? 5,
      screenSessionRecordingsDir: getScreenSessionRecordingsDir(),
    }
  }),

  saveAutoJournalSettings: t.procedure
    .input<{
      autoJournalEnabled?: boolean
      autoJournalWindowMinutes?: number
      autoJournalSourceMode?: "audio" | "video" | "both"
      autoJournalVideoProvider?:
        | "openai"
        | "groq"
        | "gemini"
        | "openrouter"
        | "ollama"
        | "custom"
      autoJournalVideoModel?: string
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
      const willBeEnabled =
        input.autoJournalEnabled ?? cfg.autoJournalEnabled ?? false

      configStore.save({
        ...cfg,
        autoJournalEnabled: willBeEnabled,
        autoJournalWindowMinutes:
          input.autoJournalWindowMinutes ?? cfg.autoJournalWindowMinutes ?? 60,
        autoJournalSourceMode:
          input.autoJournalSourceMode ?? cfg.autoJournalSourceMode ?? "both",
        autoJournalVideoProvider:
          input.autoJournalVideoProvider ??
          cfg.autoJournalVideoProvider ??
          "gemini",
        autoJournalVideoModel:
          input.autoJournalVideoModel ??
          cfg.autoJournalVideoModel ??
          "gemini-3-flash-preview",
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
        autoJournalSourceMode: updatedCfg.autoJournalSourceMode,
        autoJournalVideoProvider: updatedCfg.autoJournalVideoProvider,
        autoJournalVideoModel: updatedCfg.autoJournalVideoModel,
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

  getScreenSessionRecordingStatus: t.procedure.action(async () => {
    return getScreenSessionRecordingStatus()
  }),

  listScreenSessionRecordings: t.procedure
    .input<{ limit?: number } | undefined>()
    .action(async ({ input }) => {
      return listScreenSessionRecordings(input?.limit)
    }),

  startScreenSessionRecording: t.procedure
    .input<{ intervalSeconds?: number } | undefined>()
    .action(async ({ input }) => {
      return startScreenSessionRecording({
        intervalSeconds: input?.intervalSeconds,
      })
    }),

  stopScreenSessionRecording: t.procedure.action(async () => {
    const session = await stopScreenSessionRecording()
    let run: Awaited<ReturnType<typeof runAutoJournalOnce>> = null

    if (session?.capturedFrames && session.capturedFrames > 0) {
      try {
        const elapsedMs =
          session.endedAt && session.startedAt
            ? Math.max(0, session.endedAt - session.startedAt)
            : 0
        const windowMinutes = Math.max(1, Math.ceil(elapsedMs / 60000))

        // Ensure manual video stop produces an immediate auto-journal analysis.
        // If source mode is audio-only, force a temporary video run.
        const cfg = configStore.get()
        const sourceMode = cfg.autoJournalSourceMode ?? "both"
        if (sourceMode === "audio") {
          configStore.save({ ...cfg, autoJournalSourceMode: "video" })
          try {
            run = await runAutoJournalOnce(windowMinutes)
          } finally {
            configStore.save(cfg)
          }
        } else {
          run = await runAutoJournalOnce(windowMinutes)
        }
      } catch (error) {
        console.error("[screen-session] Failed to run auto-journal after stop:", error)
      }
    }

    return { session, run }
  }),

  openScreenSessionRecordingsDir: t.procedure.action(async () => {
    const dir = getScreenSessionRecordingsDir()
    shell.showItemInFolder(dir)
    return dir
  }),

  saveScreenSessionRecordingSettings: t.procedure
    .input<{
      enabled?: boolean
      intervalSeconds?: number
    }>()
    .action(async ({ input }) => {
      applyScreenSessionRecordingConfig({
        enabled: input.enabled,
        intervalSeconds: input.intervalSeconds,
      })
      await syncScreenSessionRecordingWithConfig()
      return getScreenSessionRecordingStatus()
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

  getAutonomousKanbanBoard: t.procedure.action(async () => {
    return getAutonomousKanbanBoard()
  }),

  refreshAutonomousKanban: t.procedure.action(async () => {
    return refreshAutonomousKanban()
  }),

  searchAutonomousKanbanMemory: t.procedure
    .input<{ query: string; maxResults?: number }>()
    .action(async ({ input }) => {
      return searchAutonomousKanbanMemory(input.query, input.maxResults ?? 6)
    }),

  getAutonomousKanbanStatus: t.procedure.action(async () => {
    return getAutonomousKanbanStatus()
  }),

  createKanbanCard: t.procedure
    .input<{ columnId: string; title: string; description?: string; bullets?: string[] }>()
    .action(async ({ input }) => {
      return createKanbanCard(input.columnId, {
        title: input.title,
        description: input.description,
        bullets: input.bullets,
      })
    }),

  updateKanbanCard: t.procedure
    .input<{ cardId: string; updates: { title?: string; description?: string; bullets?: string[]; status?: "open" | "done"; lane?: "pending" | "suggestions" | "automations" } }>()
    .action(async ({ input }) => {
      return updateKanbanCard(input.cardId, input.updates)
    }),

  deleteKanbanCard: t.procedure
    .input<{ cardId: string }>()
    .action(async ({ input }) => {
      return deleteKanbanCard(input.cardId)
    }),

  moveKanbanCard: t.procedure
    .input<{ cardId: string; toColumnId: string; position?: number }>()
    .action(async ({ input }) => {
      return moveKanbanCard(input.cardId, input.toColumnId, input.position)
    }),

  getAutonomousProfileBoard: t.procedure.action(async () => {
    return getAutonomousProfileBoard()
  }),

  refreshAutonomousProfile: t.procedure.action(async () => {
    return refreshAutonomousProfile()
  }),

  getAutonomousProfileStatus: t.procedure.action(async () => {
    return getAutonomousProfileStatus()
  }),

  // =========================================================================
  // LIFE OS / TELOS FRAMEWORK
  // =========================================================================

  getLifeContext: t.procedure.action(async () => {
    return getLifeContext()
  }),

  saveLifeContext: t.procedure
    .input<{ context: import("../shared/types").LifeContext }>()
    .action(async ({ input }) => {
      return updateLifeContext(input.context)
    }),

  getLifeAnalysis: t.procedure.action(async () => {
    return getLifeAnalysis()
  }),

  refreshLifeAnalysis: t.procedure
    .input<{ windowDays?: number } | undefined>()
    .action(async ({ input }) => {
      return refreshLifeAnalysis(input?.windowDays ?? 14)
    }),

  addWisdomEntry: t.procedure
    .input<{ text: string; source: "manual" | "auto"; sourceRunId?: string }>()
    .action(async ({ input }) => {
      return addWisdomEntry(input)
    }),

  deleteWisdomEntry: t.procedure
    .input<{ entryId: string }>()
    .action(async ({ input }) => {
      return deleteWisdomEntry(input.entryId)
    }),

  getAutonomousPromptContext: t.procedure
    .input<{ query: string; maxResults?: number }>()
    .action(async ({ input }) => {
      return getAutonomousPromptContext(input.query, input.maxResults ?? 4)
    }),

  checkOllamaStatus: t.procedure
    .input<{ baseUrl?: string } | undefined>()
    .action(async ({ input }) => {
      return checkOllamaStatus(input?.baseUrl)
    }),

  listOllamaEmbeddingModels: t.procedure
    .input<{ baseUrl?: string } | undefined>()
    .action(async ({ input }) => {
      return listOllamaEmbeddingModels(input?.baseUrl)
    }),

  pullOllamaEmbeddingModel: t.procedure
    .input<{ model: string; baseUrl?: string }>()
    .action(async ({ input }) => {
      return pullOllamaEmbeddingModel(input.model, input.baseUrl)
    }),

  getOllamaPullProgress: t.procedure
    .input<{ model: string }>()
    .action(async ({ input }) => {
      return getOllamaPullProgress(input.model)
    }),

  // =========================================================================
  // PERIODIC SCREENSHOT CAPTURE
  // =========================================================================

  /**
   * Get the current status of the periodic screenshot scheduler.
   */
  getPeriodicScreenshotStatus: t.procedure.action(async () => {
    return getPeriodicScreenshotStatus()
  }),

  /**
   * Manually capture a screenshot now (outside of schedule).
   */
  capturePeriodicScreenshotNow: t.procedure.action(async () => {
    return capturePeriodicScreenshotNow()
  }),

  /**
   * List periodic screenshots (newest first).
   */
  listPeriodicScreenshots: t.procedure
    .input<{ limit?: number } | undefined>()
    .action(async ({ input }) => {
      return listPeriodicScreenshots(input?.limit)
    }),

  /**
   * Delete a periodic screenshot by ID.
   */
  deletePeriodicScreenshot: t.procedure
    .input<{ id: string }>()
    .action(async ({ input }) => {
      return deletePeriodicScreenshot(input.id)
    }),

  /**
   * Get periodic screenshot settings.
   */
  getPeriodicScreenshotSettings: t.procedure.action(async () => {
    const cfg = configStore.get()
    return {
      periodicScreenshotEnabled: cfg.periodicScreenshotEnabled ?? false,
      periodicScreenshotIntervalMinutes:
        cfg.periodicScreenshotIntervalMinutes ?? 60,
      periodicScreenshotsDir: getPeriodicScreenshotsDir(),
    }
  }),

  /**
   * Save periodic screenshot settings (restarts scheduler if needed).
   */
  savePeriodicScreenshotSettings: t.procedure
    .input<{
      periodicScreenshotEnabled?: boolean
      periodicScreenshotIntervalMinutes?: number
    }>()
    .action(async ({ input }) => {
      const cfg = configStore.get()
      const wasEnabled = cfg.periodicScreenshotEnabled ?? false
      const willBeEnabled =
        input.periodicScreenshotEnabled ?? cfg.periodicScreenshotEnabled ?? false

      configStore.save({
        ...cfg,
        periodicScreenshotEnabled: willBeEnabled,
        periodicScreenshotIntervalMinutes:
          input.periodicScreenshotIntervalMinutes ??
          cfg.periodicScreenshotIntervalMinutes ??
          60,
      })

      // Restart scheduler with new settings
      if (willBeEnabled) {
        restartPeriodicScreenshotScheduler()
      } else if (wasEnabled && !willBeEnabled) {
        stopPeriodicScreenshotScheduler()
      }

      return getPeriodicScreenshotStatus()
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

  getSetting: t.procedure
    .input<{ key: string }>()
    .action(async ({ input }) => {
      return settings.get(input.key)
    }),

  setSetting: t.procedure
    .input<{ key: string; value: unknown }>()
    .action(async ({ input }) => {
      await settings.set(input.key, input.value as any)
    }),

  getPilesConfigPath: t.procedure.action(async () => {
    return pilesConfigPath
  }),

  readPilesConfig: t.procedure.action(async () => {
    try {
      return readPilesConfigSafeSync()
    } catch (error) {
      console.warn("[tipc] Failed to read piles config", error)
      return []
    }
  }),

  writePilesConfig: t.procedure
    .input<{ piles: Array<{ name: string; path: string; theme?: string }> }>()
    .action(async ({ input }) => {
      const dir = path.dirname(pilesConfigPath)
      await fs.promises.mkdir(dir, { recursive: true })
      await fs.promises.writeFile(
        pilesConfigPath,
        JSON.stringify(input.piles),
        "utf-8",
      )
    }),

  pathExists: t.procedure
    .input<{ targetPath: string }>()
    .action(async ({ input }) => {
      assertAllowedPath(input.targetPath)
      return fs.existsSync(input.targetPath)
    }),

  ensureDirectory: t.procedure
    .input<{ dirPath: string }>()
    .action(async ({ input }) => {
      assertAllowedPath(input.dirPath)
      await fs.promises.mkdir(input.dirPath, { recursive: true })
    }),

  readTextFile: t.procedure
    .input<{ filePath: string }>()
    .action(async ({ input }) => {
      assertAllowedPath(input.filePath)
      return fs.promises.readFile(input.filePath, "utf-8")
    }),

  writeTextFile: t.procedure
    .input<{ filePath: string; content: string }>()
    .action(async ({ input }) => {
      assertAllowedPath(input.filePath)
      await fs.promises.writeFile(input.filePath, input.content, "utf-8")
    }),

  deleteFilePath: t.procedure
    .input<{ filePath: string }>()
    .action(async ({ input }) => {
      assertAllowedPath(input.filePath)
      await fs.promises.unlink(input.filePath)
    }),

  matterParse: t.procedure
    .input<{ file: string }>()
    .action(async ({ input }) => {
      return matter(input.file)
    }),

  matterStringify: t.procedure
    .input<{ content: string; data: Record<string, unknown> }>()
    .action(async ({ input }) => {
      return matter.stringify(input.content, input.data)
    }),

  listFilesRecursively: t.procedure
    .input<{ dirPath: string }>()
    .action(async ({ input }) => {
      assertAllowedPath(input.dirPath)
      return pileHelper.getFilesInFolder(input.dirPath)
    }),

  selectDirectory: t.procedure.action(async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory"],
    })
    if (result.canceled) return null
    return result.filePaths?.[0] ?? null
  }),

  saveAttachmentFile: t.procedure
    .input<{ fileData: string; fileExtension: string; storePath: string }>()
    .action(async ({ input }) => {
      assertAllowedPath(input.storePath)
      const currentDate = new Date()
      const year = String(currentDate.getFullYear()).slice(-2)
      const month = String(currentDate.getMonth() + 1).padStart(2, "0")
      const day = String(currentDate.getDate()).padStart(2, "0")
      const hours = String(currentDate.getHours()).padStart(2, "0")
      const minutes = String(currentDate.getMinutes()).padStart(2, "0")
      const seconds = String(currentDate.getSeconds()).padStart(2, "0")
      const milliseconds = String(currentDate.getMilliseconds()).padStart(3, "0")
      const fileName = `${year}${month}${day}-${hours}${minutes}${seconds}${milliseconds}.${input.fileExtension}`
      const fullStorePath = path.join(
        input.storePath,
        String(currentDate.getFullYear()),
        currentDate.toLocaleString("default", { month: "short" }),
        "media",
      )
      const newFilePath = path.join(fullStorePath, fileName)

      const dataUrlParts = input.fileData.split(";base64,")
      const fileBuffer = Buffer.from(dataUrlParts[1], "base64")
      await fs.promises.mkdir(fullStorePath, { recursive: true })
      await fs.promises.writeFile(newFilePath, fileBuffer)
      return newFilePath
    }),

  openAttachmentFiles: t.procedure
    .input<{ storePath: string }>()
    .action(async ({ input }) => {
      assertAllowedPath(input.storePath)
      const selected = await dialog.showOpenDialog({
        properties: ["openFile", "multiSelections"],
        filters: [
          { name: "Images", extensions: ["jpg", "jpeg", "png", "gif", "svg"] },
          { name: "Movies", extensions: ["mp4", "mov"] },
        ],
      })
      if (selected.canceled) return []

      const attachments: string[] = []
      for (const [index, filePath] of (selected.filePaths || []).entries()) {
        const currentDate = new Date()
        const year = String(currentDate.getFullYear()).slice(-2)
        const month = String(currentDate.getMonth() + 1).padStart(2, "0")
        const day = String(currentDate.getDate()).padStart(2, "0")
        const hours = String(currentDate.getHours()).padStart(2, "0")
        const minutes = String(currentDate.getMinutes()).padStart(2, "0")
        const seconds = String(currentDate.getSeconds()).padStart(2, "0")
        const selectedFileName = filePath.split(/[/\\]/).pop()
        if (!selectedFileName) continue

        const extension = selectedFileName.split(".").pop()
        const fileName = `${year}${month}${day}-${hours}${minutes}${seconds}-${index}.${extension}`
        const fullStorePath = path.join(
          input.storePath,
          String(currentDate.getFullYear()),
          currentDate.toLocaleString("default", { month: "short" }),
          "media",
        )
        const newFilePath = path.join(fullStorePath, fileName)
        await fs.promises.mkdir(fullStorePath, { recursive: true })
        await fs.promises.copyFile(filePath, newFilePath)
        attachments.push(newFilePath)
      }

      return attachments
    }),

  indexLoad: t.procedure
    .input<{ pilePath: string }>()
    .action(async ({ input }) => pileIndex.load(input.pilePath)),

  indexGet: t.procedure.action(async () => pileIndex.get()),

  indexRegenerateEmbeddings: t.procedure.action(async () =>
    pileIndex.regenerateEmbeddings(),
  ),

  indexAdd: t.procedure
    .input<{ filePath: string }>()
    .action(async ({ input }) => pileIndex.add(input.filePath)),

  indexUpdate: t.procedure
    .input<{ filePath: string; data: Record<string, unknown> }>()
    .action(async ({ input }) => pileIndex.update(input.filePath, input.data)),

  indexSearch: t.procedure
    .input<{ query: string }>()
    .action(async ({ input }) => pileIndex.search(input.query)),

  indexVectorSearch: t.procedure
    .input<{ query: string; topN?: number }>()
    .action(async ({ input }) => {
      const parsedTopN = Number(input.topN ?? 50)
      const safeTopN = Number.isFinite(parsedTopN)
        ? Math.min(100, Math.max(1, parsedTopN))
        : 50
      return pileIndex.vectorSearch(input.query, safeTopN)
    }),

  indexGetThreadsAsText: t.procedure
    .input<{ filePaths: string[] }>()
    .action(async ({ input }) => {
      const results: unknown[] = []
      for (const filePath of input.filePaths || []) {
        const entry = pileIndex.getThreadAsText(filePath)
        if (entry) results.push(entry)
      }
      return results
    }),

  indexRemove: t.procedure
    .input<{ filePath: string }>()
    .action(async ({ input }) => pileIndex.remove(input.filePath)),

  tagsLoad: t.procedure
    .input<{ pilePath: string }>()
    .action(async ({ input }) => pileTags.load(input.pilePath)),

  tagsGet: t.procedure.action(async () => pileTags.get()),

  tagsSync: t.procedure
    .input<{ filePath: string }>()
    .action(async ({ input }) => {
      pileTags.sync(input.filePath)
      return pileTags.get()
    }),

  tagsAdd: t.procedure
    .input<{ tag: string; filePath: string }>()
    .action(async ({ input }) => pileTags.add(input.tag, input.filePath)),

  tagsRemove: t.procedure
    .input<{ tag: string; filePath: string }>()
    .action(async ({ input }) => pileTags.remove(input.tag, input.filePath)),

  highlightsLoad: t.procedure
    .input<{ pilePath: string }>()
    .action(async ({ input }) => pileHighlights.load(input.pilePath)),

  highlightsGet: t.procedure.action(async () => pileHighlights.get()),

  highlightsCreate: t.procedure
    .input<{ highlight: string }>()
    .action(async ({ input }) => pileHighlights.create(input.highlight)),

  highlightsDelete: t.procedure
    .input<{ highlight: string }>()
    .action(async ({ input }) => pileHighlights.delete(input.highlight)),

  linksGet: t.procedure
    .input<{ pilePath: string; url: string }>()
    .action(async ({ input }) => pileLinks.get(input.pilePath, input.url)),

  linksSet: t.procedure
    .input<{ pilePath: string; url: string; data: unknown }>()
    .action(async ({ input }) =>
      pileLinks.set(input.pilePath, input.url, input.data),
    ),

  getLinkPreview: t.procedure
    .input<{ url: string }>()
    .action(async ({ input }) => getLinkPreview(input.url)),

  getLinkContent: t.procedure
    .input<{ url: string }>()
    .action(async ({ input }) => getLinkContent(input.url)),

  saveConfig: t.procedure
    .input<{ config: Config }>()
    .action(async ({ input }) => {
      const prevConfig = configStore.get()
      const prevProvider = deriveSttProviderId(prevConfig)
      const prevDefault = prevConfig.defaultLocalModel
      const prevNanobotEnabled = prevConfig.nanobotEnabled === true
      configStore.save(input.config)
      const nextConfig = configStore.get()
      const nextProvider = deriveSttProviderId(nextConfig)
      const nextNanobotEnabled = nextConfig.nanobotEnabled === true
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

      if (prevNanobotEnabled !== nextNanobotEnabled) {
        if (nextNanobotEnabled) {
          console.log("[config] Nanobot enabled, starting runtime...")
          await startNanobotRuntime()
          // Nanobot cron now handles this schedule to avoid duplicated runs.
          stopAutoJournalScheduler()
        } else {
          console.log("[config] Nanobot disabled, stopping runtime...")
          await stopNanobotRuntime()
          // Restore classic scheduler when turning nanobot off.
          startAutoJournalScheduler()
        }
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
    const apiKey = (await getOpenrouterKey()) || config.openrouterApiKey

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

  // Legacy encrypted key compatibility (migration target from raw ipc channels)
  getAiKey: t.procedure.action(async () => getKey()),
  setAiKey: t.procedure
    .input<{ secretKey: string }>()
    .action(async ({ input }) => setKey(input.secretKey)),
  deleteAiKey: t.procedure.action(async () => deleteKey()),

  getOpenrouterKey: t.procedure.action(async () => getOpenrouterKey()),
  setOpenrouterKey: t.procedure
    .input<{ secretKey: string }>()
    .action(async ({ input }) => setOpenrouterKey(input.secretKey)),
  getOpenrouterModels: t.procedure.action(async () => getOpenrouterModels()),
  fetchOpenrouterModels: t.procedure.action(async () => fetchOpenrouterModels()),

  getGeminiKey: t.procedure.action(async () => getGeminiKey()),
  setGeminiKey: t.procedure
    .input<{ secretKey: string }>()
    .action(async ({ input }) => setGeminiKey(input.secretKey)),
  deleteGeminiKey: t.procedure.action(async () => deleteGeminiKey()),

  getGroqKey: t.procedure.action(async () => getGroqKey()),
  setGroqKey: t.procedure
    .input<{ secretKey: string }>()
    .action(async ({ input }) => setGroqKey(input.secretKey)),
  deleteGroqKey: t.procedure.action(async () => deleteGroqKey()),

  getDeepgramKey: t.procedure.action(async () => getDeepgramKey()),
  setDeepgramKey: t.procedure
    .input<{ secretKey: string }>()
    .action(async ({ input }) => setDeepgramKey(input.secretKey)),
  deleteDeepgramKey: t.procedure.action(async () => deleteDeepgramKey()),

  getCustomKey: t.procedure.action(async () => getCustomKey()),
  setCustomKey: t.procedure
    .input<{ secretKey: string }>()
    .action(async ({ input }) => setCustomKey(input.secretKey)),
  deleteCustomKey: t.procedure.action(async () => deleteCustomKey()),

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

  // Logging utilities
  getLogFilePath: t.procedure.action(async () => {
    const { getLogFilePath } = await import("./logger")
    return getLogFilePath()
  }),

  openLogFile: t.procedure.action(async () => {
    const { getLogFilePath } = await import("./logger")
    const logPath = getLogFilePath()
    shell.showItemInFolder(logPath)
  }),

  // Timer floating window
  showTimerWindow: t.procedure.action(async () => {
    const { showTimerWindow } = await import("./window")
    showTimerWindow()
  }),

  hideTimerWindow: t.procedure.action(async () => {
    const { hideTimerWindow } = await import("./window")
    hideTimerWindow()
  }),

  isTimerWindowVisible: t.procedure.action(async () => {
    const { isTimerWindowVisible } = await import("./window")
    return isTimerWindowVisible()
  }),

  getFocusSessionStatus: t.procedure.action(async () => {
    return getFocusSessionStatus()
  }),

  startFocusSession: t.procedure
    .input<{ label?: string; expectedDurationMs?: number } | undefined>()
    .action(async ({ input }) => {
      return startFocusSession({
        label: input?.label,
        expectedDurationMs: input?.expectedDurationMs,
      })
    }),

  pauseFocusSession: t.procedure
    .input<{ reason?: "paused" | "finished" | "cancelled" } | undefined>()
    .action(async ({ input }) => {
      return pauseFocusSession({ reason: input?.reason })
    }),

  resumeFocusSession: t.procedure
    .input<{ label?: string; expectedDurationMs?: number } | undefined>()
    .action(async ({ input }) => {
      return resumeFocusSession({
        label: input?.label,
        expectedDurationMs: input?.expectedDurationMs,
      })
    }),

  stopFocusSession: t.procedure
    .input<{ reason?: "paused" | "finished" | "cancelled" } | undefined>()
    .action(async ({ input }) => {
      return stopFocusSession({ reason: input?.reason })
    }),

  // Utility to get cross-platform documents folder path
  getDocumentsPath: t.procedure.action(async () => {
    return app.getPath("documents")
  }),

  // ===== Nanobot Agent =====

  getNanobotStatus: t.procedure.action(async () => {
    const { nanobotBridge } = await import("./services/nanobot-bridge-service")
    return nanobotBridge.status
  }),

  startNanobot: t.procedure.action(async () => {
    const status = await startNanobotRuntime()
    stopAutoJournalScheduler()
    return status
  }),

  stopNanobot: t.procedure.action(async () => {
    const status = await stopNanobotRuntime()
    startAutoJournalScheduler()
    return status
  }),

  restartNanobot: t.procedure.action(async () => {
    const status = await restartNanobotRuntime()
    stopAutoJournalScheduler()
    return status
  }),

  sendNanobotMessage: t.procedure
    .input<{ content: string; sessionId?: string }>()
    .action(async ({ input }) => {
      const { getHttpClient } = await import("./services/nanobot-gateway-client")
      const client = getHttpClient()
      if (!client) throw new Error("Nanobot not connected")
      return client.sendMessage(input.content, input.sessionId)
    }),

  getNanobotMemory: t.procedure.action(async () => {
    const { getHttpClient } = await import("./services/nanobot-gateway-client")
    const client = getHttpClient()
    if (!client) return ""
    return client.getMemory()
  }),

  resetNanobotMemory: t.procedure.action(async () => {
    const { getHttpClient } = await import("./services/nanobot-gateway-client")
    const client = getHttpClient()
    if (!client) throw new Error("Nanobot not connected")
    await client.resetMemory()
  }),

  getNanobotCronJobs: t.procedure.action(async () => {
    const { getHttpClient } = await import("./services/nanobot-gateway-client")
    const client = getHttpClient()
    if (!client) return []
    return client.listCronJobs()
  }),

  getNanobotToolsAndSkills: t.procedure.action(async () => {
    const { getHttpClient } = await import("./services/nanobot-gateway-client")
    const client = getHttpClient()
    if (!client) return { tools: [] as string[], skills: [] as string[] }
    try {
      const status = await client.getStatus() as {
        tool_names?: string[]
        workspace?: string
      }
      const tools: string[] = (status.tool_names || []) as string[]

      // List skill directories in workspace
      const fs = await import("fs")
      const path = await import("path")
      const skills: string[] = []
      const workspace = status.workspace || ""
      if (workspace) {
        const skillsDir = path.join(workspace, "skills")
        if (fs.existsSync(skillsDir)) {
          const entries = fs.readdirSync(skillsDir, { withFileTypes: true })
          for (const entry of entries) {
            if (entry.isDirectory()) {
              skills.push(entry.name)
            }
          }
        }
      }

      return { tools, skills }
    } catch {
      return { tools: [] as string[], skills: [] as string[] }
    }
  }),
}

export type Router = typeof router
