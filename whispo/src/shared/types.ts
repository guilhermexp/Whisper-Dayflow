import type { CHAT_PROVIDER_ID, STT_PROVIDER_ID } from "."

export type RecordingHistoryItem = {
  id: string
  createdAt: number
  duration: number
  transcript: string
  filePath: string
}

export type Config = {
  shortcut?: "hold-ctrl" | "ctrl-slash" | "instant-ctrl" | "fn-key"
  hideDockIcon?: boolean
  enableAudioCues?: boolean
  launchOnStartup?: boolean

  sttProviderId?: STT_PROVIDER_ID

  openaiApiKey?: string
  openaiBaseUrl?: string

  groqApiKey?: string
  groqBaseUrl?: string

  geminiApiKey?: string
  geminiBaseUrl?: string

  transcriptPostProcessingEnabled?: boolean
  transcriptPostProcessingProviderId?: CHAT_PROVIDER_ID
  transcriptPostProcessingPrompt?: string

  // Whether to preserve clipboard content when transcribing (default: true)
  preserveClipboard?: boolean

  // Local model configuration
  defaultLocalModel?: string
  localModelsDirectory?: string
  autoDownloadRecommended?: boolean
  enableModelWarmup?: boolean
  maxConcurrentDownloads?: number
  downloadBandwidthLimit?: number
  localInferenceThreads?: number
  enableGPUAcceleration?: boolean
  preferLocalModels?: boolean
}
