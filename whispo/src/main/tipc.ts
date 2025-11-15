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
} from "electron"
import path from "path"
import { configStore, recordingsFolder } from "./config"
import { modelManager } from "./model-manager"
import { Config, RecordingHistoryItem } from "../shared/types"
import { RendererHandlers } from "./renderer-handlers"
import { postProcessTranscript } from "./llm"
import { abortOngoingTranscription, state } from "./state"
import { updateTrayIcon } from "./tray"
import { isAccessibilityGranted } from "./utils"
import { writeText } from "./keyboard"
import { clipboardManager } from "./clipboard-manager"
import { transcribeWithLocalModel } from "./local-transcriber"

const t = tipc.create()

const getRecordingHistory = () => {
  try {
    const history = JSON.parse(
      fs.readFileSync(path.join(recordingsFolder, "history.json"), "utf8"),
    ) as RecordingHistoryItem[]

    // sort desc by createdAt
    return history.sort((a, b) => b.createdAt - a.createdAt)
  } catch {
    return []
  }
}

const saveRecordingsHitory = (history: RecordingHistoryItem[]) => {
  fs.writeFileSync(
    path.join(recordingsFolder, "history.json"),
    JSON.stringify(history),
  )
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
  openai: "OpenAI Whisper (whisper-1)",
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
            (model.provider === "local" || model.provider === "local-imported") &&
            model.id === localModelId,
        )

        if (target) {
          const origin =
            target.provider === "local-imported" ? "imported local model" : "local catalog model"
          return {
            providerId,
            description: `${origin}: ${target.displayName} [${target.id}]`,
          }
        }
      } catch (error) {
        console.warn("[transcription] Failed to resolve local model metadata", error)
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

  requestAccesssbilityAccess: t.procedure.action(async () => {
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
      const recordingId = Date.now().toString()
      const recordingBuffer = Buffer.from(input.recording)
      const providerId = deriveSttProviderId(config)
      const isLocalProvider = providerId.startsWith(LOCAL_PROVIDER_PREFIX)
      const localModelId = isLocalProvider
        ? providerId.slice(LOCAL_PROVIDER_PREFIX.length) ||
          config.defaultLocalModel
        : undefined
      const mimeType = input.mimeType || "audio/wav"
      const fileExtension = mimeType === "audio/wav" ? "wav" : "webm"

      console.log(
        `[transcription] createRecording provider=${providerId} defaultLocal=${config.defaultLocalModel ?? "none"} mime=${mimeType}`,
      )

      try {
        let baseTranscript: string | undefined

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
          console.log(
            `[transcription] Using cloud provider ${providerId}`,
          )
          const form = new FormData()
          form.append(
            "file",
            new File([recordingBuffer], `recording.${fileExtension}`, {
              type: mimeType,
            }),
          )
          form.append("model", providerId === "groq" ? "whisper-large-v3" : "whisper-1")
          form.append("response_format", "json")

          const groqBaseUrl =
            config.groqBaseUrl || "https://api.groq.com/openai/v1"
          const openaiBaseUrl =
            config.openaiBaseUrl || "https://api.openai.com/v1"

          const transcriptResponse = await fetch(
            providerId === "groq"
              ? `${groqBaseUrl}/audio/transcriptions`
              : `${openaiBaseUrl}/audio/transcriptions`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${providerId === "groq" ? config.groqApiKey : config.openaiApiKey}`,
              },
              body: form,
              signal: controller.signal,
            },
          )

          if (!transcriptResponse.ok) {
            const raw = await transcriptResponse.text()
            throw new Error(
              normalizeProviderError.stt(transcriptResponse, raw),
            )
          }

          const json: { text: string } = await transcriptResponse.json()
          baseTranscript = json.text
        }

        transcript = await postProcessTranscript(baseTranscript, {
          signal: controller.signal,
        })
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
      }

      if (!transcript) {
        return
      }

      // Update lastTranscription state
      state.lastTranscription = transcript

      const history = getRecordingHistory()
      const item: RecordingHistoryItem = {
        id: recordingId,
        createdAt: Date.now(),
        duration: input.duration,
        transcript,
        filePath: path.join(recordingsFolder, `${recordingId}.${fileExtension}`),
      }
      history.push(item)
      saveRecordingsHitory(history)

      fs.writeFileSync(
        path.join(recordingsFolder, `${item.id}.${fileExtension}`),
        recordingBuffer,
      )

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

  getRecordingHistory: t.procedure.action(async () => getRecordingHistory()),

  deleteRecordingItem: t.procedure
    .input<{ id: string }>()
    .action(async ({ input }) => {
      const recordings = getRecordingHistory().filter(
        (item) => item.id !== input.id,
      )
      saveRecordingsHitory(recordings)
      const wavPath = path.join(recordingsFolder, `${input.id}.wav`)
      const legacyPath = path.join(recordingsFolder, `${input.id}.webm`)
      if (fs.existsSync(wavPath)) {
        fs.unlinkSync(wavPath)
      } else if (fs.existsSync(legacyPath)) {
        fs.unlinkSync(legacyPath)
      }
    }),

  deleteRecordingHistory: t.procedure.action(async () => {
    fs.rmSync(recordingsFolder, { force: true, recursive: true })
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
      filters: [{ name: "Whisper GGML/GGUF models", extensions: ["bin", "ggml", "gguf"] }],
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
