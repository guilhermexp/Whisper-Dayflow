import type { CHAT_PROVIDER_ID, STT_PROVIDER_ID } from "."

export type RecordingAudioProfile = {
  /** Highest normalized RMS value captured during recording (0-1) */
  peakLevel: number | null
  /** Average normalized RMS value during the entire session (0-1) */
  averageLevel: number | null
  /** Ratio (0-1) representing how much of the session was considered silence */
  silenceRatio: number | null
  /** Number of RMS samples that composed the profile */
  sampleCount: number
}

export type RecordingHistoryItem = {
  id: string
  createdAt: number
  duration: number
  transcript: string
  filePath: string
  fileSize?: number
  transcriptWordCount?: number
  transcriptCharacterCount?: number
  wordsPerMinute?: number
  providerId?: STT_PROVIDER_ID | string
  hasPostProcessing?: boolean
  llmProviderId?: CHAT_PROVIDER_ID | "custom"
  processingTimeMs?: number
  transcriptionLatencyMs?: number
  postProcessingTimeMs?: number
  accuracyScore?: number | null
  confidenceScore?: number | null
  tags?: string[]
  audioProfile?: RecordingAudioProfile
}

export type RecordingHistorySearchFilters = {
  text?: string
  mustInclude?: string[]
  mustNotInclude?: string[]
  searchMode?: "full-text" | "fuzzy" | "semantic" | "regex"
  booleanOperator?: "and" | "or"
  dateRange?: { from?: number; to?: number }
  durationMsRange?: { min?: number; max?: number }
  transcriptLengthRange?: { min?: number; max?: number }
  wordCountRange?: { min?: number; max?: number }
  confidenceRange?: { min?: number; max?: number }
  tags?: string[]
  excludeTags?: string[]
  audioProfile?: {
    minAverageLevel?: number
    maxAverageLevel?: number
    maxSilenceRatio?: number
  }
  pagination?: { offset?: number; limit?: number }
  sortBy?: "createdAt" | "duration" | "confidence" | "processingTime"
  sortDirection?: "asc" | "desc"
}

export type RecordingHistoryItemHighlight = {
  preview: string
  matches: string[]
}

export type RecordingHistorySearchResult = {
  items: Array<RecordingHistoryItem & { highlight?: RecordingHistoryItemHighlight }>
  total: number
  stats: {
    totalDurationMs: number
    averageProcessingTimeMs: number | null
    averageConfidence: number | null
  }
  appliedFilters: RecordingHistorySearchFilters
}

export type RecordingAnalyticsSnapshot = {
  generatedAt: number
  totals: {
    recordings: number
    durationMs: number
    averageSessionMs: number
    averageAccuracy: number | null
    averageWpm: number | null
  }
  timeline: Array<{
    date: string
    count: number
    durationMs: number
    averageProcessingTimeMs: number | null
    averageAccuracy: number | null
  }>
  peakHours: Array<{ hour: number; count: number }>
  providerBreakdown: Array<{ providerId: string; count: number; durationMs: number }>
  productivity: {
    wordsPerMinute: {
      average: number | null
      median: number | null
      trend: number | null
    }
    processingTimeMs: {
      average: number | null
      percentile95: number | null
    }
  }
  tags: Array<{ tag: string; count: number }>
}

export type SavedRecordingSearch = {
  id: string
  name: string
  filters: RecordingHistorySearchFilters
  createdAt: number
  lastUsedAt: number
  usageCount: number
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
